import { env } from "./env.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = LEVELS[env.LOG_LEVEL];
const ALLOWED_FIELD_KEYS = new Set([
  "requestId",
  "route",
  "status",
  "code",
  "message",
  "userId",
  "adminUserId",
  "email",
  "authSource",
  "model",
  "stream",
  "bodyKeys",
  "droppedKeys",
  "droppedKeyCount",
  "messagesCount",
  "contentShape",
  "rejectedReason",
  "normalized",
  "noop",
  "zodErrors",
  "validationErrors",
  "upstreamHost",
  "upstreamPath",
  "upstreamStatus",
  "upstreamErrorCode",
  "upstreamCode",
  "upstreamErrorMessage",
  "latencyMs",
  "grsaiBaseHost",
  "grsaiChatPath",
  "grsaiApiKeyMask",
  "requestedModel",
  "resolvedModel",
  "upstreamModel",
  "attemptModel",
  "attemptIndex",
  "apiKeyId",
  "limitKey",
  "keyInflight",
  "globalInflight",
  "reason",
  "limit",
  "current",
  "key_hash",
  "request_id",
  "rate_limit_policy",
  "dbErrorMessage",
  "tokenPrefix",
  "keyId",
  "providerId",
  "providerIndex",
  "dbErrorCode",
  "stage",
  "dbErrorDetails",
  "dbErrorHint",
  "errorName",
  "resourceType",
  "resourceId",
  "action",
  "planId",
  "orderId",
  "stripeCustomerId",
  "stripeErrorCode",
  "stripeErrorType",
  "stripeErrorParam",
  "recreatedCustomer",
  // P961 image cost reconciliation / orphan cost guard
  "tokfai_request_id",
  "provider_task_id",
  "upstream_request_id",
  "provider_status",
  "customer_billing_status",
  "credits_charged",
  "reconcile_result",
  "reconcile_status",
  "orphan_cost_audit",
  "orphan_alarms",
  // P993 image circuit breaker
  "breaker_key",
  "breaker_state_before",
  "breaker_state_after",
  "attempt_model",
  "requested_model",
  "resolved_model",
  "fallback_used",
  "failure_category",
  "task_id",
  "provider",
  // P970 Cursor / OpenAI tool call compatibility
  "attemptedModel",
  "supportsTools",
  "supportsToolsRequested",
  "hasTools",
  "toolChoice",
  "toolsFallbackApplied",
  "attempts",
  "billing_status",
  "finish_reason",
  "timeoutMs",
  "idleTimeoutMs",
  "totalTimeoutMs",
  "tier",
  "isHeavy",
  "clientStream",
  "viaStreamFallback",
  "fallbackSkippedReason",
  // P971 fake tool-call guard
  "requireToolCall",
  "strictToolCall",
  "upstreamReturnedToolCalls",
  "finishReason",
  "fakeToolCallGuard",
  "autoNoToolCall",
]);

const SENSITIVE_LOG_KEY_LITERAL =
  /database_url|postgres|service_role|api_key|authorization|\bbearer\b|cookie|password|\bsecret\b|\btoken\b|supabase|stripe|webhook/i;

function scrubBodyKeysLogValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!SENSITIVE_LOG_KEY_LITERAL.test(value)) return value;
  // Never leave forbidden key-name literals in log lines (HGK dirty greps).
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  const safe: string[] = [];
  let redacted = 0;
  for (const part of parts) {
    const m = /^redacted_keys:(\d+)$/i.exec(part);
    if (m) {
      redacted += Number(m[1]) || 0;
      continue;
    }
    if (SENSITIVE_LOG_KEY_LITERAL.test(part)) {
      redacted += 1;
      continue;
    }
    safe.push(part);
  }
  if (redacted > 0) safe.push(`redacted_keys:${redacted}`);
  return safe.join(",");
}

/**
 * Minimal structured logger. Emits one JSON line per call so containers /
 * log aggregators can parse it. Keep secrets out — never log API keys,
 * JWTs, Stripe payloads in full, or anything with raw user content.
 */
function sanitizeFields(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELD_KEYS.has(key)) continue;
    if (key === "bodyKeys" || key === "droppedKeys") {
      out[key] = scrubBodyKeysLogValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...sanitizeFields(fields),
  };
  // Stdout for info, stderr for warn+.
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) =>
    emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) =>
    emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) =>
    emit("error", msg, fields),
};
