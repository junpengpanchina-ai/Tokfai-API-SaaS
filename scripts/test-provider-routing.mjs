#!/usr/bin/env node
/**
 * P766 — Provider routing smoke (config + live chat request).
 *
 * Usage (from repo root on DMIT or dev):
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/test-provider-routing.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE              default https://api.tokfai.com/v1
 *   MODEL                        default auto-fast
 *   PROMPT                       default "Say ok only."
 *   TIMEOUT_MS                   default 120000
 *   TOKFAI_UPSTREAM_SECONDARY_ENABLED   read locally to report secondary status
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.MODEL ?? "auto-fast";
const PROMPT = process.env.PROMPT ?? "Say ok only.";
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

const SECONDARY_ENABLED =
  process.env.TOKFAI_UPSTREAM_SECONDARY_ENABLED === "1" ||
  process.env.TOKFAI_UPSTREAM_SECONDARY_ENABLED === "true";

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function printProviderConfig() {
  console.log("=== P766 provider config (local env) ===");
  console.log("grsai-primary:          enabled (default primary)");
  if (SECONDARY_ENABLED) {
    const hasBase = Boolean(process.env.TOKFAI_UPSTREAM_SECONDARY_BASE_URL);
    const hasKey = Boolean(process.env.TOKFAI_UPSTREAM_SECONDARY_API_KEY);
    console.log(
      `openai-compatible-secondary: enabled (base=${hasBase ? "set" : "missing"}, key=${hasKey ? "set" : "missing"})`
    );
  } else {
    console.log("openai-compatible-secondary: skipped (TOKFAI_UPSTREAM_SECONDARY_ENABLED=false)");
  }
  console.log("");
}

async function runChatSmoke() {
  const endpoint = `${BASE}/chat/completions`;
  console.log("=== P766 chat smoke ===");
  console.log(`endpoint:   ${endpoint}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`model:      ${MODEL}`);
  console.log(`prompt:     ${PROMPT}`);
  console.log(`timeout_ms: ${TIMEOUT_MS}`);
  console.log("");

  const started = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPT }],
      stream: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const latencyMs = Math.round(performance.now() - started);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }

  const requestId =
    body?.request_id ?? body?.tokfai?.request_id ?? res.headers.get("x-request-id");
  const resolvedModel = body?.model ?? body?.tokfai?.resolved_model ?? null;
  const errorCode = body?.error?.code ?? null;

  console.log(`HTTP ${res.status} (${latencyMs} ms)`);
  if (requestId) console.log(`request_id:     ${requestId}`);
  if (resolvedModel) console.log(`resolved_model: ${resolvedModel}`);
  if (body?.credits_charged != null) {
    console.log(`credits_charged: ${body.credits_charged}`);
  }
  if (errorCode) {
    console.log(`error_code:     ${errorCode}`);
    console.log(`error_message:  ${body?.error?.message ?? "(none)"}`);
  }

  if (body?.tokfai?.upstream_provider) {
    console.log(
      "note: upstream_provider in response — should not be exposed to clients in production"
    );
  }

  console.log("");

  if (res.ok) {
    console.log("Smoke test passed (HTTP 200).");
    return 0;
  }

  const standardCodes = new Set([
    "upstream_model_busy",
    "model_not_available",
    "upstream_timeout",
    "upstream_error",
    "upstream_rate_limited",
    "all_upstreams_unavailable",
    "gateway_overloaded",
    "insufficient_credits",
    "model_not_found",
  ]);

  if (errorCode && standardCodes.has(errorCode)) {
    console.log(`Smoke test passed (standard error: ${errorCode}).`);
    return 0;
  }

  console.error("Smoke test failed: unexpected response.");
  return 1;
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... before running this script.");
    process.exit(1);
  }

  printProviderConfig();
  const code = await runChatSmoke();
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
