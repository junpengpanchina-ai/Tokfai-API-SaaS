#!/usr/bin/env node
/**
 * P931 — Upstream timeout ops report + static contract checks (read-only).
 *
 * Offline (always):
 *   - layered timeouts (chat short / responses 300s / heavy 700s)
 *   - timeout stays not_billable / no finalize charge
 *   - chat_provider_timeout_stats fields present (incl. timeoutMs)
 *   - heavy concurrency → 429 rate_limited
 *   - no second provider → fallback_unavailable (not fake fallback_attempt)
 *   - provider+model circuit breaker exists (degraded, suggest switch, no invent)
 *
 * Live DB (optional, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   Last 24h (LOOKBACK_HOURS, default 24):
 *   - 504 / upstream_timeout count
 *   - by model
 *   - by providerId (from safety_reason provider=<id> when present)
 *   - avg / p95 latencyMs
 *   - whether any timeout was charged
 *
 * Usage:
 *   node scripts/p931-upstream-timeout-report.mjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/p931-upstream-timeout-report.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKBACK_HOURS = Math.max(
  1,
  parseInt(process.env.LOOKBACK_HOURS ?? "24", 10) || 24
);
const LIMIT = Math.max(
  50,
  parseInt(process.env.LIMIT ?? "5000", 10) || 5000
);

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

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function parseProviderId(safetyReason) {
  if (typeof safetyReason !== "string") return "(unknown)";
  const m = /^provider=([a-z0-9._-]+)$/i.exec(safetyReason.trim());
  return m?.[1] ?? "(unknown)";
}

function groupCount(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

console.log("=== P931 Upstream timeout report ===\n");
let ok = true;

const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
const policy = read("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts");
const envSrc = read("apps/dmit-api/src/env.ts");
const concurrency = read("apps/dmit-api/src/gateway/concurrency.ts");
const errors = read("apps/dmit-api/src/errors.ts");
const breaker = read(
  "apps/dmit-api/src/upstream/providerModelCircuitBreaker.ts"
);
const handle = read(
  "apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts"
);
const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
const grsai = read("apps/dmit-api/src/upstream/grsai.ts");

{
  const layered =
    policy.includes("resolveUpstreamTimeoutPolicy") &&
    policy.includes("UPSTREAM_TIMEOUT_DEFAULTS") &&
    policy.includes("700_000") &&
    policy.includes("300_000") &&
    envSrc.includes("TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS") &&
    envSrc.includes(".default(700_000)") &&
    envSrc.includes("TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS") &&
    envSrc.includes(".default(300_000)") &&
    exec.includes("timeoutPolicy") &&
    policy.includes('tier: "chat"') &&
    policy.includes("never inherit heavy");
  if (!layered) {
    ok =
      fail(
        "layered timeouts",
        "expected chat short / responses 300000 / heavy 700000"
      ) && ok;
  } else {
    ok =
      pass(
        "layered timeouts: chat short; responses 300000; heavy 700000 (not global)"
      ) && ok;
  }
}

{
  const notCharged =
    exec.includes("failedUsageLog") &&
    /function failedUsageLog[\s\S]*billable:\s*false/.test(exec) &&
    exec.includes('billing_status: entry.billing_status ?? "not_billable"') &&
    !/async function logChatFailure[\s\S]*?recordSuccessfulUsageAndDebit/.test(
      exec
    ) &&
    billing.includes("record_usage_and_debit");
  if (!notCharged) {
    ok =
      fail(
        "timeout remains not_billable",
        "expected failedUsageLog billable:false; debit only on success"
      ) && ok;
  } else {
    ok = pass("504 / upstream_timeout stays not_billable (no finalize charge)") && ok;
  }
}

{
  const stats =
    exec.includes("chat_provider_timeout_stats") &&
    exec.includes("logProviderTimeoutStats") &&
    exec.includes("requestedModel") &&
    exec.includes("resolvedModel") &&
    exec.includes("providerId") &&
    exec.includes("upstreamStatus") &&
    exec.includes("upstreamErrorCode") &&
    exec.includes("latencyMs") &&
    exec.includes("timeoutMs") &&
    exec.includes("billing_status") &&
    exec.includes("fallbackSkippedReason") &&
    grsai.includes("timeoutMs");
  if (!stats) {
    ok =
      fail(
        "provider timeout stats log",
        "expected chat_provider_timeout_stats with timeoutMs + required fields"
      ) && ok;
  } else {
    ok =
      pass(
        "provider timeout stats log includes model/provider/status/latency/timeoutMs/fallbackSkippedReason"
      ) && ok;
  }
}

{
  const heavyCap =
    concurrency.includes("tryAcquireHeavyResponses") &&
    envSrc.includes("TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY") &&
    errors.includes('code: "rate_limited"') &&
    errors.includes("当前长任务并发过多，请稍后重试。") &&
    exec.includes("heavyResponsesRateLimited");
  if (!heavyCap) {
    ok =
      fail(
        "heavy concurrency limit",
        "expected max 2 heavy responses → 429 rate_limited"
      ) && ok;
  } else {
    ok =
      pass(
        "heavy responses concurrency capped (429 rate_limited, not billable)"
      ) && ok;
  }
}

{
  const honest =
    exec.includes("chat_provider_fallback_unavailable") &&
    exec.includes("fallback_skipped_reason") &&
    exec.includes("no_secondary_provider") &&
    /if \(hasNextProvider\) \{[\s\S]*chat_provider_fallback_attempt[\s\S]*continue;[\s\S]*\}/.test(
      exec
    );
  if (!honest) {
    ok =
      fail(
        "fallback honesty",
        "expected fallback_attempt only with next provider; else fallback_unavailable"
      ) && ok;
  } else {
    ok =
      pass(
        "no second provider → fallback_unavailable (not fake fallback_attempt)"
      ) && ok;
  }
}

{
  const circuit =
    breaker.includes("recordProviderModelTimeout") &&
    breaker.includes("filterProvidersByTimeoutCircuit") &&
    breaker.includes("provider_model_circuit_degraded") &&
    breaker.includes("FAILURE_THRESHOLD") &&
    exec.includes("filterProvidersByTimeoutCircuit") &&
    exec.includes("provider_model_degraded") &&
    exec.includes("failureResultWithSuggestions") &&
    exec.includes("suggestedModels") &&
    handle.includes("suggestedModels");
  // Must not invent expensive model switches outside alias config.
  const noInvent =
    exec.includes("do not invent a costlier model switch") ||
    breaker.includes("never invent a more") ||
    breaker.includes("do not invent unconfigured");
  if (!circuit || !noInvent) {
    ok =
      fail(
        "provider/model circuit breaker",
        "expected degraded marking + suggestedModels without inventing costlier switches"
      ) && ok;
  } else {
    ok =
      pass(
        "circuit breaker: N timeouts → degraded; suggest switch; no invent costlier model"
      ) && ok;
  }
}

{
  const providerBreadcrumb =
    exec.includes("provider=${providerId}") ||
    exec.includes("`provider=${providerId}`") ||
    /safety_reason:\s*providerId\s*\?\s*`provider=\$\{providerId\}`/.test(exec);
  if (!providerBreadcrumb) {
    ok =
      fail(
        "usage_logs provider breadcrumb",
        "expected safety_reason provider=<id> on timeout failures for reports"
      ) && ok;
  } else {
    ok =
      pass("timeout failures record provider=<id> in safety_reason (ops only)") &&
      ok;
  }
}

async function runLiveReport() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key || key.length < 20) {
    console.log(
      "\nSKIP  live 24h report (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)\n"
    );
    return;
  }

  console.log(`\n--- live DB report (last ${LOOKBACK_HOURS}h, read-only) ---\n`);
  const { createSupabaseAdminClient } = await import("./lib/supabase-admin.mjs");
  const supabase = createSupabaseAdminClient();
  const since = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("usage_logs")
    .select(
      "id, request_id, model, status, billing_status, billable, credits_charged, error_code, upstream_status, upstream_error_code, latency_ms, safety_reason, endpoint, created_at"
    )
    .gte("created_at", since)
    .or(
      "error_code.eq.upstream_timeout,upstream_status.eq.504,upstream_error_code.eq.upstream_timeout"
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const timeouts = rows.filter(
    (r) =>
      r.error_code === "upstream_timeout" ||
      r.upstream_status === 504 ||
      r.upstream_error_code === "upstream_timeout"
  );

  const latencies = timeouts
    .map((r) => r.latency_ms)
    .filter((n) => typeof n === "number" && Number.isFinite(n))
    .sort((a, b) => a - b);
  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : null;
  const p95 = percentile(latencies, 0.95);

  const chargedTimeouts = timeouts.filter((r) => {
    const charged = Number(r.credits_charged);
    return (
      r.billing_status === "charged" ||
      r.billable === true ||
      (Number.isFinite(charged) && charged > 0)
    );
  });

  const byModel = groupCount(timeouts, (r) => r.model || "(null)");
  const byProvider = groupCount(timeouts, (r) =>
    parseProviderId(r.safety_reason)
  );

  console.log(
    JSON.stringify(
      {
        lookback_hours: LOOKBACK_HOURS,
        since,
        timeout_504_count: timeouts.length,
        by_model: byModel,
        by_provider_id: byProvider,
        avg_latency_ms:
          avgLatency === null ? null : Math.round(avgLatency * 100) / 100,
        p95_latency_ms: p95 === null ? null : Math.round(p95 * 100) / 100,
        charged_timeout_count: chargedTimeouts.length,
        charged_timeout_samples: chargedTimeouts.slice(0, 5).map((r) => ({
          request_id: r.request_id,
          model: r.model,
          billing_status: r.billing_status,
          credits_charged: r.credits_charged,
        })),
        truncated: rows.length >= LIMIT,
      },
      null,
      2
    )
  );

  if (chargedTimeouts.length > 0) {
    console.error(
      `\nWARN  charged timeout rows detected: ${chargedTimeouts.length} (should be 0)`
    );
  } else {
    console.log("\nPASS  no charged timeout rows in lookback window");
  }
}

await runLiveReport();

if (!ok) {
  console.error("\np931-upstream-timeout-report: FAILED");
  process.exit(1);
}
console.log("\np931-upstream-timeout-report: OK");
console.log("TOKFAI_P931_UPSTREAM_TIMEOUT_REPORT_PASS");
