#!/usr/bin/env node
/**
 * P764 — Redis gateway state smoke test.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/test-redis-gateway-state.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   CONCURRENT_REQUESTS    default 3
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const CONCURRENT_REQUESTS = Math.max(
  1,
  parseInt(process.env.CONCURRENT_REQUESTS ?? "3", 10) || 3
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

async function fetchHealth() {
  const res = await fetch(`${BASE}/health`);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function chatRequest(index) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "auto-fast",
      messages: [{ role: "user", content: `Say ok only. Probe ${index}.` }],
      stream: false,
    }),
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }

  return {
    index,
    status: res.status,
    rateLimitLimit: res.headers.get("x-ratelimit-limit"),
    rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
    rateLimitReset: res.headers.get("x-ratelimit-reset"),
    errorCode: body?.error?.code ?? null,
  };
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(
      "Set TOKFAI_API_KEY=sk-tokfai_... before running this script."
    );
    process.exit(1);
  }

  console.log("=== P764 redis gateway state smoke test ===");
  console.log(`api_base:   ${BASE}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log("");

  console.log("Checking /v1/health…");
  const { res: healthRes, body: health } = await fetchHealth();
  if (!healthRes.ok) {
    console.error("Health check failed:", healthRes.status, health);
    process.exit(1);
  }

  const redis = health.redis ?? {};
  console.log(`  redis.enabled=${redis.enabled ?? false}`);
  console.log(`  redis.connected=${redis.connected ?? false}`);

  if (!redis.enabled) {
    console.log("");
    console.log(
      "Redis is disabled — DMIT is using in-memory gateway fallback (expected default)."
    );
  } else if (!redis.connected) {
    console.log("");
    console.log(
      "Redis is enabled but not connected — DMIT should be using in-memory fallback."
    );
  }

  console.log("");
  console.log(`Sending ${CONCURRENT_REQUESTS} concurrent chat requests…`);
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => chatRequest(i + 1))
  );

  for (const result of results) {
    console.log(
      `  [${result.index}] status=${result.status} error=${result.errorCode ?? "-"} limit=${result.rateLimitLimit ?? "-"} remaining=${result.rateLimitRemaining ?? "-"} reset=${result.rateLimitReset ?? "-"}`
    );
  }

  const hasRateLimitHeaders = results.every(
    (result) => result.rateLimitLimit && result.rateLimitReset
  );
  const allHandled = results.every(
    (result) =>
      result.status === 200 ||
      result.errorCode === "too_many_requests" ||
      result.errorCode === "too_many_concurrent_requests" ||
      result.errorCode === "gateway_overloaded"
  );

  if (!hasRateLimitHeaders) {
    console.error("");
    console.error("Missing X-RateLimit-* headers on one or more responses.");
    process.exit(1);
  }

  if (!allHandled) {
    console.error("");
    console.error("Unexpected response codes from concurrent probe.");
    process.exit(1);
  }

  console.log("");
  console.log("Redis gateway state smoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
