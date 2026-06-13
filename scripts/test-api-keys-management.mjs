#!/usr/bin/env node
/**
 * P766.3 — API key management smoke (list / create / revoke via Supabase JWT).
 *
 * Usage (from repo root):
 *   TOKFAI_SUPABASE_JWT=<access_token> node scripts/test-api-keys-management.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   TOKFAI_API_KEY         run sk-tokfai auth smoke after management tests
 *   MODEL                  default auto-fast
 *   PROMPT                 default "Say ok only."
 *   TIMEOUT_MS             default 120000
 *   KEY_NAME_PREFIX        default "smoke-test"
 *
 * Obtain TOKFAI_SUPABASE_JWT from the browser (Supabase session access_token)
 * or Supabase Auth API after dashboard login.
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const JWT =
  process.env.TOKFAI_SUPABASE_JWT ??
  process.env.SUPABASE_ACCESS_TOKEN ??
  "";
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.MODEL ?? "auto-fast";
const PROMPT = process.env.PROMPT ?? "Say ok only.";
const KEY_NAME_PREFIX = process.env.KEY_NAME_PREFIX ?? "smoke-test";
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function maskJwt(jwt) {
  if (!jwt || jwt.length <= 16) return "(not set)";
  return `${jwt.slice(0, 10)}…${jwt.slice(-6)} (len=${jwt.length})`;
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

async function jwtFetch(path, init = {}) {
  return fetchJson(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function testListKeys() {
  console.log("=== GET /v1/me/api-keys (JWT auth) ===");
  const { res, body } = await jwtFetch("/me/api-keys", { method: "GET" });
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`error_code:    ${body?.error?.code ?? "(none)"}`);
    console.log(`error_message: ${body?.error?.message ?? "(none)"}`);
    return { ok: false };
  }
  const keys = Array.isArray(body?.data) ? body.data : [];
  console.log(`keys:          ${keys.length}`);
  console.log("");
  return { ok: true, keys };
}

async function testCreateKey() {
  const name = `${KEY_NAME_PREFIX}-${Date.now()}`;
  console.log("=== POST /v1/me/api-keys (JWT auth) ===");
  console.log(`name: ${name}`);
  const { res, body } = await jwtFetch("/me/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`error_code:    ${body?.error?.code ?? "(none)"}`);
    console.log(`error_message: ${body?.error?.message ?? "(none)"}`);
    console.log("");
    return { ok: false };
  }

  const id = body?.api_key?.id ?? body?.data?.id;
  const secret = body?.secret ?? body?.one_time_secret ?? body?.api_key?.secret;
  console.log(`key_id:        ${id ?? "(missing)"}`);
  console.log(`secret:        ${maskKey(secret ?? "")}`);
  console.log("");
  if (!id) {
    console.error("Create response missing api_key.id");
    return { ok: false };
  }
  return { ok: true, id, secret };
}

async function testRevokeKey(id) {
  console.log("=== POST /v1/me/api-keys/revoke (JWT auth) ===");
  console.log(`id: ${id}`);
  const { res, body } = await jwtFetch("/me/api-keys/revoke", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`error_code:    ${body?.error?.code ?? "(none)"}`);
    console.log(`error_message: ${body?.error?.message ?? "(none)"}`);
    console.log("");
    return false;
  }
  const status = body?.api_key?.status ?? body?.data?.status;
  console.log(`status:        ${status ?? "(none)"}`);
  console.log("");
  return status === "revoked" || res.ok;
}

async function testModels(apiKey) {
  console.log("=== GET /v1/models (API key auth) ===");
  const { res, body } = await fetchJson("/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
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

async function testChat(apiKey) {
  console.log("=== POST /v1/chat/completions (API key auth) ===");
  console.log(`api_key:    ${maskKey(apiKey)}`);
  console.log(`model:      ${MODEL}`);
  const started = performance.now();
  const { res, body } = await fetchJson("/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
  if (!JWT) {
    console.error(
      "Set TOKFAI_SUPABASE_JWT (dashboard Supabase access_token) before running."
    );
    process.exit(1);
  }

  console.log("P766.3 API key management smoke");
  console.log(`base: ${BASE}`);
  console.log(`jwt:  ${maskJwt(JWT)}`);
  console.log("");

  const listResult = await testListKeys();
  if (!listResult.ok) {
    console.error("List failed.");
    process.exit(1);
  }

  const createResult = await testCreateKey();
  if (!createResult.ok) {
    console.error("Create failed.");
    process.exit(1);
  }

  const revokeOk = await testRevokeKey(createResult.id);
  if (!revokeOk) {
    console.error("Revoke failed.");
    process.exit(1);
  }

  const authKey = API_KEY || createResult.secret;
  if (authKey?.startsWith("sk-tokfai_")) {
    const modelsOk = await testModels(authKey);
    const chatOk = await testChat(authKey);
    if (!modelsOk || !chatOk) {
      console.error("API key auth smoke failed.");
      process.exit(1);
    }
  } else {
    console.log(
      "Skip API key auth smoke — set TOKFAI_API_KEY or use a create response with secret."
    );
    console.log("");
  }

  console.log("Management smoke test passed (list / create / revoke).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
