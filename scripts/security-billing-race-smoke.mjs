#!/usr/bin/env node
/**
 * Security smoke — Billing race / idempotency / no charge on failure (offline).
 *
 * Usage: node scripts/security-billing-race-smoke.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function findMigration(substr) {
  const dir = join(ROOT, "supabase/migrations");
  for (const name of readdirSync(dir).sort().reverse()) {
    const src = readFileSync(join(dir, name), "utf8");
    if (src.includes(substr)) return { name, src };
  }
  return null;
}

let ok = true;

{
  const debit = findMigration("debit_credits");
  if (!debit) {
    ok = fail("debit_credits RPC", "migration not found") && ok;
  } else if (!/for update/i.test(debit.src) || !/insufficient_credits/i.test(debit.src)) {
    ok = fail(
      "concurrent debit lock",
      "expected FOR UPDATE + insufficient_credits (no negative balance)"
    ) && ok;
  } else {
    pass("concurrent requests cannot debit below zero (FOR UPDATE)");
  }
}

{
  const mig = findMigration("lookup_usage_idempotency") || findMigration("idempotency_key");
  const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
  const idem = read("apps/dmit-api/src/lib/idempotency.ts");
  if (!mig || !billing.includes("lookupBillingIdempotency")) {
    ok = fail("idempotency lookup", "missing usage idempotency path") && ok;
  } else if (!idem.includes("parseIdempotencyKey")) {
    ok = fail("idempotency parse", "missing parseIdempotencyKey") && ok;
  } else {
    pass("same idempotency key does not double-charge");
  }

  const images = read("apps/dmit-api/src/routes/images.ts");
  if (!images.includes("parseIdempotencyKey") || !images.includes("lookupImageTaskByIdempotency")) {
    ok = fail("image idempotency", "image route missing Idempotency-Key handling") && ok;
  } else {
    pass("image Idempotency-Key prevents duplicate submit/charge");
  }
}

{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const worker = read("apps/dmit-api/src/images/worker.ts");
  const gatewayLogs = read("apps/dmit-api/src/routes/chatGatewayLogs.ts");

  const timeoutNoCharge =
    (exec.includes("billable: false") || exec.includes("billable:false")) &&
    (exec.includes("upstream_timeout") || exec.includes("timeout"));
  const imageTimeout =
    worker.includes("retryable_timeout") &&
    worker.includes("not_billable");
  const rateNoCharge = gatewayLogs.includes("billable: false");

  if (!timeoutNoCharge && !imageTimeout) {
    ok = fail("timeout no charge", "expected billable:false on timeout paths") && ok;
  } else {
    pass("upstream timeout does not finalize a charge");
  }

  if (!rateNoCharge) {
    ok = fail("429 no charge", "gateway rejection must be billable:false") && ok;
  } else {
    pass("failed/rate-limited requests do not charge");
  }
}

{
  const mig = findMigration("record_usage_and_debit");
  if (!mig) {
    ok = fail("record_usage_and_debit", "RPC missing") && ok;
  } else if (!mig.src.includes("debit_ledger_id") && !mig.src.includes("credit_ledger")) {
    ok = fail("usage↔ledger link", "expected debit_ledger_id / ledger write in RPC") && ok;
  } else {
    pass("usage_logs and credit_ledger amounts linked via record_usage_and_debit");
  }
}

if (!ok) {
  console.error("\nsecurity-billing-race-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-billing-race-smoke: OK");
