#!/usr/bin/env node
/**
 * P766.1 — API key auth smoke (management routes need a Supabase JWT).
 *
 * Usage (from repo root):
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/test-api-keys-management.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE   default https://api.tokfai.com/v1
 *   MODEL             default auto-fast
 *   PROMPT            default "Say ok only."
 *   TIMEOUT_MS        default 120000
 *
 * Dashboard create / revoke / reveal require a user Supabase access token and
 * are not exercised here. Create a key in /dashboard/api-keys, then run this
 * script with the one-time secret.
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

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

async function fetchJson(path, init = {}) {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { res, body, url };
}

async function testModels() {
  console.log("=== GET /v1/models (API key auth) ===");
  const { res, body } = await fetchJson("/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`error_code:    ${body?.error?.code ?? "(none)"}`);
    console.log(`error_message: ${body?.error?.message ?? "(none)"}`);
    return false;
  }
  const count = Array.isArray(body?.data) ? body.data.length : 0;
  console.log(`models:        ${count}`);
  console.log("");
  return true;
}

async function testChat() {
  console.log("=== POST /v1/chat/completions (API key auth) ===");
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`model:      ${MODEL}`);
  const started = performance.now();
  const { res, body } = await fetchJson("/chat/completions", {
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
  });
  const latencyMs = Math.round(performance.now() - started);
  console.log(`HTTP ${res.status} (${latencyMs} ms)`);
  const requestId =
    body?.request_id ?? body?.tokfai?.request_id ?? res.headers.get("x-request-id");
  if (requestId) console.log(`request_id:     ${requestId}`);
  if (body?.model) console.log(`resolved_model: ${body.model}`);
  if (body?.error?.code) {
    console.log(`error_code:     ${body.error.code}`);
    console.log(`error_message:  ${body.error.message ?? "(none)"}`);
  }
  console.log("");

  if (res.ok) return true;

  const acceptable = new Set([
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
  if (body?.error?.code && acceptable.has(body.error.code)) {
    console.log(`Acceptable upstream/billing error: ${body.error.code}`);
    return true;
  }
  return false;
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_<48 hex> before running.");
    process.exit(1);
  }

  console.log("P766.1 API key auth smoke");
  console.log(`base: ${BASE}`);
  console.log("");
  console.log(
    "Note: POST /v1/me/api-keys create/revoke/reveal need a Supabase JWT — test those in the dashboard."
  );
  console.log("");

  const modelsOk = await testModels();
  const chatOk = await testChat();

  if (modelsOk && chatOk) {
    console.log("Smoke test passed.");
    process.exit(0);
  }
  console.error("Smoke test failed.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
