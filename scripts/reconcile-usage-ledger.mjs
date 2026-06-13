#!/usr/bin/env node
/**
 * P765 — Usage vs credit_ledger reconciliation (report only).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-usage-ledger.mjs
 *
 * Optional env:
 *   DRY_RUN=1              default true — set to 0/false to label output as live report
 *   LOOKBACK_HOURS         default 168 (7 days)
 *   LIMIT                  default 500 rows per check
 */

import {
  createSupabaseAdminClient,
  requireSupabaseAdminEnv,
} from "./lib/supabase-admin.mjs";
const DRY_RUN =
  process.env.DRY_RUN !== "0" &&
  process.env.DRY_RUN !== "false" &&
  process.env.DRY_RUN !== "live";
const LOOKBACK_HOURS = Math.max(
  1,
  parseInt(process.env.LOOKBACK_HOURS ?? "168", 10) || 168
);
const LIMIT = Math.max(
  10,
  parseInt(process.env.LIMIT ?? "500", 10) || 500
);

function sinceIso() {
  return new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

async function findChargedUsageWithoutDebit(supabase, since) {
  const { data: logs, error } = await supabase
    .from("usage_logs")
    .select("id, request_id, user_id, credits_charged, billing_status, created_at")
    .gte("created_at", since)
    .in("billing_status", ["charged", "pending"])
    .gt("credits_charged", 0)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) throw new Error(error.message);

  const anomalies = [];
  for (const row of logs ?? []) {
    const { data: debits, error: debitError } = await supabase
      .from("credit_ledger")
      .select("id, amount, reference_id")
      .eq("type", "debit")
      .eq("reference_id", row.request_id)
      .limit(1);

    if (debitError) throw new Error(debitError.message);

    if (!debits?.length) {
      anomalies.push({
        kind: "charged_usage_missing_debit",
        usage_log_id: row.id,
        request_id: row.request_id,
        user_id: row.user_id,
        credits_charged: row.credits_charged,
        billing_status: row.billing_status,
        created_at: row.created_at,
      });
    }
  }

  return anomalies;
}

async function findNonBillableWithDebit(supabase, since) {
  const { data: logs, error } = await supabase
    .from("usage_logs")
    .select("id, request_id, user_id, billing_status, billable, status, created_at")
    .gte("created_at", since)
    .or("billing_status.eq.not_billable,billable.eq.false")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) throw new Error(error.message);

  const anomalies = [];
  for (const row of logs ?? []) {
    if (!row.request_id) continue;

    const { data: debits, error: debitError } = await supabase
      .from("credit_ledger")
      .select("id, amount, reference_id")
      .eq("type", "debit")
      .eq("reference_id", row.request_id)
      .limit(1);

    if (debitError) throw new Error(debitError.message);

    if (debits?.length) {
      anomalies.push({
        kind: "non_billable_usage_has_debit",
        usage_log_id: row.id,
        request_id: row.request_id,
        user_id: row.user_id,
        billing_status: row.billing_status,
        billable: row.billable,
        status: row.status,
        debit_id: debits[0].id,
        debit_amount: debits[0].amount,
        created_at: row.created_at,
      });
    }
  }

  return anomalies;
}

async function findBatchCreditMismatches(supabase, since) {
  const { data: batches, error } = await supabase
    .from("chat_batches")
    .select("id, credits_charged, total_items, status, created_at")
    .gte("created_at", since)
    .in("status", ["completed", "partial_failed", "failed", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) throw new Error(error.message);

  const anomalies = [];
  for (const batch of batches ?? []) {
    const { data: items, error: itemsError } = await supabase
      .from("chat_batch_items")
      .select("credits_charged")
      .eq("batch_id", batch.id);

    if (itemsError) throw new Error(itemsError.message);

    const itemSum = (items ?? []).reduce(
      (sum, item) => sum + Number(item.credits_charged ?? 0),
      0
    );
    const headerCredits = Number(batch.credits_charged ?? 0);
    const roundedItemSum = Math.ceil(itemSum * 1_000_000) / 1_000_000;

    if (Math.abs(roundedItemSum - headerCredits) > 0.000001) {
      anomalies.push({
        kind: "batch_credits_mismatch",
        batch_id: batch.id,
        batch_credits_charged: headerCredits,
        items_credits_sum: roundedItemSum,
        total_items: batch.total_items,
        status: batch.status,
        created_at: batch.created_at,
      });
    }
  }

  return anomalies;
}

function printAnomalies(title, rows) {
  console.log(`${title}: ${rows.length}`);
  for (const row of rows.slice(0, 20)) {
    console.log(`  - ${JSON.stringify(row)}`);
  }
  if (rows.length > 20) {
    console.log(`  … and ${rows.length - 20} more`);
  }
  console.log("");
}

async function main() {
  requireSupabaseAdminEnv();

  const since = sinceIso();
  const supabase = createSupabaseAdminClient();

  console.log("=== P765 usage / ledger reconcile (report only) ===");
  console.log(`mode:           ${DRY_RUN ? "dry-run (report only)" : "live report"}`);
  console.log(`lookback_hours: ${LOOKBACK_HOURS}`);
  console.log(`since:          ${since}`);
  console.log(`limit:          ${LIMIT} per check`);
  console.log("");

  const [missingDebit, nonBillableDebit, batchMismatch] = await Promise.all([
    findChargedUsageWithoutDebit(supabase, since),
    findNonBillableWithDebit(supabase, since),
    findBatchCreditMismatches(supabase, since),
  ]);

  printAnomalies("A. Charged usage without debit", missingDebit);
  printAnomalies("B. Non-billable usage with debit", nonBillableDebit);
  printAnomalies("C. Batch header vs items credits mismatch", batchMismatch);

  const total =
    missingDebit.length + nonBillableDebit.length + batchMismatch.length;

  if (total === 0) {
    console.log("No anomalies found in lookback window.");
    return;
  }

  console.log(`Total anomalies: ${total}`);
  console.log("No automatic fixes applied — use admin-adjust-credits.mjs if needed.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
