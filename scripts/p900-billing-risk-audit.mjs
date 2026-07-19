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
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

const findings = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function redactId(id) {
  if (!id || typeof id !== "string") return "(null)";
  if (id.length <= 10) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function addFinding({
  risk_level,
  risk_name,
  count,
  samples = [],
  recommended_action,
}) {
  findings.push({
    risk_level,
    risk_name,
    count,
    sample_redacted_ids: samples.slice(0, 5).map(redactId),
    recommended_action,
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

function runOfflineStaticChecks() {
  console.log("--- offline static checks ---\n");

  // 1) No ordinary unlimited / bypass in source
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

  // 2) Atomic debit + FOR UPDATE
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

  // 3) Idempotency
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

  // 4) No charge on failure / timeout
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

  // 5) Alias bills concrete attempt model
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

  // 6) Client tenant/price not trusted
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

  // 7) Key safety limits present
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

  // 8) Admin routes protected
  {
    const admin = read("apps/dmit-api/src/routes/admin.ts");
    const ok =
      admin.includes("requireAdminV1") &&
      admin.includes('protectedAdminRoutes.post("/credits/adjust"') &&
      admin.includes("protectedAdminRoutes.use(\"*\", requireAdminV1)");
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

  // 9) Revoked key check
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

  // 10) Frontend bundle leak (static scan of apps/web sources)
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
      // Allow diagnostic mentions in troubleshooting docs only (bare host).
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

  // 11) Model error copy
  {
    const aliases = read("apps/dmit-api/src/upstream/modelAliases.ts");
    const bad =
      /model not register/i.test(aliases) ||
      !aliases.includes("This model is not available on Tokfai") ||
      !aliases.includes("MODEL_NOT_AVAILABLE_CODE");
    if (bad) {
      addFinding({
        risk_level: "P1",
        risk_name: "model_error_exposes_register_copy",
        count: 1,
        samples: ["modelAliases.ts"],
        recommended_action:
          "Return model_not_available with Tokfai-safe message only.",
      });
      console.log("FAIL  model error copy");
    } else {
      console.log("PASS  model_not_available safe error copy");
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
        recommended_action: "Investigate debit race; reconcile via admin adjust.",
      });
      console.log(`FAIL  negative balances: ${rows.length}`);
    } else {
      console.log("PASS  no negative balances");
    }
  }

  // Extreme balances
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, credits_balance")
      .gt("credits_balance", BALANCE_THRESHOLD)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length) {
      addFinding({
        risk_level: "P1",
        risk_name: "abnormally_large_balance",
        count: rows.length,
        samples: rows.map((r) => r.id),
        recommended_action:
          "Verify Stripe/admin grants; revoke fraudulent top-ups.",
      });
      console.log(`WARN  large balances > ${BALANCE_THRESHOLD}: ${rows.length}`);
    } else {
      console.log("PASS  no abnormally large balances");
    }
  }

  // Positive ledger without payment/admin reason
  {
    const { data, error } = await supabase
      .from("credit_ledger")
      .select("id, user_id, type, amount, reason, reference_id, created_at")
      .in("type", ["purchase", "grant", "adjustment", "refund"])
      .gt("amount", 0)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const suspicious = (data ?? []).filter((row) => {
      const reason = String(row.reason ?? "").toLowerCase();
      const ref = String(row.reference_id ?? "").toLowerCase();
      const hasReason =
        /admin|stripe|payment|checkout|manual|grant|top.?up|order|webhook|refund/.test(
          reason
        ) ||
        /stripe|pi_|cs_|ch_|order|admin/.test(ref);
      return !hasReason;
    });
    if (suspicious.length) {
      addFinding({
        risk_level: "P0",
        risk_name: "credit_grant_without_payment_or_admin_reason",
        count: suspicious.length,
        samples: suspicious.map((r) => r.id),
        recommended_action:
          "Require admin reason / Stripe id / payment reference on grants.",
      });
      console.log(`FAIL  unaccounted positive ledger rows: ${suspicious.length}`);
    } else {
      console.log("PASS  positive ledger rows have payment/admin reason");
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
        recommended_action: "Reconcile; ensure record_usage_and_debit atomic path.",
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
        recommended_action: "Investigate image/legacy debit paths; backfill logs.",
      });
      console.log(`WARN  debit without usage_logs: ${orphan.length}`);
    } else {
      console.log("PASS  debits map to usage request_id");
    }
  }

  // Duplicate debits per request_id / idempotency
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
        recommended_action: "Enforce unique (api_key_id, idempotency_key, endpoint).",
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
      .select("id, request_id, status, billing_status, credits_charged, upstream_status")
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
        recommended_action: "Reverse charges; fix finalize on 4xx/5xx paths.",
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
        recommended_action: "Revoke unbound keys; require user_id on create.",
      });
      console.log(`FAIL  keys missing user_id: ${rows.length}`);
    } else {
      console.log("PASS  all sampled keys have user_id");
    }
  }

  // Active keys missing tenant_id (P2 — host tenancy may be null for main site)
  {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, tenant_id, revoked_at")
      .is("tenant_id", null)
      .is("revoked_at", null)
      .limit(LIMIT);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // Informational — main site keys may legitimately have null tenant_id
    console.log(
      `INFO  active keys with null tenant_id: ${rows.length} (may be main-site OK)`
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
