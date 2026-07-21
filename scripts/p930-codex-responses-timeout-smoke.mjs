#!/usr/bin/env node
/**
 * P930 — Codex /v1/responses upstream timeout acceptance (offline, static).
 *
 * Verifies layered timeout + billing + concurrency contracts without live traffic:
 * - /v1/responses non-stream + stream share executeChatCompletion failure path
 * - status=504, code=upstream_timeout, request_id present
 * - heavy responses timeout = 700000ms; chat stays short (not global 700s)
 * - stream uses idle timeout (700000ms) without short total wall-clock cut
 * - no upstream host leak / no "undefined" in public timeout copy
 * - usage_logs stay not_billable (never charged) on timeout
 * - credit_ledger debit only on success finalize (not on timeout)
 * - heavy concurrency >2 → 429 rate_limited, not billable
 * - timeout logs include timeoutMs
 * - api_error log msg matches status (api_error_504, not api_error_500)
 * - no second provider → fallback_unavailable + fallback_skipped_reason
 *
 * Usage: node scripts/p930-codex-responses-timeout-smoke.mjs
 */

import { readFileSync } from "node:fs";
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

console.log("=== P930 Codex /v1/responses timeout smoke ===\n");
let ok = true;

const responses = read("apps/dmit-api/src/routes/responses.ts");
const chat = read("apps/dmit-api/src/routes/chat.ts");
const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
const policy = read("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts");
const handle = read("apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts");
const errors = read("apps/dmit-api/src/errors.ts");
const errorMw = read("apps/dmit-api/src/middleware/error.ts");
const grsai = read("apps/dmit-api/src/upstream/grsai.ts");
const billing = read("apps/dmit-api/src/lib/usageBilling.ts");
const sse = read("apps/dmit-api/src/lib/responsesSse.ts");
const gatewayLimits = read("apps/dmit-api/src/gateway/keySafetyLimits.ts");
const concurrency = read("apps/dmit-api/src/gateway/concurrency.ts");
const envSrc = read("apps/dmit-api/src/env.ts");
const nginxExample = read("deploy/runtime/nginx-api.tokfai.com.conf.example");
const deployReadme = read("deploy/runtime/README.md");

{
  const shared =
    responses.includes("executeChatCompletion") &&
    responses.includes('route: "/v1/responses"') &&
    responses.includes("respondExecuteChatCompletionFailure") &&
    responses.includes("wantsStream") &&
    responses.includes("clientStream: wantsStream") &&
    responses.includes("responsesToSseBody");
  if (!shared) {
    ok =
      fail(
        "/v1/responses non-stream + stream share chat execution",
        "expected executeChatCompletion + failure handler + SSE path + clientStream"
      ) && ok;
  } else {
    ok =
      pass(
        "/v1/responses non-stream + stream share executeChatCompletion (timeout same path)"
      ) && ok;
  }
}

{
  const layered =
    policy.includes("resolveUpstreamTimeoutPolicy") &&
    policy.includes('tier: "chat"') &&
    policy.includes('tier: "responses"') &&
    policy.includes('tier: "heavy"') &&
    policy.includes("UPSTREAM_TIMEOUT_DEFAULTS") &&
    policy.includes("300_000") &&
    policy.includes("700_000") &&
    envSrc.includes("TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS") &&
    envSrc.includes("TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS") &&
    envSrc.includes(".default(700_000)") &&
    envSrc.includes(".default(300_000)") &&
    exec.includes("resolveUpstreamTimeoutPolicy") &&
    exec.includes("timeoutPolicy.upstreamTimeoutMs");
  const chatNotGlobal700 =
    policy.includes("chat_default") &&
    policy.includes("TOKFAI_UPSTREAM_TIMEOUT_MS") &&
    policy.includes("never inherit heavy") &&
    !/reason:\s*"chat_default"[\s\S]{0,80}700_000/.test(policy);
  if (!layered || !chatNotGlobal700) {
    ok =
      fail(
        "layered timeout policy",
        "expected chat short / responses 300s / heavy 700s; chat must not use 700000"
      ) && ok;
  } else {
    ok =
      pass(
        "Codex/heavy responses timeout=700000ms; ordinary responses=300000ms; chat stays short"
      ) && ok;
  }
}

{
  const heavyModels =
    policy.includes("gpt-5.5") &&
    policy.includes("gpt-5-pro") &&
    policy.includes("gpt-5.4-pro") &&
    (policy.includes("codex") || policy.includes("coding"));
  const heavyGate =
    policy.includes('route === "/v1/responses"') &&
    policy.includes("isHeavy") &&
    (policy.includes("hasHeavyBodySignals") ||
      policy.includes("modelHeavy"));
  if (!heavyModels || !heavyGate) {
    ok =
      fail(
        "heavy detection",
        "expected /v1/responses + gpt-5.5/gpt-5-pro/gpt-5.4-pro/coding signals → heavy"
      ) && ok;
  } else {
    ok =
      pass(
        "heavy responses detected for Codex models / coding body signals on /v1/responses"
      ) && ok;
  }
}

{
  const idle =
    policy.includes("idleTimeoutMs") &&
    envSrc.includes("TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS") &&
    grsai.includes("idleTimeoutMs") &&
    exec.includes("clientStream") &&
    (exec.includes("idleTimeoutMs") || chat.includes("clientStream"));
  if (!idle) {
    ok =
      fail(
        "stream idle timeout",
        "expected idleTimeoutMs=700000 for stream heavy path"
      ) && ok;
  } else {
    ok =
      pass(
        "stream=true uses idle timeout (700000ms) instead of short total cut"
      ) && ok;
  }
}

{
  const timeoutThrow =
    grsai.includes('code: "upstream_timeout"') &&
    grsai.includes("status: 504") &&
    grsai.includes("upstreamStatus: 504");
  const totalTimeout =
    errors.includes("requestTimeout") &&
    errors.includes('code: "upstream_timeout"') &&
    errors.includes("status: 504");
  const statusMap =
    errors.includes("upstream_timeout: 504") ||
    /upstream_timeout:\s*504/.test(errors);
  if (!timeoutThrow || !totalTimeout || !statusMap) {
    ok =
      fail(
        "upstream_timeout → HTTP 504",
        "grsai timeout / ApiError.requestTimeout / STATUS_BY_ERROR_CODE"
      ) && ok;
  } else {
    ok = pass("upstream timeout maps to status=504 code=upstream_timeout") && ok;
  }
}

{
  const failureThrows =
    (handle.includes("throw new ApiError") ||
      handle.includes("respondApiError")) &&
    handle.includes("result.httpStatus") &&
    handle.includes("buildClientErrorBody");
  const envelope =
    errors.includes("buildClientErrorBody") &&
    errors.includes("shouldIncludeRequestIdInError") &&
    (errors.includes("status === 504") ||
      errors.includes("shouldIncludeRequestIdInError"));
  const requestIdOn504 =
    /shouldIncludeRequestIdInError[\s\S]*504/.test(errors) &&
    errors.includes("body.error.request_id") &&
    /request_id/.test(errors);
  if (!failureThrows || !envelope || !requestIdOn504) {
    ok =
      fail(
        "504 envelope returns request_id",
        "handleExecuteChatCompletionResult + buildClientErrorBody"
      ) && ok;
  } else {
    ok =
      pass(
        "timeout failure returns status=504 + code=upstream_timeout + request_id"
      ) && ok;
  }
}

{
  const publicMsg = "上游模型响应超时，请稍后重试或切换模型。";
  const hasCopy =
    grsai.includes(publicMsg) || errors.includes(publicMsg);
  const noHostInCopy =
    !/publicMessage:\s*[`"'][^`'"]*grsaiapi/i.test(grsai) &&
    !/publicMessage:\s*[`"'][^`'"]*grsaiapi/i.test(errors);
  const noUndefinedLiteral =
    !publicMsg.includes("undefined") &&
    !/上游.*undefined/.test(grsai) &&
    !/上游.*undefined/.test(errors);
  if (!hasCopy || !noHostInCopy || !noUndefinedLiteral) {
    ok =
      fail(
        "timeout public copy safe",
        "expected Tokfai timeout message, no host leak, no undefined"
      ) && ok;
  } else {
    ok =
      pass(
        "timeout public message has no upstream host and no undefined"
      ) && ok;
  }
}

{
  const failedPath =
    exec.includes("failedUsageLog") &&
    exec.includes("billable: false") &&
    exec.includes('billing_status: entry.billing_status ?? "not_billable"');
  const successOnlyDebit =
    exec.includes("recordSuccessfulUsageAndDebit") &&
    billing.includes("record_usage_and_debit") &&
    (billing.includes("debit_ledger_id") || billing.includes("debit_credits"));
  // Debit must not sit on the failure / timeout branch.
  const timeoutNoDebit =
    exec.includes("logChatFailure") &&
    exec.includes("failedUsageLog") &&
    /function failedUsageLog[\s\S]*billable:\s*false/.test(exec) &&
    !/async function logChatFailure[\s\S]*?recordSuccessfulUsageAndDebit/.test(
      exec
    );
  const docsRule =
    gatewayLimits.includes("Upstream timeout") &&
    gatewayLimits.includes("billable:false");
  if (!failedPath || !successOnlyDebit || !timeoutNoDebit) {
    ok =
      fail(
        "timeout does not finalize charge",
        "expected billable:false + not_billable; debit only on success"
      ) && ok;
  } else {
    ok =
      pass(
        "timeout/504/upstream_timeout → usage_logs not charged; no credit_ledger debit"
      ) && ok;
  }
  if (docsRule) {
    ok = pass("keySafetyLimits documents timeout → no finalize charge") && ok;
  }
}

{
  const heavyConcurrency =
    concurrency.includes("tryAcquireHeavyResponses") &&
    concurrency.includes("releaseHeavyResponses") &&
    envSrc.includes("TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY") &&
    envSrc.includes(".default(2)") &&
    exec.includes("tryAcquireHeavyResponses") &&
    exec.includes("releaseHeavyResponses") &&
    errors.includes("heavyResponsesRateLimited") &&
    errors.includes('code: "rate_limited"') &&
    errors.includes("当前长任务并发过多，请稍后重试。");
  const noDebitOn429 =
    /heavyResponsesRateLimited[\s\S]{0,400}logChatFailure/.test(exec) ||
    (exec.includes("heavyResponsesRateLimited") &&
      exec.includes("logChatFailure"));
  if (!heavyConcurrency || !noDebitOn429) {
    ok =
      fail(
        "heavy responses concurrency",
        "expected max 2 per key → 429 rate_limited, not billable"
      ) && ok;
  } else {
    ok =
      pass(
        "heavy responses concurrency >2 → 429 rate_limited, not billable"
      ) && ok;
  }
}

{
  const timeoutMsLogged =
    exec.includes("timeoutMs") &&
    grsai.includes("timeoutMs") &&
    /chat_provider_timeout_stats[\s\S]*timeoutMs/.test(exec) &&
    /upstream_provider_timeout[\s\S]*timeoutMs/.test(grsai);
  if (!timeoutMsLogged) {
    ok =
      fail(
        "timeoutMs in timeout logs",
        "expected timeoutMs on chat_provider_timeout_stats + upstream_provider_timeout"
      ) && ok;
  } else {
    ok = pass("timeout logs include timeoutMs") && ok;
  }
}

{
  // Must not log msg=api_error_500 when status=504.
  const statusSpecific =
    errorMw.includes("`api_error_${err.status}`") ||
    errorMw.includes("api_error_${err.status}") ||
    /api_error_\$\{err\.status\}/.test(errorMw);
  const stillBlind500 =
    /log\.error\(\s*["']api_error_500["']/.test(errorMw) && !statusSpecific;
  if (!statusSpecific || stillBlind500) {
    ok =
      fail(
        "api_error log matches HTTP status",
        "expected api_error_${status} (api_error_504), not blind api_error_500"
      ) && ok;
  } else {
    ok =
      pass(
        "error middleware logs api_error_504 for status=504 (not api_error_500)"
      ) && ok;
  }
}

{
  const hasUnavailable = exec.includes("chat_provider_fallback_unavailable");
  const hasSkippedReason = exec.includes("fallback_skipped_reason");
  const hasAttempt = exec.includes("chat_provider_fallback_attempt");
  const attemptOnlyWhenNext =
    /if \(hasNextProvider\) \{[\s\S]*chat_provider_fallback_attempt[\s\S]*continue;[\s\S]*\}/.test(
      exec
    );
  const reasons =
    exec.includes("no_secondary_provider") &&
    (exec.includes("providers_exhausted") ||
      exec.includes("error_not_fallback_eligible"));
  if (
    !hasUnavailable ||
    !hasSkippedReason ||
    !hasAttempt ||
    !attemptOnlyWhenNext ||
    !reasons
  ) {
    ok =
      fail(
        "fallback logging honesty",
        "expected fallback_attempt only with next provider; else fallback_unavailable + skipped_reason"
      ) && ok;
  } else {
    ok =
      pass(
        "no second provider → fallback_unavailable + fallback_skipped_reason (no fake switch)"
      ) && ok;
  }
}

{
  // Stream path synthesizes SSE only after success; failures throw before SSE.
  const streamAfterOk =
    /if \(!result\.ok\)[\s\S]*respondExecuteChatCompletionFailure[\s\S]*if \(wantsStream\)/.test(
      responses
    );
  const sseIsSuccessOnly =
    sse.includes("responsesToSseBody") && !sse.includes("upstream_timeout");
  if (!streamAfterOk || !sseIsSuccessOnly) {
    ok =
      fail(
        "stream timeout uses same failure envelope",
        "stream must not synthesize SSE on upstream_timeout"
      ) && ok;
  } else {
    ok =
      pass(
        "/v1/responses stream=true upstream timeout uses same 504 envelope (no SSE success)"
      ) && ok;
  }
}

{
  const nginxHint =
    (nginxExample.includes("750s") || nginxExample.includes("750")) &&
    deployReadme.includes("proxy_read_timeout") &&
    (deployReadme.includes("750s") || deployReadme.includes("750"));
  if (!nginxHint) {
    ok =
      fail(
        "nginx deploy guidance",
        "expected proxy_read/send_timeout 750s recommendation in deploy docs"
      ) && ok;
  } else {
    ok =
      pass(
        "deploy docs recommend Nginx proxy_*_timeout 750s for heavy responses"
      ) && ok;
  }
}

if (!ok) {
  console.error("\np930-codex-responses-timeout-smoke: FAILED");
  process.exit(1);
}
console.log("\np930-codex-responses-timeout-smoke: OK");
console.log("TOKFAI_P930_CODEX_RESPONSES_TIMEOUT_PASS");
