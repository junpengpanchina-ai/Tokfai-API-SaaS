/**
 * Shared helpers for Public Beta live scripts.
 * Never log full API keys or upstream brand/host/key material.
 */

export const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|上游供应商|upstream\s+provider|sk-[a-z0-9]{20,}|Bearer\s+sk-/i;

export const FULL_KEY_RE = /sk-tokfai_[a-f0-9]{48}/i;

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

export function extractCredits(body) {
  if (typeof body?.credits_charged === "number") return body.credits_charged;
  if (typeof body?.usage?.credits_charged === "number") {
    return body.usage.credits_charged;
  }
  if (typeof body?.tokfai?.credits_charged === "number") {
    return body.tokfai.credits_charged;
  }
  if (body?.usage && typeof body.usage === "object") return body.usage;
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

export function safeErrorSummary(body, status) {
  const code = body?.error?.code ?? body?.code ?? null;
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message.slice(0, 160)
      : typeof body?.error === "string"
        ? body.error.slice(0, 160)
        : null;
  const requestId = extractRequestId(body, null);
  return { status, code, message, request_id: requestId };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}
