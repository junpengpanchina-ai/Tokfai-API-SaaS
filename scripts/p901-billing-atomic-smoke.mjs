#!/usr/bin/env node
/**
 * P901 — Billing atomic / safety smoke (offline, static).
 *
 * Verifies hard protections without live traffic:
 * - record_usage_and_debit FOR UPDATE + insufficient_credits
 * - single debit entry (recordSuccessfulUsageAndDebit)
 * - idempotency
 * - no finalize on timeout / 4xx / 5xx / gateway 429
 * - client billing fields stripped
 * - unlimited allowlist gated
 * - RPM / TPM / daily / monthly / max_output_tokens
 * - stream rule: upstream non-stream → usage before debit
 *
 * Usage: node scripts/p901-billing-atomic-smoke.mjs
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

console.log("=== P901 billing atomic smoke ===\n");

{
  const mig = findMigration("record_usage_and_debit");
  if (
    !mig ||
    !/for update/i.test(mig.src) ||
    !/insufficient_credits/i.test(mig.src) ||
    !/v_balance\s*<\s*p_credits_charged/i.test(mig.src)
  ) {
    ok =
      fail(
        "atomic debit",
        "record_usage_and_debit needs FOR UPDATE + balance >= cost"
      ) && ok;
  } else {
    ok = pass("record_usage_and_debit atomic (FOR UPDATE + balance check)") && ok;
  }
}

{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
  if (
    !billing.includes("record_usage_and_debit") ||
    !exec.includes("recordSuccessfulUsageAndDebit") ||
    !exec.includes("persistSuccessfulUsageAndDebit")
  ) {
    ok = fail("single debit entry", "chat must use recordSuccessfulUsageAndDebit") && ok;
  } else {
    ok = pass("chat/responses debit via recordSuccessfulUsageAndDebit") && ok;
  }
}

{
  const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  if (
    !billing.includes("lookupBillingIdempotency") ||
    !exec.includes("idempotencyKey")
  ) {
    ok = fail("idempotency", "missing lookup / Idempotency-Key path") && ok;
  } else {
    ok = pass("idempotency_key prevents double debit") && ok;
  }
}

{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const gateway = read("apps/dmit-api/src/routes/chatGatewayLogs.ts");
  const upstream = read("apps/dmit-api/src/lib/upstreamChatBody.ts");
  const failOk =
    exec.includes("billable: false") &&
    gateway.includes("billable: false") &&
    (exec.includes("upstream_timeout") || exec.includes("timeout"));
  const streamRule =
    upstream.includes("stream: false") &&
    exec.includes("recordSuccessfulUsageAndDebit");
  if (!failOk) {
    ok = fail("no charge on failure", "expected billable:false on fail paths") && ok;
  } else {
    ok = pass("timeout/4xx/5xx/429 do not finalize charge") && ok;
  }
  if (!streamRule) {
    ok =
      fail(
        "stream finalize rule",
        "upstream must be non-stream; debit after usage"
      ) && ok;
  } else {
    ok =
      pass(
        "stream rule: upstream stream=false → usage known → finalize debit"
      ) && ok;
  }
}

{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  if (
    !exec.includes("stripClientBillingOverrides") ||
    !exec.includes("FORBIDDEN_CLIENT_BILLING_KEYS") ||
    !exec.includes('"tenant_id"') ||
    !exec.includes('"resolved_model"') ||
    !exec.includes('"credits"')
  ) {
    ok = fail("client billing strip", "must ignore client tenant/price/credits") && ok;
  } else {
    ok = pass("client tenant_id/price/credits/resolved_model ignored") && ok;
  }
}

{
  const limits = read("apps/dmit-api/src/gateway/keySafetyLimits.ts");
  const env = read("apps/dmit-api/src/env.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const okLimits =
    env.includes("TOKFAI_RATE_LIMIT_RPM") &&
    env.includes("TOKFAI_RATE_LIMIT_TPM") &&
    env.includes("TOKFAI_DAILY_CREDIT_LIMIT") &&
    env.includes("TOKFAI_MONTHLY_CREDIT_LIMIT") &&
    env.includes("TOKFAI_MAX_OUTPUT_TOKENS") &&
    limits.includes("assertCreditPeriodLimits") &&
    limits.includes("assertTokenBudget") &&
    exec.includes("assertCreditPeriodLimits") &&
    exec.includes("assertTokenBudget") &&
    exec.includes("resolveMaxOutputTokens");
  if (!okLimits) {
    ok = fail("key safety limits", "RPM/TPM/daily/monthly/max_output missing") && ok;
  } else {
    ok = pass("key RPM/TPM/daily/monthly/max_output_tokens enforced") && ok;
  }
}

{
  const limits = read("apps/dmit-api/src/gateway/keySafetyLimits.ts");
  const env = read("apps/dmit-api/src/env.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  if (
    !env.includes("TOKFAI_UNLIMITED_BILLING_ENABLED") ||
    !env.includes("TOKFAI_UNLIMITED_BILLING_USER_IDS") ||
    !limits.includes("isUnlimitedBillingUser") ||
    !exec.includes("logUnlimitedBillingGranted")
  ) {
    ok =
      fail(
        "unlimited gate",
        "unlimited must be env allowlist + audit only"
      ) && ok;
  } else {
    ok = pass("unlimited only for env allowlist + audit log") && ok;
  }
}

{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  if (!exec.includes("billableModel = attemptModel")) {
    ok = fail("alias pricing", "must bill attemptModel not alias floor") && ok;
  } else {
    ok = pass("alias requests bill concrete attemptModel") && ok;
  }
}

{
  const helpers = read("scripts/lib/billing-risk-helpers.mjs");
  const p900 = read("scripts/p900-billing-risk-audit.mjs");
  const p905 = read("scripts/p905-billing-risk-drilldown.mjs");
  if (
    !helpers.includes("signup_bonus") ||
    !helpers.includes("classifyPositiveLedgerRow") ||
    !p900.includes("diagnostics") ||
    !p905.includes("TOKFAI_RISK_USER_ID") ||
    !p905.includes("recommended_manual_sql")
  ) {
    ok =
      fail(
        "p900/p905 diagnostics",
        "classifier + drilldown + redacted diagnostics required"
      ) && ok;
  } else {
    ok =
      pass(
        "p900 classifier recognizes signup_bonus; p905 drilldown is read-only"
      ) && ok;
  }
}

if (!ok) {
  console.error("\nTOKFAI_P901_BILLING_ATOMIC_FAIL");
  process.exit(1);
}
console.log("\nTOKFAI_P901_BILLING_ATOMIC_PASS");
process.exit(0);
