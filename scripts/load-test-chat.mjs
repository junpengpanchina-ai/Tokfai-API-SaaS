#!/usr/bin/env node
/**
 * Tokfai chat completions load smoke test (P759 / P761).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/load-test-chat.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   TOKFAI_MODEL           default auto-fast
 *   TOTAL_REQUESTS         default 100
 *   CONCURRENCY            default 5
 *   STOP_ON_ERROR_RATE     default 1 (disabled); e.g. 0.2 stops when errors > 20%
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.TOKFAI_MODEL ?? "auto-fast";
const TOTAL_REQUESTS = Math.max(
  1,
  parseInt(process.env.TOTAL_REQUESTS ?? "100", 10) || 100
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "5", 10) || 5
);
const STOP_ON_ERROR_RATE = Math.min(
  1,
  Math.max(0, parseFloat(process.env.STOP_ON_ERROR_RATE ?? "1") || 1)
);

const PROMPT = "Say ok only.";
const ENDPOINT = `${BASE}/chat/completions`;
const RESULTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "load-test-results"
);
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const GATEWAY_ERROR_CODES = [
  "too_many_requests",
  "too_many_concurrent_requests",
  "gateway_overloaded",
  "upstream_timeout",
  "upstream_model_busy",
  "all_upstreams_unavailable",
  "upstream_error",
  "request_body_too_large",
];

/** Infer stable error code when body is missing or unparsed (e.g. proxy HTML). */
function inferErrorCode(status, parsedCode) {
  if (parsedCode) return parsedCode;
  if (status === 429) return "too_many_requests";
  if (status === 503) return "gateway_overloaded";
  if (status === 504) return "upstream_timeout";
  if (status === 413) return "request_body_too_large";
  if (status === 0) return "network_error";
  return null;
}

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

    const errorCode =
      inferErrorCode(res.status, body?.error?.code ?? null) ??
      (res.status === 0 ? "network_error" : `http_${res.status}`);
    const requestId =
      body?.request_id ??
      body?.tokfai?.request_id ??
      res.headers.get("x-request-id") ??
      null;
    const resolvedModel = body?.model ?? body?.tokfai?.resolved_model ?? null;
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
      resolvedModel,
      creditsCharged: res.ok ? credits : 0,
      rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
    };
  } catch (err) {
    return {
      index,
      ok: false,
      status: 0,
      errorCode: "network_error",
      latencyMs: performance.now() - started,
      requestId: null,
      resolvedModel: null,
      creditsCharged: 0,
      networkMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runPool(total, concurrency, worker, shouldStop) {
  const results = [];
  let next = 0;
  let stoppedEarly = false;

  async function workerLoop() {
    while (true) {
      if (shouldStop()) {
        stoppedEarly = true;
        return;
      }
      const i = next;
      next += 1;
      if (i >= total) return;
      const result = await worker(i);
      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, total) },
    () => workerLoop()
  );
  await Promise.all(workers);
  return { results, stoppedEarly };
}

function buildSummary(results, wallMs, stoppedEarly) {
  const statusCounts = {};
  const errorCounts = {};
  const gatewayCounts = Object.fromEntries(
    GATEWAY_ERROR_CODES.map((code) => [code, 0])
  );
  const latencies = [];
  let success = 0;
  let failed = 0;
  let totalCredits = 0;
  let http429 = 0;
  const requestIdSamples = [];

  for (const r of results) {
    const statusKey = r.status === 0 ? "network" : String(r.status);
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

    if (r.status === 429) http429 += 1;

    if (r.ok) {
      success += 1;
      totalCredits += r.creditsCharged;
    } else {
      failed += 1;
      const code = r.errorCode ?? `http_${r.status}`;
      errorCounts[code] = (errorCounts[code] ?? 0) + 1;
      if (code in gatewayCounts) {
        gatewayCounts[code] += 1;
      }
    }

    latencies.push(r.latencyMs);

    if (r.requestId && requestIdSamples.length < 5) {
      requestIdSamples.push(r.requestId);
    }
  }

  latencies.sort((a, b) => a - b);
  const completed = results.length;
  const errorRate = completed > 0 ? failed / completed : 0;
  const rps = wallMs > 0 ? (completed / wallMs) * 1000 : 0;

  return {
    endpoint: ENDPOINT,
    model: MODEL,
    apiKeyMask: maskKey(API_KEY),
    totalPlanned: TOTAL_REQUESTS,
    totalCompleted: completed,
    concurrency: CONCURRENCY,
    stopOnErrorRate: STOP_ON_ERROR_RATE,
    stoppedEarly,
    success,
    failed,
    successRate: completed > 0 ? success / completed : 0,
    errorRate,
    http429,
    wallTimeMs: Math.round(wallMs),
    rps,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies.at(-1) ?? 0),
    },
    creditsSum: totalCredits,
    statusCounts,
    errorCounts,
    gatewayErrorCounts: gatewayCounts,
    requestIdSamples,
    finishedAt: new Date().toISOString(),
  };
}

function printReport(summary) {
  console.log("");
  console.log("=== Tokfai chat load test summary ===");
  console.log(`endpoint:     ${summary.endpoint}`);
  console.log(`model:        ${summary.model}`);
  console.log(`api_key:      ${summary.apiKeyMask}`);
  console.log(`planned:      ${summary.totalPlanned}`);
  console.log(`completed:    ${summary.totalCompleted}`);
  console.log(`concurrency:  ${summary.concurrency}`);
  if (summary.stoppedEarly) {
    console.log(`stopped:      early (error rate > ${summary.stopOnErrorRate * 100}%)`);
  }
  console.log(`success:      ${summary.success}`);
  console.log(`failed:       ${summary.failed}`);
  console.log(`success_rate: ${(summary.successRate * 100).toFixed(2)}%`);
  console.log(`http_429:     ${summary.http429}`);
  console.log(`wall_time_ms: ${summary.wallTimeMs}`);
  console.log(`rps:          ${summary.rps.toFixed(2)}`);
  console.log(`latency_p50:  ${summary.latencyMs.p50} ms`);
  console.log(`latency_p95:  ${summary.latencyMs.p95} ms`);
  console.log(`latency_max:  ${summary.latencyMs.max} ms`);
  console.log(`credits_sum:  ${summary.creditsSum.toFixed(6)}`);
  console.log("");
  console.log("Gateway / upstream error codes:");
  for (const [k, v] of Object.entries(summary.gatewayErrorCounts)) {
    if (v > 0) console.log(`  ${k}: ${v}`);
  }
  console.log("");
  console.log("HTTP status distribution:");
  for (const [k, v] of Object.entries(summary.statusCounts).sort()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("");
  console.log("Error code distribution (failed only):");
  if (Object.keys(summary.errorCounts).length === 0) {
    console.log("  (none)");
  } else {
    for (const [k, v] of Object.entries(summary.errorCounts).sort()) {
      console.log(`  ${k}: ${v}`);
    }
  }
  console.log("");
  console.log("request_id samples:");
  for (const id of summary.requestIdSamples) {
    console.log(`  ${id}`);
  }
  console.log("");
  console.log(`JSON summary: ${RESULTS_FILE}`);
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
    `Starting load test: ${TOTAL_REQUESTS} requests, concurrency ${CONCURRENCY}, model ${MODEL}`
  );
  if (STOP_ON_ERROR_RATE < 1) {
    console.log(`Early stop enabled when error rate > ${STOP_ON_ERROR_RATE * 100}%`);
  }

  const wallStart = performance.now();
  const { results, stoppedEarly } = await runPool(
    TOTAL_REQUESTS,
    CONCURRENCY,
    runOne,
    () => {
      if (STOP_ON_ERROR_RATE >= 1 || results.length < 5) return false;
      const failed = results.filter((r) => !r.ok).length;
      return failed / results.length > STOP_ON_ERROR_RATE;
    }
  );
  const wallMs = performance.now() - wallStart;

  const summary = buildSummary(results, wallMs, stoppedEarly);
  printReport(summary);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
