#!/usr/bin/env node
/**
 * Tokfai chat completions load smoke test (P759).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/load-test-chat.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE   default https://api.tokfai.com/v1
 *   TOKFAI_MODEL      default gemini-3-flash
 *   TOTAL_REQUESTS    default 100
 *   CONCURRENCY       default 5
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.TOKFAI_MODEL ?? "gemini-3-flash";
const TOTAL_REQUESTS = Math.max(
  1,
  parseInt(process.env.TOTAL_REQUESTS ?? "100", 10) || 100
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "5", 10) || 5
);

const PROMPT = "Say ok only.";
const ENDPOINT = `${BASE}/chat/completions`;

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function runOne(index) {
  const started = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
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

    const latencyMs = performance.now() - started;
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { parse_error: true, raw: text.slice(0, 200) };
    }

    const errorCode = body?.error?.code ?? null;
    const requestId =
      body?.request_id ??
      body?.tokfai?.request_id ??
      res.headers.get("x-request-id") ??
      null;
    const credits =
      typeof body?.credits_charged === "number"
        ? body.credits_charged
        : typeof body?.tokfai?.credits_charged === "number"
          ? body.tokfai.credits_charged
          : 0;

    return {
      index,
      ok: res.ok,
      status: res.status,
      errorCode,
      latencyMs,
      requestId,
      creditsCharged: res.ok ? credits : 0,
    };
  } catch (err) {
    return {
      index,
      ok: false,
      status: 0,
      errorCode: "network_error",
      latencyMs: performance.now() - started,
      requestId: null,
      creditsCharged: 0,
      networkMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runPool(total, concurrency, worker) {
  const results = new Array(total);
  let next = 0;

  async function workerLoop() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      results[i] = await worker(i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, total) },
    () => workerLoop()
  );
  await Promise.all(workers);
  return results;
}

function printReport(results, wallMs) {
  const statusCounts = {};
  const errorCounts = {};
  const latencies = [];
  let success = 0;
  let failed = 0;
  let totalCredits = 0;
  const requestIdSamples = [];

  for (const r of results) {
    const statusKey = r.status === 0 ? "network" : String(r.status);
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

    if (r.ok) {
      success += 1;
      totalCredits += r.creditsCharged;
    } else {
      failed += 1;
      const code = r.errorCode ?? `http_${r.status}`;
      errorCounts[code] = (errorCounts[code] ?? 0) + 1;
    }

    latencies.push(r.latencyMs);

    if (r.requestId && requestIdSamples.length < 5) {
      requestIdSamples.push(r.requestId);
    }
  }

  latencies.sort((a, b) => a - b);
  const rps = wallMs > 0 ? (results.length / wallMs) * 1000 : 0;

  console.log("");
  console.log("=== Tokfai chat load test summary ===");
  console.log(`endpoint:     ${ENDPOINT}`);
  console.log(`model:        ${MODEL}`);
  console.log(`api_key:      ${maskKey(API_KEY)}`);
  console.log(`total:        ${results.length}`);
  console.log(`concurrency:  ${CONCURRENCY}`);
  console.log(`success:      ${success}`);
  console.log(`failed:       ${failed}`);
  console.log(`success_rate: ${((success / results.length) * 100).toFixed(2)}%`);
  console.log(`wall_time_ms: ${Math.round(wallMs)}`);
  console.log(`rps:          ${rps.toFixed(2)}`);
  console.log(`latency_p50:  ${percentile(latencies, 50).toFixed(0)} ms`);
  console.log(`latency_p95:  ${percentile(latencies, 95).toFixed(0)} ms`);
  console.log(`latency_max:  ${(latencies.at(-1) ?? 0).toFixed(0)} ms`);
  console.log(`credits_sum:  ${totalCredits.toFixed(6)}`);
  console.log("");
  console.log("HTTP status distribution:");
  for (const [k, v] of Object.entries(statusCounts).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("");
  console.log("Error code distribution (failed only):");
  if (Object.keys(errorCounts).length === 0) {
    console.log("  (none)");
  } else {
    for (const [k, v] of Object.entries(errorCounts).sort()) {
      console.log(`  ${k}: ${v}`);
    }
  }
  console.log("");
  console.log("request_id samples:");
  for (const id of requestIdSamples) {
    console.log(`  ${id}`);
  }
  console.log("");
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(
      "Set TOKFAI_API_KEY=sk-tokfai_... before running this script."
    );
    process.exit(1);
  }

  console.log(
    `Starting load test: ${TOTAL_REQUESTS} requests, concurrency ${CONCURRENCY}`
  );

  const wallStart = performance.now();
  const results = await runPool(TOTAL_REQUESTS, CONCURRENCY, runOne);
  const wallMs = performance.now() - wallStart;

  printReport(results, wallMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
