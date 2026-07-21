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
  "messagesCount",
  "contentShape",
  "rejectedReason",
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
  "attemptModel",
  "attemptIndex",
  "apiKeyId",
  "limitKey",
  "keyInflight",
  "globalInflight",
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
]);

/**
 * Minimal structured logger. Emits one JSON line per call so containers /
 * log aggregators can parse it. Keep secrets out — never log API keys,
 * JWTs, Stripe payloads in full, or anything with raw user content.
 */
function sanitizeFields(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELD_KEYS.has(key)) {
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
