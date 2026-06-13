#!/usr/bin/env node
/**
 * P758 — End-to-end Tokfai API chat chain smoke (requires sk-tokfai key).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-tokfai-chat-chain.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com/v1
 *   MODELS=gpt-5.4,gpt-4o-mini
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODELS = (process.env.MODELS ?? "gpt-5.4,gpt-4o-mini")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function truncate(text, max = 200) {
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

async function main() {
  console.log("=== P758 Tokfai chat chain smoke ===");
  console.log(`base:    ${BASE}`);
  console.log(`api_key: ${maskKey(API_KEY)}`);
  console.log("");

  {
    const { res, body } = await fetchJson("/health");
    console.log(`GET /health → HTTP ${res.status}`);
    if (body?.upstream) {
      console.log(`  grsai_host: ${body.upstream.grsaiBaseHost ?? "(n/a)"}`);
      console.log(`  grsai_path: ${body.upstream.grsaiChatPath ?? "(n/a)"}`);
      console.log(
        `  grsai_key:  ${body.upstream.grsaiApiKeyMask ?? "(n/a)"}`
      );
      if (Array.isArray(body.upstream.providers)) {
        for (const p of body.upstream.providers) {
          console.log(
            `  provider ${p.id}: enabled=${p.enabled} host=${p.host} path=${p.chatPath}`
          );
        }
      }
    }
    console.log("");
  }

  {
    const { res, body } = await fetchJson("/models");
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    console.log(`GET /models → HTTP ${res.status} (${count} models)`);
    console.log("");
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.log("Skip chat tests — set TOKFAI_API_KEY=sk-tokfai_...");
    process.exit(0);
  }

  let failures = 0;
  for (const model of MODELS) {
    const started = performance.now();
    const { res, body } = await fetchJson("/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    const requestId =
      body?.request_id ??
      body?.tokfai?.request_id ??
      res.headers.get("x-request-id");
    console.log(`POST /chat/completions model=${model}`);
    console.log(`  HTTP ${res.status} (${latencyMs} ms)`);
    if (requestId) console.log(`  request_id: ${requestId}`);
    if (body?.error) {
      console.log(`  error_code: ${body.error.code ?? "(none)"}`);
      console.log(`  error_msg:  ${truncate(body.error.message)}`);
      failures += 1;
    } else if (body?.model) {
      console.log(`  resolved_model: ${body.model}`);
    }
    console.log("");
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
