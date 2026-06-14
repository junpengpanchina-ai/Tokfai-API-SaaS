#!/usr/bin/env node
/**
 * P766.4 — Model / provider health probe (production acceptance).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-model-health.mjs
 *
 * P766.4 acceptance preset (models + thresholds):
 *   P766_4_ACCEPTANCE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-model-health.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   MODELS                 comma-separated model IDs
 *   REQUESTS_PER_MODEL     default 5 (3 when P766_4_ACCEPTANCE=1)
 *   CONCURRENCY            default 1
 *   PROMPT                 default "Say ok only."
 *   TIMEOUT_MS             default 120000
 *   STOP_ON_ERROR_RATE     default 1 (disabled)
 *   MIN_SUCCESS_RATE       default 0.8 for auto-* when P766_4_ACCEPTANCE=1
 *
 * Never logs the full API key — masked prefix only.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";

const P766_4_ACCEPTANCE =
  process.env.P766_4_ACCEPTANCE === "1" ||
  process.env.P766_4_ACCEPTANCE === "true" ||
  process.env.ACCEPTANCE === "p766.4";

const P766_4_MODELS = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5.4",
  "gpt-5.5",
  "gemini-3-flash",
];

const DEFAULT_MODELS = P766_4_ACCEPTANCE
  ? P766_4_MODELS.join(",")
  : P766_4_MODELS.join(",");

const MODELS = (process.env.MODELS ?? DEFAULT_MODELS)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const REQUESTS_PER_MODEL = Math.max(
  1,
  parseInt(
    process.env.REQUESTS_PER_MODEL ??
      (P766_4_ACCEPTANCE ? "3" : "5"),
    10
  ) || (P766_4_ACCEPTANCE ? 3 : 5)
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
const MIN_SUCCESS_RATE = Math.min(
  1,
  Math.max(
    0,
    parseFloat(
      process.env.MIN_SUCCESS_RATE ??
        (P766_4_ACCEPTANCE ? "0.8" : "0")
    ) || (P766_4_ACCEPTANCE ? 0.8 : 0)
  )
);

const ENDPOINT = `${BASE}/chat/completions`;
const RESULTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "model-health-results"
);
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const AUTO_ALIASES = new Set(["auto-fast", "auto-pro", "auto-cheap"]);

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

function topKey(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
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
      creditsCharged: credits,
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
  const errorCodeSamples = [];
  let success = 0;
  let failed = 0;
  let creditsSum = 0;
  let failedCreditsNonZero = 0;
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
      if (r.creditsCharged > 0) failedCreditsNonZero += 1;
      if (errorCodeSamples.length < 5 && code) {
        errorCodeSamples.push(code);
      }
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
  const resolvedModelSample = topKey(resolvedModelDistribution);
  const topErrorCode = topKey(errorCodeDistribution);

  return {
    model,
    planned,
    completed,
    success,
    failed,
    success_rate: completed > 0 ? success / completed : 0,
    http_status_distribution: httpStatusDistribution,
    error_code_distribution: errorCodeDistribution,
    error_code_samples: errorCodeSamples,
    top_error_code: topErrorCode,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies.at(-1) ?? 0),
    },
    resolved_model_distribution: resolvedModelDistribution,
    resolved_model_sample: resolvedModelSample,
    credits_sum: creditsSum,
    failed_credits_nonzero: failedCreditsNonZero,
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
      pad("model", 16),
      pad("ok", 4),
      pad("fail", 5),
      pad("rate%", 6),
      pad("http", 6),
      pad("err_code", 22),
      pad("resolved", 18),
      pad("p50", 7),
      pad("p95", 7),
      pad("req_id", 6),
    ].join(" ")
  );
  console.log("-".repeat(110));

  for (const s of summaries) {
    const httpSummary = Object.entries(s.http_status_distribution)
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
    const errDisplay =
      s.failed > 0
        ? (s.top_error_code ?? s.error_code_samples[0] ?? "—")
        : "—";
    const resolvedDisplay = s.resolved_model_sample ?? "—";
    const reqIdOk =
      s.request_id_samples.length > 0
        ? `${s.request_id_samples.length}`
        : "0";

    console.log(
      [
        pad(s.model, 16),
        pad(s.success, 4),
        pad(s.failed, 5),
        pad((s.success_rate * 100).toFixed(1), 6),
        pad(httpSummary.slice(0, 6), 6),
        pad(errDisplay, 22),
        pad(resolvedDisplay, 18),
        pad(s.latencyMs.p50, 7),
        pad(s.latencyMs.p95, 7),
        pad(reqIdOk, 6),
      ].join(" ")
    );
  }
  console.log("");
}

function printModelDetail(s) {
  console.log(`--- ${s.model} ---`);
  console.log(`  planned:           ${s.planned}`);
  console.log(`  completed:         ${s.completed}`);
  console.log(`  success:           ${s.success}`);
  console.log(`  failed:            ${s.failed}`);
  console.log(`  success_rate:      ${(s.success_rate * 100).toFixed(2)}%`);
  if (s.stoppedEarly) {
    console.log(
      `  stopped:           early (error rate > ${STOP_ON_ERROR_RATE * 100}%)`
    );
  }
  console.log(`  latency p50:       ${s.latencyMs.p50} ms`);
  console.log(`  latency p95:       ${s.latencyMs.p95} ms`);
  console.log(`  latency max:       ${s.latencyMs.max} ms`);
  console.log(`  credits_sum:       ${s.credits_sum.toFixed(6)} (success only)`);
  console.log(`  failed_credits>0:  ${s.failed_credits_nonzero}`);
  console.log(`  timeout:           ${s.timeout_count}`);
  console.log(`  upstream_busy:     ${s.upstream_busy_count}`);
  console.log(`  model_na:          ${s.model_not_available_count}`);
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

function evaluateAcceptance(summaries) {
  const lines = [];
  let allPass = true;

  for (const s of summaries) {
    const isAuto = AUTO_ALIASES.has(s.model);
    const minRate = isAuto && MIN_SUCCESS_RATE > 0 ? MIN_SUCCESS_RATE : 0;
    const rateOk = s.success_rate >= minRate;
    const billingOk = s.failed_credits_nonzero === 0;
    const pass = rateOk && billingOk;

    if (!pass) allPass = false;

    const reasons = [];
    if (!rateOk) {
      reasons.push(
        `success_rate ${(s.success_rate * 100).toFixed(1)}% < ${(minRate * 100).toFixed(0)}%`
      );
    }
    if (!billingOk) {
      reasons.push(`failed requests charged credits (${s.failed_credits_nonzero})`);
    }

    lines.push({
      model: s.model,
      pass,
      success_rate: s.success_rate,
      min_rate: minRate,
      failed_credits_nonzero: s.failed_credits_nonzero,
      resolved_model_sample: s.resolved_model_sample,
      request_id_samples: s.request_id_samples,
      reason: reasons.length ? reasons.join("; ") : "ok",
    });
  }

  return { allPass, lines };
}

function printAcceptanceReport(evaluation) {
  console.log("=== P766.4 acceptance gate ===");
  for (const row of evaluation.lines) {
    const status = row.pass ? "PASS" : "FAIL";
    console.log(
      `  [${status}] ${row.model}: rate=${(row.success_rate * 100).toFixed(1)}%` +
        (row.resolved_model_sample ? ` resolved=${row.resolved_model_sample}` : "") +
        (row.request_id_samples[0] ? ` req_id=${row.request_id_samples[0]}` : "")
    );
    if (!row.pass) {
      console.log(`         ${row.reason}`);
    }
  }
  console.log("");
  console.log(
    evaluation.allPass
      ? "Acceptance: PASS"
      : "Acceptance: FAIL — see rows above"
  );
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

  const title = P766_4_ACCEPTANCE
    ? "P766.4 provider health acceptance probe"
    : "P766 model health probe";

  console.log(`=== ${title} ===`);
  console.log(`endpoint:           ${ENDPOINT}`);
  console.log(`api_key:            ${maskKey(API_KEY)}`);
  console.log(`models:             ${MODELS.join(", ")}`);
  console.log(`requests_per_model: ${REQUESTS_PER_MODEL}`);
  console.log(`concurrency:        ${CONCURRENCY}`);
  console.log(`prompt:             ${PROMPT}`);
  console.log(`timeout_ms:         ${TIMEOUT_MS}`);
  if (P766_4_ACCEPTANCE) {
    console.log(`min_success_rate:   ${(MIN_SUCCESS_RATE * 100).toFixed(0)}% (auto-* aliases)`);
  }
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

  const acceptance = evaluateAcceptance(modelSummaries);
  if (P766_4_ACCEPTANCE || MIN_SUCCESS_RATE > 0) {
    printAcceptanceReport(acceptance);
  }

  const report = {
    probe: P766_4_ACCEPTANCE ? "p766.4" : "p766",
    endpoint: ENDPOINT,
    apiKeyMask: maskKey(API_KEY),
    models: MODELS,
    requestsPerModel: REQUESTS_PER_MODEL,
    concurrency: CONCURRENCY,
    prompt: PROMPT,
    timeoutMs: TIMEOUT_MS,
    stopOnErrorRate: STOP_ON_ERROR_RATE,
    minSuccessRate: MIN_SUCCESS_RATE,
    wallTimeMs: Math.round(wallMs),
    finishedAt: new Date().toISOString(),
    acceptance: acceptance,
    modelsReport: modelSummaries,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`JSON report: ${RESULTS_FILE}`);
  console.log("");

  if (P766_4_ACCEPTANCE && !acceptance.allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
