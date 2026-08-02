/**
 * P993 — Read-only image task / ledger diagnostic.
 *
 * Usage:
 *   pnpm tsx scripts/inspect-image-task.ts <task_id>
 *   # or: cd apps/dmit-api && npx tsx ../../scripts/inspect-image-task.ts <task_id>
 *
 * Loads SUPABASE_* from apps/dmit-api/.env when present.
 * Does NOT modify the database.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const taskId = (process.argv[2] ?? "").trim();

if (!taskId) {
  console.error("Usage: pnpm tsx scripts/inspect-image-task.ts <task_id>");
  process.exit(2);
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, "apps/dmit-api/.env"));
loadEnvFile(join(ROOT, ".env"));

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load apps/dmit-api/.env)."
  );
  process.exit(2);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function firstUrl(resultData: unknown): string | null {
  if (!Array.isArray(resultData)) return null;
  for (const item of resultData) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const url = (item as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

async function main(): Promise<void> {
  const { data: task, error: taskError } = await sb
    .from("image_generation_tasks")
    .select(
      "request_id, provider_task_id, upstream_id, status, progress, billing_status, credits_charged, result_data, error_code, error_message, reconcile_status, reconcile_result, created_at, completed_at, model, user_id"
    )
    .eq("request_id", taskId)
    .maybeSingle();

  if (taskError) {
    console.error("image_generation_tasks query failed:", taskError.message);
    process.exit(1);
  }
  if (!task) {
    console.error(`No image_generation_tasks row for request_id=${taskId}`);
    process.exit(1);
  }

  const requestId = String(task.request_id);
  const finalUrl = firstUrl(task.result_data);

  // Ledger: debit rows keyed by reference_id = request_id (image task id).
  const { data: ledgerRows, error: ledgerError } = await sb
    .from("credit_ledger")
    .select("id, type, amount, reason, reference_id, created_at")
    .eq("reference_id", requestId)
    .eq("type", "debit");

  if (ledgerError) {
    console.error("credit_ledger query failed:", ledgerError.message);
    process.exit(1);
  }

  const debits = ledgerRows ?? [];
  const debitTotal = debits.reduce((sum, row) => {
    const n = Number(row.amount ?? 0);
    return sum + (Number.isFinite(n) ? Math.abs(n) : 0);
  }, 0);

  const { data: usageRows, error: usageError } = await sb
    .from("usage_logs")
    .select(
      "id, request_id, status, billing_status, credits_charged, error_code, created_at"
    )
    .eq("request_id", requestId);

  if (usageError) {
    console.error("usage_logs query failed:", usageError.message);
    process.exit(1);
  }

  const duplicateDebit = debits.length > 1;

  const report = {
    image_task: {
      request_id: requestId,
      provider_task_id: task.provider_task_id ?? null,
      upstream_id: task.upstream_id ?? null,
      status: task.status,
      progress: task.progress,
      billing_status: task.billing_status,
      credits_charged: task.credits_charged,
      final_url: finalUrl,
      error_code: task.error_code ?? null,
      error_message: task.error_message ?? null,
      reconcile_status: task.reconcile_status ?? null,
      reconcile_result: task.reconcile_result ?? null,
      model: task.model,
      user_id: task.user_id,
      created_at: task.created_at,
      completed_at: task.completed_at ?? null,
    },
    ledger: {
      matching_debit_count: debits.length,
      debit_total_credits: debitTotal,
      duplicate_debit: duplicateDebit,
      rows: debits,
    },
    usage_logs: {
      count: (usageRows ?? []).length,
      rows: usageRows ?? [],
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (duplicateDebit) {
    console.error("WARN: duplicate debit rows for this task_id/request_id");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
