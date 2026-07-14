/**
 * Shared helpers for Public Beta live scripts.
 * Never log full API keys or upstream brand/host/key material.
 */

export const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|上游供应商|upstream\s+provider|sk-[a-z0-9]{20,}|Bearer\s+sk-/i;

export const FULL_KEY_RE = /sk-tokfai_[a-f0-9]{48}/i;

/** Upstream capacity / latency — gateway OK, model degraded. */
export const UPSTREAM_DEGRADED_CODES = new Set([
  "upstream_timeout",
  "upstream_model_busy",
  "image_generation_timeout",
  "retryable_timeout",
]);

export function maskApiKey(key) {
  if (!key || typeof key !== "string") return "(missing)";
  if (key.length < 16) return "(redacted)";
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

export function normalizeApiBase(raw) {
  const base = (raw?.trim() || "https://api.tokfai.com").replace(/\/+$/, "");
  return base.replace(/\/v1$/i, "");
}

export function extractRequestId(body, res) {
  return (
    body?.request_id ??
    body?.id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    res?.headers?.get?.("x-request-id") ??
    null
  );
}

export function extractModelTrace(body) {
  return {
    model: body?.model ?? null,
    requested_model: body?.tokfai?.requested_model ?? null,
    resolved_model: body?.tokfai?.resolved_model ?? null,
  };
}

/** Numeric credits only — accept number or numeric string. */
export function extractCredits(body) {
  const candidates = [
    body?.credits_charged,
    body?.usage?.credits_charged,
    body?.tokfai?.credits_charged,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function isUpstreamDegradedCode(code) {
  return typeof code === "string" && UPSTREAM_DEGRADED_CODES.has(code);
}

/**
 * Try to recover an error object from JSON body, `_raw`, or SSE frames.
 */
export function extractErrorObject(body, text) {
  if (body?.error && typeof body.error === "object" && !Array.isArray(body.error)) {
    return body.error;
  }
  if (typeof body?.error === "string" && body.error.trim()) {
    return {
      message: body.error,
      code:
        (typeof body.code === "string" && body.code) ||
        "invalid_request_error",
    };
  }
  // Some gateways put message/code at the top level without an error wrapper.
  if (
    typeof body?.message === "string" &&
    body.message.trim() &&
    (typeof body?.code === "string" || typeof body?.type === "string")
  ) {
    return {
      message: body.message,
      code:
        (typeof body.code === "string" && body.code) ||
        (typeof body.type === "string" && body.type) ||
        "invalid_request_error",
      type: typeof body.type === "string" ? body.type : undefined,
      request_id:
        typeof body.request_id === "string" ? body.request_id : undefined,
    };
  }
  const raw =
    typeof text === "string"
      ? text
      : typeof body?._raw === "string"
        ? body._raw
        : "";
  if (!raw) return null;

  // Full JSON error body
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)) {
      return parsed.error;
    }
  } catch {
    // continue
  }

  // SSE: data: {"error":{...}}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)) {
        return parsed.error;
      }
      if (typeof parsed?.code === "string" && typeof parsed?.message === "string") {
        return parsed;
      }
    } catch {
      // continue
    }
  }
  return null;
}

export function assertNoLeaks(label, payload) {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  const leak = text.match(LEAK_RE);
  if (leak) {
    return { ok: false, detail: `${label}: leaked token ${leak[0].slice(0, 24)}` };
  }
  // Full key only if it looks like a complete sk-tokfai_ + 48 hex (not prefix)
  const full = text.match(FULL_KEY_RE);
  if (full) {
    return { ok: false, detail: `${label}: full API key exposed` };
  }
  if (/at\s+\S+\s+\(|Error:\s+.*\n\s+at\s+/.test(text) && /stack/i.test(text)) {
    return { ok: false, detail: `${label}: possible stack leak` };
  }
  return { ok: true };
}

export function safeErrorSummary(body, status, text) {
  const err = extractErrorObject(body, text) ?? {};
  const code =
    (typeof err.code === "string" && err.code) ||
    (typeof body?.code === "string" && body.code) ||
    null;
  const message =
    typeof err.message === "string"
      ? err.message.slice(0, 160)
      : typeof body?.error === "string"
        ? body.error.slice(0, 160)
        : null;
  const requestId =
    (typeof err.request_id === "string" && err.request_id) ||
    extractRequestId(body, null);
  return { status, code, message, request_id: requestId };
}

/**
 * Standard Tokfai error envelope for 4xx/5xx:
 *   { error: { code, message, request_id } }
 * request_id may also appear top-level or in x-request-id.
 */
export function assertStandardErrorEnvelope(body, res, text) {
  const err = extractErrorObject(body, text);
  if (!err || typeof err !== "object") {
    const preview =
      typeof text === "string"
        ? text.slice(0, 180)
        : JSON.stringify(body ?? {}).slice(0, 180);
    return {
      ok: false,
      detail: `missing error object body_preview=${JSON.stringify(preview)}`,
      summary: safeErrorSummary(body, res?.status, text),
    };
  }
  const code =
    (typeof err.code === "string" && err.code.trim()) ||
    (typeof err.type === "string" && err.type.trim()) ||
    "";
  const message = typeof err.message === "string" ? err.message.trim() : "";
  const requestId =
    (typeof err.request_id === "string" && err.request_id.trim()) ||
    extractRequestId(body, res) ||
    "";

  if (!code || !message || !requestId) {
    return {
      ok: false,
      detail: `incomplete envelope code=${code || "null"} message=${message ? "ok" : "null"} request_id=${requestId || "null"}`,
      summary: {
        status: res?.status ?? null,
        code: code || null,
        message: message ? message.slice(0, 160) : null,
        request_id: requestId || null,
      },
    };
  }

  return {
    ok: true,
    summary: {
      status: res?.status ?? null,
      code,
      message: message.slice(0, 160),
      request_id: requestId,
    },
  };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}
