#!/usr/bin/env node
/**
 * P762.5 — Model health probe (multi-model diagnostics).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-model-health.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   MODELS                 comma-separated model IDs
 *   REQUESTS_PER_MODEL     default 5
 *   CONCURRENCY            default 1
 *   PROMPT                 default "Say ok only."
 *   TIMEOUT_MS             default 120000
 *   STOP_ON_ERROR_RATE     default 1 (disabled)
 *
 * Provider-level attempt stats are not exposed in API responses.
 * Per-provider health breakdown is planned for P766.1 — this script
 * reports model-level success/latency only.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const DEFAULT_MODELS =
  "auto-fast,auto-pro,gemini-3-flash,gemini-2.5-flash,gemini-3-pro,gemini-3.1-pro,gpt-5.4,gpt-5.5";
const MODELS = (process.env.MODELS ?? DEFAULT_MODELS)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const REQUESTS_PER_MODEL = Math.max(
  1,
  parseInt(process.env.REQUESTS_PER_MODEL ?? "5", 10) || 5
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "1", 10) || 1
);
const PROMPT = process.env.PROMPT ?? "Say ok only.";
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);
const STOP_ON_ERROR_RATE = Math.min(
  1,
  Math.max(0, parseFloat(process.env.STOP_ON_ERROR_RATE ?? "1") || 1)
);

const ENDPOINT = `${BASE}/chat/completions`;
const RESULTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "model-health-results"
);
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function truncate(text, max = 120) {
  if (!text) return "";
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function inferErrorCode(status, parsedCode) {
  if (parsedCode) return parsedCode;
  if (status === 429) return "too_many_requests";
  if (status === 503) return "gateway_overloaded";
  if (status === 504) return "upstream_timeout";
  if (status === 413) return "request_body_too_large";
  if (status === 0) return "network_error";
  return null;
}

async function runPool(total, concurrency, worker, shouldStop) {
  const results = [];
  let next = 0;
  let stoppedEarly = false;

  async function workerLoop() {
    while (true) {
      if (shouldStop(results)) {
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

async function runOne(model, index) {
  const started = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    const requestedModel =
      body?.tokfai?.requested_model ?? body?.requested_model ?? model;
    const resolvedModel =
      body?.model ??
      body?.tokfai?.resolved_model ??
      body?.resolved_model ??
      null;
    const credits =
      typeof body?.credits_charged === "number"
        ? body.credits_charged
        : typeof body?.tokfai?.credits_charged === "number"
          ? body.tokfai.credits_charged
          : 0;

    const errorMessage = body?.error
      ? truncate(
          body.error.message ??
            `${body.error.type ?? ""} ${body.error.code ?? ""}`.trim()
        )
      : null;

    const timedOut =
      errorCode === "upstream_timeout" ||
      (body?.error?.code === "upstream_timeout" && res.status === 504);

    return {
      index,
      ok: res.ok,
      status: res.status,
      errorCode,
      errorType: body?.error?.type ?? null,
      errorMessage,
      latencyMs,
      requestId,
      requestedModel,
      resolvedModel,
      creditsCharged: res.ok ? credits : 0,
      timedOut,
      upstreamBusy: errorCode === "upstream_model_busy",
      modelNotAvailable: errorCode === "model_not_available",
    };
  } catch (err) {
    const latencyMs = performance.now() - started;
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        /timeout/i.test(err.message));

    return {
      index,
      ok: false,
      status: 0,
      errorCode: isTimeout ? "upstream_timeout" : "network_error",
      errorType: isTimeout ? "timeout_error" : "network_error",
      errorMessage: truncate(err instanceof Error ? err.message : String(err)),
      latencyMs,
      requestId: null,
      requestedModel: model,
      resolvedModel: null,
      creditsCharged: 0,
      timedOut: isTimeout,
      upstreamBusy: false,
      modelNotAvailable: false,
    };
  }
}

function buildModelSummary(model, results, planned, stoppedEarly) {
  const httpStatusDistribution = {};
  const errorCodeDistribution = {};
  const resolvedModelDistribution = {};
  const latencies = [];
  const requestIdSamples = [];
  let success = 0;
  let failed = 0;
  let creditsSum = 0;
  let timeoutCount = 0;
  let upstreamBusyCount = 0;
  let modelNotAvailableCount = 0;

  for (const r of results) {
    const statusKey = r.status === 0 ? "network" : String(r.status);
    httpStatusDistribution[statusKey] =
      (httpStatusDistribution[statusKey] ?? 0) + 1;

    if (r.ok) {
      success += 1;
      creditsSum += r.creditsCharged;
      const resolved = r.resolvedModel ?? "(unknown)";
      resolvedModelDistribution[resolved] =
        (resolvedModelDistribution[resolved] ?? 0) + 1;
    } else {
      failed += 1;
      const code = r.errorCode ?? `http_${r.status}`;
      errorCodeDistribution[code] = (errorCodeDistribution[code] ?? 0) + 1;
    }

    if (r.timedOut) timeoutCount += 1;
    if (r.upstreamBusy) upstreamBusyCount += 1;
    if (r.modelNotAvailable) modelNotAvailableCount += 1;

    latencies.push(r.latencyMs);

    if (r.requestId && requestIdSamples.length < 5) {
      requestIdSamples.push(r.requestId);
    }
  }

  latencies.sort((a, b) => a - b);
  const completed = results.length;

  return {
    model,
    planned,
    completed,
    success,
    failed,
    success_rate: completed > 0 ? success / completed : 0,
    http_status_distribution: httpStatusDistribution,
    error_code_distribution: errorCodeDistribution,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies.at(-1) ?? 0),
    },
    resolved_model_distribution: resolvedModelDistribution,
    credits_sum: creditsSum,
    request_id_samples: requestIdSamples,
    timeout_count: timeoutCount,
    upstream_busy_count: upstreamBusyCount,
    model_not_available_count: modelNotAvailableCount,
    stoppedEarly,
  };
}

function pad(str, width) {
  const s = String(str);
  return s.length >= width ? s.slice(0, width) : s.padEnd(width);
}

function printSummaryTable(summaries) {
  console.log("");
  console.log("=== Model health probe summary ===");
  console.log(
    [
      pad("model", 18),
      pad("done", 5),
      pad("ok", 4),
      pad("fail", 5),
      pad("rate%", 6),
      pad("p50ms", 7),
      pad("p95ms", 7),
      pad("maxms", 7),
      pad("busy", 5),
      pad("tout", 5),
      pad("na", 4),
      pad("req_id", 6),
    ].join(" ")
  );
  console.log("-".repeat(95));

  for (const s of summaries) {
    const reqIdOk =
      s.completed > 0 && s.request_id_samples.length === s.success
        ? `${s.request_id_samples.length}/${s.success}`
        : `${s.request_id_samples.length}/?`;
    console.log(
      [
        pad(s.model, 18),
        pad(s.completed, 5),
        pad(s.success, 4),
        pad(s.failed, 5),
        pad((s.success_rate * 100).toFixed(1), 6),
        pad(s.latencyMs.p50, 7),
        pad(s.latencyMs.p95, 7),
        pad(s.latencyMs.max, 7),
        pad(s.upstream_busy_count, 5),
        pad(s.timeout_count, 5),
        pad(s.model_not_available_count, 4),
        pad(reqIdOk, 6),
      ].join(" ")
    );
  }
  console.log("");
}

function printModelDetail(s) {
  console.log(`--- ${s.model} ---`);
  console.log(`  planned:      ${s.planned}`);
  console.log(`  completed:    ${s.completed}`);
  console.log(`  success:      ${s.success}`);
  console.log(`  failed:       ${s.failed}`);
  console.log(`  success_rate: ${(s.success_rate * 100).toFixed(2)}%`);
  if (s.stoppedEarly) {
    console.log(`  stopped:      early (error rate > ${STOP_ON_ERROR_RATE * 100}%)`);
  }
  console.log(`  latency p50:  ${s.latencyMs.p50} ms`);
  console.log(`  latency p95:  ${s.latencyMs.p95} ms`);
  console.log(`  latency max:  ${s.latencyMs.max} ms`);
  console.log(`  credits_sum:  ${s.credits_sum.toFixed(6)}`);
  console.log(`  timeout:      ${s.timeout_count}`);
  console.log(`  upstream_busy:${s.upstream_busy_count}`);
  console.log(`  model_na:     ${s.model_not_available_count}`);
  console.log("  HTTP status:");
  for (const [k, v] of Object.entries(s.http_status_distribution).sort()) {
    console.log(`    ${k}: ${v}`);
  }
  console.log("  Error codes (failed):");
  if (Object.keys(s.error_code_distribution).length === 0) {
    console.log("    (none)");
  } else {
    for (const [k, v] of Object.entries(s.error_code_distribution).sort()) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (Object.keys(s.resolved_model_distribution).length > 0) {
    console.log("  Resolved models (success):");
    for (const [k, v] of Object.entries(s.resolved_model_distribution).sort()) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log("  request_id samples:");
  if (s.request_id_samples.length === 0) {
    console.log("    (none)");
  } else {
    for (const id of s.request_id_samples) {
      console.log(`    ${id}`);
    }
  }
  console.log("");
}

async function probeModel(model) {
  const { results, stoppedEarly } = await runPool(
    REQUESTS_PER_MODEL,
    CONCURRENCY,
    (index) => runOne(model, index),
    (completed) => {
      if (STOP_ON_ERROR_RATE >= 1 || completed.length < 3) return false;
      const failed = completed.filter((r) => !r.ok).length;
      return failed / completed.length > STOP_ON_ERROR_RATE;
    }
  );

  return buildModelSummary(model, results, REQUESTS_PER_MODEL, stoppedEarly);
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(
      "Set TOKFAI_API_KEY=sk-tokfai_... before running this script."
    );
    process.exit(1);
  }

  console.log("=== P762.5 model health probe ===");
  console.log(`endpoint:           ${ENDPOINT}`);
  console.log(`api_key:            ${maskKey(API_KEY)}`);
  console.log(`models:             ${MODELS.join(", ")}`);
  console.log(`requests_per_model: ${REQUESTS_PER_MODEL}`);
  console.log(`concurrency:        ${CONCURRENCY}`);
  console.log(`prompt:             ${PROMPT}`);
  console.log(`timeout_ms:         ${TIMEOUT_MS}`);
  console.log(
    "provider_stats:     model-level only (provider breakdown → P766.1)"
  );
  if (STOP_ON_ERROR_RATE < 1) {
    console.log(
      `early_stop:         when error rate > ${STOP_ON_ERROR_RATE * 100}% per model`
    );
  }

  const wallStart = performance.now();
  const modelSummaries = [];

  for (const model of MODELS) {
    console.log("");
    console.log(`Probing ${model} (${REQUESTS_PER_MODEL} requests)…`);
    const summary = await probeModel(model);
    modelSummaries.push(summary);
  }

  const wallMs = performance.now() - wallStart;

  printSummaryTable(modelSummaries);
  for (const s of modelSummaries) {
    printModelDetail(s);
  }

  const report = {
    endpoint: ENDPOINT,
    apiKeyMask: maskKey(API_KEY),
    models: MODELS,
    requestsPerModel: REQUESTS_PER_MODEL,
    concurrency: CONCURRENCY,
    prompt: PROMPT,
    timeoutMs: TIMEOUT_MS,
    stopOnErrorRate: STOP_ON_ERROR_RATE,
    wallTimeMs: Math.round(wallMs),
    finishedAt: new Date().toISOString(),
    modelsReport: modelSummaries,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`JSON report: ${RESULTS_FILE}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
