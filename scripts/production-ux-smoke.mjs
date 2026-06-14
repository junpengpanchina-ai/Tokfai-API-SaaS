#!/usr/bin/env node
/**
 * P767.4 — Production UX smoke (API key auth, no dashboard JWT).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/production-ux-smoke.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com/v1
 *   MODEL=auto-fast
 *   TIMEOUT_MS=120000
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = (process.env.MODEL ?? "auto-fast").trim();
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function truncate(text, max = 240) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
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
    body = { raw: truncate(text) };
  }
  return { url, res, body, text };
}

function printApiError(res, body) {
  const code =
    body?.error?.code ??
    body?.code ??
    (typeof body?.error === "string" ? body.error : undefined);
  const message =
    body?.error?.message ??
    (typeof body?.error === "string" ? body.error : undefined) ??
    truncate(body?.raw ?? "");
  const requestId =
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    res.headers.get("x-request-id");

  console.log(`  HTTP ${res.status}`);
  if (code) console.log(`  error.code: ${code}`);
  if (message) console.log(`  error.message: ${truncate(message)}`);
  if (requestId) console.log(`  request_id: ${requestId}`);
}

async function main() {
  console.log("=== P767.4 production UX smoke ===");
  console.log(`base:    ${BASE}`);
  console.log(`model:   ${MODEL}`);
  console.log(`api_key: ${maskKey(API_KEY)}`);
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... before running.");
    process.exit(1);
  }

  let failures = 0;

  {
    const { res, body } = await fetchJson("/models", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    console.log("GET /v1/models");
    if (!res.ok) {
      printApiError(res, body);
      failures += 1;
    } else {
      console.log(`  HTTP ${res.status} (${count} models)`);
    }
    console.log("");
  }

  {
    const started = performance.now();
    const { res, body } = await fetchJson("/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    console.log(`POST /v1/chat/completions model=${MODEL}`);
    if (!res.ok) {
      printApiError(res, body);
      failures += 1;
    } else {
      const requestId =
        body?.request_id ??
        body?.tokfai?.request_id ??
        res.headers.get("x-request-id");
      const resolvedModel =
        body?.tokfai?.resolved_model ?? body?.model ?? "(missing)";
      console.log(`  HTTP ${res.status} (${latencyMs} ms)`);
      if (requestId) console.log(`  request_id: ${requestId}`);
      console.log(`  resolved_model: ${resolvedModel}`);
      if (!requestId) {
        console.log("  WARN: response missing request_id");
        failures += 1;
      }
      if (!resolvedModel || resolvedModel === "(missing)") {
        console.log("  WARN: response missing resolved model");
        failures += 1;
      }
    }
    console.log("");
  }

  if (failures > 0) {
    console.error(`FAILED (${failures} check(s))`);
    process.exit(1);
  }

  console.log("PASS — models list and chat completion smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
