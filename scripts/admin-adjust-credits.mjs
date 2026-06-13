#!/usr/bin/env node
/**
 * P765 — Ops credit ledger adjustment (grant / reverse).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/admin-adjust-credits.mjs grant \
 *       --user-id=<uuid> --amount=10 --note="promo credit"
 *
 *   node scripts/admin-adjust-credits.mjs reverse \
 *     --user-id=<uuid> --amount=0.001 --note="refund bad debit" \
 *     --reference-request-id=req_abc123
 *
 * Options:
 *   --user-id                 target auth.users.id (required)
 *   --amount                  positive number (required)
 *   --note                    reason text (required)
 *   --reference-request-id    optional usage_logs.request_id link
 *   --idempotency-key         optional; default derived from kind + user + amount + note
 */

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  requireSupabaseAdminEnv,
} from "./lib/supabase-admin.mjs";

function parseArgs(argv) {
  const kind = argv[2];
  const flags = {};
  for (const arg of argv.slice(3)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      flags[match[1]] = match[2];
    }
  }
  return { kind, flags };
}

function defaultIdempotencyKey(kind, flags) {
  const seed = [
    kind,
    flags["user-id"] ?? "",
    flags.amount ?? "",
    flags.note ?? "",
    flags["reference-request-id"] ?? "",
  ].join("|");
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

async function main() {
  requireSupabaseAdminEnv();

  const { kind, flags } = parseArgs(process.argv);
  if (kind !== "grant" && kind !== "reverse") {
    console.error("Usage: admin-adjust-credits.mjs <grant|reverse> --user-id=... --amount=... --note=...");
    process.exit(1);
  }

  const userId = flags["user-id"];
  const amount = Number(flags.amount);
  const note = flags.note;
  const referenceRequestId = flags["reference-request-id"] ?? null;
  const idempotencyKey =
    flags["idempotency-key"] ?? defaultIdempotencyKey(kind, flags);

  if (!userId) {
    console.error("Missing --user-id");
    process.exit(1);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Invalid --amount (must be positive number)");
    process.exit(1);
  }
  if (!note || !note.trim()) {
    console.error("Missing --note");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();

  console.log("=== P765 admin credit adjustment ===");
  console.log(`kind:       ${kind}`);
  console.log(`user_id:    ${userId}`);
  console.log(`amount:     ${amount}`);
  console.log(`note:       ${note}`);
  console.log(`request_id: ${referenceRequestId ?? "(none)"}`);
  console.log(`idempotency_key: ${idempotencyKey.slice(0, 8)}…`);
  console.log("");

  const { data, error } = await supabase.rpc("ops_ledger_adjustment", {
    p_user_id: userId,
    p_kind: kind,
    p_amount: amount,
    p_note: note,
    p_reference_request_id: referenceRequestId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    console.error("Adjustment failed:", error.message);
    process.exit(1);
  }

  if (!data?.ok) {
    console.error("Adjustment rejected:", data?.error ?? "unknown");
    process.exit(1);
  }

  console.log("Result:");
  console.log(`  ok:                ${data.ok}`);
  console.log(`  idempotent_replay: ${data.idempotent_replay ?? false}`);
  console.log(`  credit_ledger_id:  ${data.credit_ledger_id ?? "(none)"}`);
  console.log(`  reference_id:      ${data.reference_id ?? "(none)"}`);
  console.log(`  balance_after:     ${data.balance_after ?? "(unknown)"}`);
  console.log("");
  console.log("Adjustment complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
