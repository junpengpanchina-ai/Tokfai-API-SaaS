#!/usr/bin/env node
/**
 * P900 — Tokfai billing risk audit (read-only).
 *
 * Offline (default): static source / migration / bundle checks.
 * Live DB (optional): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → read-only queries.
 *
 * Output never includes full API keys or secrets.
 *
 * Usage:
 *   node scripts/p900-billing-risk-audit.mjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/p900-billing-risk-audit.mjs
 *   TOKFAI_RISK_USER_ID=... node scripts/p905-billing-risk-drilldown.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPositiveLedgerRow,
  redactEmail,
  redactId,
  recommendedActionForLargeBalance,
  recommendedActionForUnaccountedLedger,
  toNumber,
} from "./lib/billing-risk-helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKBACK_HOURS = Math.max(
  1,
  parseInt(process.env.LOOKBACK_HOURS ?? "168", 10) || 168
);
const LIMIT = Math.max(10, parseInt(process.env.LIMIT ?? "200", 10) || 200);
const BALANCE_THRESHOLD = Math.max(
  1,
  parseFloat(process.env.BALANCE_ANOMALY_THRESHOLD ?? "1000000") || 1_000_000
);
const UNLIMITED_IDS = new Set(
  (process.env.TOKFAI_UNLIMITED_BILLING_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const findings = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function addFinding({
  risk_level,
  risk_name,
  count,
  samples = [],
  recommended_action,
  diagnostics = null,
}) {
  findings.push({
    risk_level,
    risk_name,
    count,
    sample_redacted_ids: samples.slice(0, 5).map(redactId),
    recommended_action,
    diagnostics,
  });
}

function sinceIso() {
  return new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

function walkFiles(abs, out = []) {
  let st;
  try {
    st = statSync(abs);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (/\.(ts|tsx|js|jsx|mjs|md|sql)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const name of readdirSync(abs)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "dist" ||
      name === ".git"
    ) {
      continue;
    }
    walkFiles(join(abs, name), out);
  }
  return out;
}

function findMigration(substr) {
  const dir = join(ROOT, "supabase/migrations");
  for (const name of readdirSync(dir).sort().reverse()) {
    const src = readFileSync(join(dir, name), "utf8");
    if (src.includes(substr)) return { name, src };
  }
  return null;
}

function summarizeUsage(rows) {
  return (rows ?? []).map((r) => ({
    id: redactId(r.id),
    request_id: redactId(r.request_id),
    model: r.model ?? null,
    status: r.status ?? null,
    billing_status: r.billing_status ?? null,
    credits_charged: toNumber(r.credits_charged),
    created_at: r.created_at ?? null,
  }));
}

function summarizeLedger(rows) {
  return (rows ?? []).map((r) => ({
    id: redactId(r.id),
    type: r.type ?? null,
    amount: toNumber(r.amount),
    reason: r.reason ?? null,
    reference_id: redactId(r.reference_id),
    created_at: r.created_at ?? null,
  }));
}

async function loadAdminUserIds(supabase) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id, status, revoked_at")
    .eq("status", "active")
    .is("revoked_at", null)
    .limit(5000);
  if (error) {
    console.log(`INFO  admin_users lookup skipped: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.user_id).filter(Boolean));
}

async function loadAdminAuditByLedgerIds(supabase, ledgerIds) {
  const map = new Map();
  if (!ledgerIds.length) return map;
  // Batch in chunks of 50
  for (let i = 0; i < ledgerIds.length; i += 50) {
    const chunk = ledgerIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select(
        "id, actor_user_id, actor_email, action, credit_ledger_id, request_payload, status, created_at"
      )
      .in("credit_ledger_id", chunk)
      .limit(200);
    if (error) {
      console.log(`INFO  admin_audit_logs lookup skipped: ${error.message}`);
      break;
    }
    for (const row of data ?? []) {
      if (row.credit_ledger_id) map.set(row.credit_ledger_id, row);
    }
  }
  return map;
}

async function diagnoseLargeBalance(supabase, profile, adminIds) {
  const userId = profile.id;
  const [{ count: keyCount }, { data: usage }, { data: ledger }] =
    await Promise.all([
      supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase
        .from("usage_logs")
        .select(
          "id, request_id, model, status, billing_status, credits_charged, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("credit_ledger")
        .select("id, type, amount, reason, reference_id, tenant_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const { data: tenantKeys } = await supabase
    .from("api_keys")
    .select("tenant_id")
    .eq("user_id", userId)
    .not("tenant_id", "is", null)
    .limit(1);

  const knownPositive = (ledger ?? []).filter((r) => {
    const cls = classifyPositiveLedgerRow(r, {
      isAdminUser: adminIds.has(userId),
      isUnlimitedAllowlisted: UNLIMITED_IDS.has(userId),
    });
    return toNumber(r.amount) > 0 && cls.status === "accounted";
  });

  return {
    user_id: redactId(userId),
    tenant_id: redactId(tenantKeys?.[0]?.tenant_id ?? null),
    email: redactEmail(profile.email),
    balance: toNumber(profile.credits_balance),
    created_at: profile.created_at ?? null,
    updated_at: profile.updated_at ?? null,
    active_api_key_count: keyCount ?? 0,
    is_admin_user: adminIds.has(userId),
    is_unlimited_allowlisted: UNLIMITED_IDS.has(userId),
    ledger_explained_by_known_sources: knownPositive.length > 0,
    last_5_usage_logs: summarizeUsage(usage),
    last_5_credit_ledger: summarizeLedger(ledger),
    drilldown:
      `TOKFAI_RISK_USER_ID=${userId} node scripts/p905-billing-risk-drilldown.mjs`,
  };
}

async function diagnoseUnaccountedLedger(
  supabase,
  row,
  cls,
  adminAudit,
  adminIds
) {
  const reasonFromAudit =
    adminAudit?.request_payload &&
    typeof adminAudit.request_payload === "object"
      ? adminAudit.request_payload.reason ?? null
      : null;

  return {
    ledger_id: redactId(row.id),
    user_id: redactId(row.user_id),
    tenant_id: redactId(row.tenant_id ?? null),
    amount: toNumber(row.amount),
    type: row.type ?? null,
    reason: row.reason ?? null,
    source: cls.source,
    classification: cls.classification,
    status: cls.status,
    stripe_payment_intent_id_present: Boolean(
      row.reference_id &&
        (/^pi_/i.test(row.reference_id) ||
          /^stripe_checkout:/i.test(row.reference_id))
    ),
    payment_reference_present: Boolean(
      row.reference_id && String(row.reference_id).trim().length > 0
    ),
    reference_id_redacted: redactId(row.reference_id),
    created_at: row.created_at ?? null,
    created_by_admin_present: Boolean(adminAudit?.actor_user_id),
    admin_user_id_redacted: redactId(adminAudit?.actor_user_id ?? null),
    admin_audit_action: adminAudit?.action ?? null,
    admin_audit_reason: reasonFromAudit,
    user_is_admin: adminIds.has(row.user_id),
    drilldown:
      `TOKFAI_RISK_LEDGER_ID=${row.id} node scripts/p905-billing-risk-drilldown.mjs`,
  };
}

function runOfflineStaticChecks() {
  console.log("--- offline static checks ---\n");

  {
    const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
    const limits = read("apps/dmit-api/src/gateway/keySafetyLimits.ts");
    const env = read("apps/dmit-api/src/env.ts");
    const hasAllowlistGate =
      limits.includes("isUnlimitedBillingUser") &&
      env.includes("TOKFAI_UNLIMITED_BILLING_ENABLED") &&
      env.includes("TOKFAI_UNLIMITED_BILLING_USER_IDS");
    const stripsBypass =
      exec.includes("FORBIDDEN_CLIENT_BILLING_KEYS") &&
      exec.includes("bypass_billing") &&
      exec.includes("stripClientBillingOverrides");
    if (!hasAllowlistGate || !stripsBypass) {
      addFinding({
        risk_level: "P0",
        risk_name: "unlimited_or_bypass_billing_unguarded",
        count: 1,
        samples: ["executeChatCompletion.ts"],
        recommended_action:
          "Require env allowlist + strip client bypass/unlimited/free fields.",
      });
      console.log("FAIL  unlimited/bypass gate missing");
    } else {
      console.log("PASS  unlimited only via allowlist; client bypass stripped");
    }
  }

  {
    const mig = findMigration("record_usage_and_debit");
    const debit = findMigration("debit_credits");
    const ok =
      mig &&
      /for update/i.test(mig.src) &&
      debit &&
      /for update/i.test(debit.src) &&
      /insufficient_credits/i.test(mig.src);
    if (!ok) {
      addFinding({
        risk_level: "P0",
        risk_name: "non_atomic_balance_update",
        count: 1,
        samples: [mig?.name ?? "missing"],
        recommended_action:
          "Keep record_usage_and_debit / debit_credits with FOR UPDATE + balance check.",
      });
      console.log("FAIL  atomic debit FOR UPDATE");
    } else {
      console.log("PASS  atomic debit with FOR UPDATE");
    }
  }

  {
    const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
    const mig = findMigration("lookup_usage_idempotency");
    if (!billing.includes("lookupBillingIdempotency") || !mig) {
      addFinding({
        risk_level: "P0",
        risk_name: "missing_idempotency_dedupe",
        count: 1,
        samples: ["usageBilling.ts"],
        recommended_action: "Restore Idempotency-Key + unique charged index.",
      });
      console.log("FAIL  idempotency path");
    } else {
      console.log("PASS  idempotency lookup present");
    }
  }

  {
    const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
    const gateway = read("apps/dmit-api/src/routes/chatGatewayLogs.ts");
    if (
      !(exec.includes("billable: false") && gateway.includes("billable: false"))
    ) {
      addFinding({
        risk_level: "P0",
        risk_name: "failure_path_may_charge",
        count: 1,
        samples: ["executeChatCompletion.ts"],
        recommended_action: "Ensure 4xx/5xx/timeout/429 set billable:false.",
      });
      console.log("FAIL  failure non-billable markers");
    } else {
      console.log("PASS  failure/timeout paths non-billable");
    }
  }

  {
    const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
    if (
      !exec.includes("billableModel = attemptModel") &&
      !exec.includes("billableModel=attemptModel")
    ) {
      addFinding({
        risk_level: "P0",
        risk_name: "alias_priced_as_cheap_model",
        count: 1,
        samples: ["executeChatCompletion.ts"],
        recommended_action:
          "Price by concrete attemptModel, not client alias id.",
      });
      console.log("FAIL  alias billing uses attemptModel");
    } else {
      console.log("PASS  alias bills concrete attemptModel");
    }
  }

  {
    const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
    const auth = read("apps/dmit-api/src/middleware/chatAuth.ts");
    const ok =
      exec.includes("stripClientBillingOverrides") &&
      auth.includes("apiKey.tenantId") &&
      !exec.includes("body.tenant_id");
    if (!ok) {
      addFinding({
        risk_level: "P0",
        risk_name: "client_tenant_or_price_trusted",
        count: 1,
        samples: ["chatAuth.ts"],
        recommended_action:
          "Resolve tenant/user from API key; ignore client price/credits.",
      });
      console.log("FAIL  client billing fields may be trusted");
    } else {
      console.log("PASS  tenant/user from key; client billing fields stripped");
    }
  }

  {
    const limits = read("apps/dmit-api/src/gateway/keySafetyLimits.ts");
    const env = read("apps/dmit-api/src/env.ts");
    const ok =
      limits.includes("assertCreditPeriodLimits") &&
      limits.includes("assertTokenBudget") &&
      limits.includes("resolveMaxOutputTokens") &&
      env.includes("TOKFAI_RATE_LIMIT_TPM") &&
      env.includes("TOKFAI_DAILY_CREDIT_LIMIT") &&
      env.includes("TOKFAI_MONTHLY_CREDIT_LIMIT") &&
      env.includes("TOKFAI_MAX_OUTPUT_TOKENS");
    if (!ok) {
      addFinding({
        risk_level: "P1",
        risk_name: "missing_key_safety_limits",
        count: 1,
        samples: ["keySafetyLimits.ts"],
        recommended_action:
          "Enforce RPM/TPM, daily/monthly credit caps, max_output_tokens.",
      });
      console.log("FAIL  key safety limits");
    } else {
      console.log("PASS  RPM/TPM/daily/monthly/max_output_tokens limits");
    }
  }

  {
    const admin = read("apps/dmit-api/src/routes/admin.ts");
    const ok =
      admin.includes("requireAdminV1") &&
      admin.includes('protectedAdminRoutes.post("/credits/adjust"') &&
      admin.includes('protectedAdminRoutes.use("*", requireAdminV1)');
    if (!ok) {
      addFinding({
        risk_level: "P0",
        risk_name: "admin_credits_adjust_unprotected",
        count: 1,
        samples: ["admin.ts"],
        recommended_action: "Mount credits-adjust / revoke behind requireAdminV1.",
      });
      console.log("FAIL  admin protection");
    } else {
      console.log("PASS  admin credits-adjust behind requireAdminV1");
    }
  }

  {
    const apiKey = read("apps/dmit-api/src/auth/apiKey.ts");
    if (!apiKey.includes("revoked_at") || !apiKey.includes("key_revoked")) {
      addFinding({
        risk_level: "P0",
        risk_name: "revoked_key_may_call",
        count: 1,
        samples: ["apiKey.ts"],
        recommended_action: "Reject keys with revoked_at set (key_revoked).",
      });
      console.log("FAIL  revoked key check");
    } else {
      console.log("PASS  revoked API keys rejected");
    }
  }

  {
    const leakPatterns = [
      /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/,
      /sk-tokfai_[a-f0-9]{40,}/i,
      /https?:\/\/[a-z0-9.-]*grsaiapi\.com/i,
      /GRSAI_API_KEY\s*[:=]/,
    ];
    const files = walkFiles(join(ROOT, "apps/web"));
    const hits = [];
    for (const abs of files) {
      const rel = relative(ROOT, abs);
      if (
        rel.includes("troubleshooting") ||
        rel.includes("public-beta-docs-registry") ||
        rel.includes("messages.ts")
      ) {
        continue;
      }
      let src;
      try {
        src = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      for (const re of leakPatterns) {
        if (re.test(src)) {
          hits.push(rel);
          break;
        }
      }
    }
    if (hits.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "frontend_secret_or_upstream_leak",
        count: hits.length,
        samples: hits,
        recommended_action:
          "Remove service role / full keys / upstream host from apps/web.",
      });
      console.log(`FAIL  frontend leak candidates (${hits.length})`);
    } else {
      console.log("PASS  no frontend secret/upstream host leaks (static)");
    }
  }

  {
    const aliases = read("apps/dmit-api/src/upstream/modelAliases.ts");
    const helpers = read("scripts/lib/billing-risk-helpers.mjs");
    const bad =
      /model not register/i.test(aliases) ||
      !aliases.includes("This model is not available on Tokfai") ||
      !aliases.includes("MODEL_NOT_AVAILABLE_CODE") ||
      !helpers.includes("signup_bonus") ||
      !helpers.includes("classifyPositiveLedgerRow");
    if (bad) {
      addFinding({
        risk_level: "P1",
        risk_name: "model_error_or_ledger_classifier_incomplete",
        count: 1,
        samples: ["modelAliases.ts", "billing-risk-helpers.mjs"],
        recommended_action:
          "Keep model_not_available copy + recognize signup_bonus/admin/stripe refs.",
      });
      console.log("FAIL  model error copy / ledger classifier");
    } else {
      console.log("PASS  model_not_available safe error copy");
      console.log("PASS  ledger classifier recognizes signup_bonus/admin/stripe");
    }

    // Synthetic classifier self-check (no DB) — signup_bonus must not be P0.
    const signup = classifyPositiveLedgerRow({
      type: "grant",
      amount: 5000,
      reason: "Signup bonus",
      reference_id: "signup_bonus:00000000-0000-0000-0000-000000000001",
    });
    const adminAdj = classifyPositiveLedgerRow({
      type: "adjustment",
      amount: 100,
      reason: "public_beta_invite",
      reference_id: "admin_adjustment:00000000-0000-0000-0000-000000000002",
    });
    const bare = classifyPositiveLedgerRow({
      type: "grant",
      amount: 999999,
      reason: "",
      reference_id: null,
    });
    if (signup.status !== "accounted" || adminAdj.status !== "accounted") {
      addFinding({
        risk_level: "P0",
        risk_name: "ledger_classifier_false_positive",
        count: 1,
        samples: ["classifyPositiveLedgerRow"],
        recommended_action:
          "Account signup_bonus / admin_adjustment as legitimate sources.",
      });
      console.log("FAIL  classifier false-positive on signup/admin");
    } else if (bare.status !== "unaccounted") {
      addFinding({
        risk_level: "P0",
        risk_name: "ledger_classifier_false_negative",
        count: 1,
        samples: ["classifyPositiveLedgerRow"],
        recommended_action:
          "Ordinary unvouchered grants must remain P0 unaccounted.",
      });
      console.log("FAIL  classifier must flag bare grants as unaccounted");
    } else {
      console.log(
        "PASS  classifier: signup_bonus/admin_adjustment accounted; bare grant unaccounted"
      );
    }
  }
}

async function runDbChecks() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key || key.length < 20) {
    console.log(
      "\nSKIP  live DB checks (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)\n"
    );
    return;
  }

  console.log("--- live DB checks (read-only) ---\n");
  const { createSupabaseAdminClient } = await import("./lib/supabase-admin.mjs");
  const supabase = createSupabaseAdminClient();
  const since = sinceIso();
  const adminIds = await loadAdminUserIds(supabase);

  // Negative balances
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, credits_balance")
      .lt("credits_balance", 0)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "negative_balance_users",
        count: rows.length,
        samples: rows.map((r) => r.id),
        recommended_action:
          "Investigate debit race; reconcile via admin adjust (manual). Do not auto-clear.",
      });
      console.log(`FAIL  negative balances: ${rows.length}`);
    } else {
      console.log("PASS  no negative balances");
    }
  }

  // Extreme balances — P1 WARN with rich diagnostics (does not fail suite alone)
  {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, credits_balance, created_at, updated_at, total_credits_purchased, total_credits_used"
      )
      .gt("credits_balance", BALANCE_THRESHOLD)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length) {
      const diagnostics = [];
      for (const profile of rows.slice(0, 5)) {
        diagnostics.push(await diagnoseLargeBalance(supabase, profile, adminIds));
      }
      addFinding({
        risk_level: "P1",
        risk_name: "abnormally_large_balance",
        count: rows.length,
        samples: rows.map((r) => r.id),
        recommended_action: recommendedActionForLargeBalance(diagnostics[0]),
        diagnostics,
      });
      console.log(`WARN  large balances > ${BALANCE_THRESHOLD}: ${rows.length}`);
      for (const d of diagnostics) {
        console.log(
          `      diag user=${d.user_id} balance=${d.balance} keys=${d.active_api_key_count} admin=${d.is_admin_user}`
        );
      }
    } else {
      console.log("PASS  no abnormally large balances");
    }
  }

  // Positive ledger — classify; only ordinary unvouchered grants are P0
  {
    const { data, error } = await supabase
      .from("credit_ledger")
      .select(
        "id, user_id, tenant_id, type, amount, reason, reference_id, created_at"
      )
      .in("type", ["purchase", "grant", "adjustment", "refund"])
      .gt("amount", 0)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const auditMap = await loadAdminAuditByLedgerIds(
      supabase,
      rows.map((r) => r.id)
    );

    const unaccounted = [];
    const internalCandidates = [];
    let accountedCount = 0;

    for (const row of rows) {
      const adminAudit = auditMap.get(row.id) ?? null;
      const cls = classifyPositiveLedgerRow(row, {
        adminAudit,
        isAdminUser: adminIds.has(row.user_id),
        isUnlimitedAllowlisted: UNLIMITED_IDS.has(row.user_id),
      });
      if (cls.status === "accounted") {
        accountedCount += 1;
        continue;
      }
      const diag = await diagnoseUnaccountedLedger(
        supabase,
        row,
        cls,
        adminAudit,
        adminIds
      );
      if (cls.status === "internal_test_candidate") {
        internalCandidates.push({ row, cls, diag });
      } else {
        unaccounted.push({ row, cls, diag });
      }
    }

    console.log(
      `INFO  positive ledger sample: total=${rows.length} accounted=${accountedCount} internal_review=${internalCandidates.length} unaccounted=${unaccounted.length}`
    );

    if (internalCandidates.length) {
      addFinding({
        risk_level: "P1",
        risk_name: "positive_ledger_needs_ops_reason",
        count: internalCandidates.length,
        samples: internalCandidates.map((x) => x.row.id),
        recommended_action: recommendedActionForUnaccountedLedger(
          internalCandidates[0].cls,
          internalCandidates[0].diag
        ),
        diagnostics: internalCandidates.slice(0, 5).map((x) => x.diag),
      });
      console.log(
        `WARN  positive ledger needs ops reason (test/internal): ${internalCandidates.length}`
      );
    }

    if (unaccounted.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "credit_grant_without_payment_or_admin_reason",
        count: unaccounted.length,
        samples: unaccounted.map((x) => x.row.id),
        recommended_action: recommendedActionForUnaccountedLedger(
          unaccounted[0].cls,
          unaccounted[0].diag
        ),
        diagnostics: unaccounted.slice(0, 5).map((x) => x.diag),
      });
      console.log(
        `FAIL  unaccounted positive ledger rows: ${unaccounted.length}`
      );
      for (const x of unaccounted.slice(0, 3)) {
        console.log(
          `      diag ledger=${x.diag.ledger_id} user=${x.diag.user_id} amount=${x.diag.amount} source=${x.diag.source} reason=${JSON.stringify(x.diag.reason)}`
        );
      }
    } else {
      console.log(
        "PASS  positive ledger rows accounted (signup/stripe/admin/audit) or only P1 ops-review"
      );
    }
  }

  // Success usage without debit
  {
    const { data: logs, error } = await supabase
      .from("usage_logs")
      .select("id, request_id, user_id, credits_charged, billing_status, status")
      .gte("created_at", since)
      .eq("status", "succeeded")
      .eq("billing_status", "charged")
      .gt("credits_charged", 0)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const missing = [];
    for (const row of logs ?? []) {
      if (!row.request_id) continue;
      const { data: debits, error: e2 } = await supabase
        .from("credit_ledger")
        .select("id")
        .eq("type", "debit")
        .eq("reference_id", row.request_id)
        .limit(1);
      if (e2) throw new Error(e2.message);
      if (!debits?.length) missing.push(row.request_id);
    }
    if (missing.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "succeeded_usage_without_debit",
        count: missing.length,
        samples: missing,
        recommended_action:
          "Reconcile manually; ensure record_usage_and_debit atomic path. Do not auto-delete usage.",
      });
      console.log(`FAIL  charged usage missing debit: ${missing.length}`);
    } else {
      console.log("PASS  charged usage has matching debit");
    }
  }

  // Debit without usage request_id
  {
    const { data: debits, error } = await supabase
      .from("credit_ledger")
      .select("id, reference_id, user_id, amount, created_at")
      .eq("type", "debit")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const orphan = [];
    for (const row of debits ?? []) {
      if (!row.reference_id) {
        orphan.push(row.id);
        continue;
      }
      const { data: logs, error: e2 } = await supabase
        .from("usage_logs")
        .select("id")
        .eq("request_id", row.reference_id)
        .limit(1);
      if (e2) throw new Error(e2.message);
      if (!logs?.length) orphan.push(row.reference_id);
    }
    if (orphan.length) {
      addFinding({
        risk_level: "P1",
        risk_name: "debit_without_usage_request_id",
        count: orphan.length,
        samples: orphan,
        recommended_action:
          "Investigate image/legacy debit paths; backfill logs manually if needed.",
      });
      console.log(`WARN  debit without usage_logs: ${orphan.length}`);
    } else {
      console.log("PASS  debits map to usage request_id");
    }
  }

  // Duplicate idempotency charges
  {
    const { data: logs, error } = await supabase
      .from("usage_logs")
      .select("request_id, idempotency_key, api_key_id, credits_charged")
      .gte("created_at", since)
      .eq("billing_status", "charged")
      .gt("credits_charged", 0)
      .not("idempotency_key", "is", null)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const seen = new Map();
    const dups = [];
    for (const row of logs ?? []) {
      const key = `${row.api_key_id}|${row.idempotency_key}`;
      if (seen.has(key)) dups.push(row.request_id ?? key);
      else seen.set(key, true);
    }
    if (dups.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "duplicate_idempotency_charge",
        count: dups.length,
        samples: dups,
        recommended_action:
          "Enforce unique (api_key_id, idempotency_key, endpoint). Manual reverse extras.",
      });
      console.log(`FAIL  duplicate idempotency charges: ${dups.length}`);
    } else {
      console.log("PASS  no duplicate idempotency charges in sample");
    }
  }

  // Failed requests charged
  {
    const { data, error } = await supabase
      .from("usage_logs")
      .select(
        "id, request_id, status, billing_status, credits_charged, upstream_status"
      )
      .gte("created_at", since)
      .or("status.eq.failed,status.eq.rate_limited")
      .gt("credits_charged", 0)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "failed_request_charged",
        count: rows.length,
        samples: rows.map((r) => r.request_id ?? r.id),
        recommended_action:
          "Reverse charges via admin adjust; fix finalize on 4xx/5xx paths.",
      });
      console.log(`FAIL  failed requests charged: ${rows.length}`);
    } else {
      console.log("PASS  failed requests not charged");
    }
  }

  // API keys without user_id
  {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, user_id, tenant_id, revoked_at")
      .is("user_id", null)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "api_key_missing_user_binding",
        count: rows.length,
        samples: rows.map((r) => r.id),
        recommended_action:
          "Manually revoke unbound keys; require user_id on create. Do not auto-revoke from audit.",
      });
      console.log(`FAIL  keys missing user_id: ${rows.length}`);
    } else {
      console.log("PASS  all sampled keys have user_id");
    }
  }

  {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, tenant_id, revoked_at")
      .is("tenant_id", null)
      .is("revoked_at", null)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    console.log(
      `INFO  active keys with null tenant_id: ${(data ?? []).length} (may be main-site OK)`
    );
  }
}

function printFindings() {
  console.log("\n=== Findings ===\n");
  if (!findings.length) {
    console.log("(none)\n");
    return;
  }
  for (const f of findings) {
    console.log(
      JSON.stringify(
        {
          risk_level: f.risk_level,
          risk_name: f.risk_name,
          count: f.count,
          sample_redacted_ids: f.sample_redacted_ids,
          recommended_action: f.recommended_action,
          diagnostics: f.diagnostics,
        },
        null,
        2
      )
    );
    console.log("");
  }
}

async function main() {
  console.log("=== Tokfai P900 Billing Risk Audit ===\n");
  runOfflineStaticChecks();
  await runDbChecks();
  printFindings();

  const p0 = findings.filter((f) => f.risk_level === "P0");
  if (p0.length) {
    console.log("TOKFAI_BILLING_RISK_AUDIT_FAIL");
    process.exit(1);
  }
  console.log("TOKFAI_BILLING_RISK_AUDIT_PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log("TOKFAI_BILLING_RISK_AUDIT_FAIL");
  process.exit(1);
});
