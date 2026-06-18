#!/usr/bin/env node
/**
 * Internal operator offline load simulation — not customer documentation.
 *
 * P792 — 500 virtual users against P792 slow upstream mock gateway.
 *
 * Usage:
 *   node scripts/p792-500-online-slow-load.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureSlowMockGateway } from "./lib/ensure-slow-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p792-slow-load-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const VIRTUAL_USERS = parseInt(process.env.VIRTUAL_USERS ?? "500", 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS ?? "120", 10);
const RAMP_UP_SECONDS = parseInt(process.env.RAMP_UP_SECONDS ?? "20", 10);
const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8788/v1";
const API_KEY = process.env.API_KEY ?? "sk-tokfai_mock_acceptance";
const MODEL = process.env.MODEL ?? "auto-fast";
const MAX_HEAP_GROWTH_MB = parseFloat(process.env.MAX_HEAP_GROWTH_MB ?? "256");

const CONTROLLED_CODES = new Set([
  "too_many_requests",
  "too_many_concurrent_requests",
  "gateway_overloaded",
  "upstream_timeout",
  "upstream_model_busy",
  "missing_token",
  "invalid_token",
]);

let activeConcurrency = 0;
let activeConcurrencyMax = 0;

function trackConcurrencyStart() {
  activeConcurrency += 1;
  activeConcurrencyMax = Math.max(activeConcurrencyMax, activeConcurrency);
}

function trackConcurrencyEnd() {
  activeConcurrency = Math.max(0, activeConcurrency - 1);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickScenario() {
  const r = Math.random();
  if (r < 0.35) return "models";
  if (r < 0.7) return "chat";
  if (r < 0.8) return "responses";
  if (r < 0.88) return "image";
  if (r < 0.95) return "batch";
  return "error_probe";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, body: json };
}

async function runBatchFlow(base, apiKey) {
  const start = Date.now();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const createBody = JSON.stringify({
    model: MODEL,
    items: [{ messages: [{ role: "user", content: "Say ok only." }] }],
  });

  const create = await fetchJson(`${base}/batches/chat`, {
    method: "POST",
    headers,
    body: createBody,
  });

  if (create.status !== 200) {
    return {
      scenario: "batch",
      status: create.status,
      latencyMs: Date.now() - start,
      body: create.body,
    };
  }

  const batchId = create.body?.id;
  if (!batchId) {
    return {
      scenario: "batch",
      status: create.status,
      latencyMs: Date.now() - start,
      body: create.body,
    };
  }

  let pollBody = create.body;
  let pollStatus = create.status;
  const pollDeadline = start + 90000;

  while (Date.now() < pollDeadline) {
    await sleep(1500);
    const poll = await fetchJson(`${base}/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    pollStatus = poll.status;
    pollBody = poll.body;
    if (poll.status === 200 && poll.body?.status === "completed") break;
  }

  const items = await fetchJson(`${base}/batches/${batchId}/items`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return {
    scenario: "batch",
    status: items.status === 200 ? items.status : pollStatus,
    latencyMs: Date.now() - start,
    body: items.status === 200 ? items.body : pollBody,
    batchId,
  };
}

async function fetchScenario(base, apiKey, scenario) {
  const start = Date.now();
  trackConcurrencyStart();
  try {
    let result;
    switch (scenario) {
      case "models": {
        const res = await fetchJson(`${base}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        result = { scenario, status: res.status, body: res.body };
        break;
      }
      case "chat": {
        const res = await fetchJson(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: "Say ok only." }],
            stream: false,
          }),
        });
        result = { scenario, status: res.status, body: res.body };
        break;
      }
      case "responses": {
        const res = await fetchJson(`${base}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            input: "Say ok only.",
          }),
        });
        result = { scenario, status: res.status, body: res.body };
        break;
      }
      case "image": {
        const res = await fetchJson(`${base}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-2",
            prompt: "Product photo mock",
            size: "1024x1024",
            n: 1,
            response_format: "url",
          }),
        });
        result = { scenario, status: res.status, body: res.body };
        break;
      }
      case "batch": {
        result = await runBatchFlow(base, apiKey);
        break;
      }
      case "error_probe": {
        if (Math.random() < 0.5) {
          const res = await fetchJson(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              messages: [{ role: "user", content: "Say ok only." }],
              stream: false,
            }),
          });
          result = { scenario, status: res.status, body: res.body };
        } else {
          const res = await fetchJson(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: "Bearer sk-tokfai_xxx",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [{ role: "user", content: "Say ok only." }],
              stream: false,
            }),
          });
          result = { scenario, status: res.status, body: res.body };
        }
        break;
      }
      default:
        result = { scenario, status: 0, body: {} };
    }
    result.latencyMs = Date.now() - start;
    return result;
  } finally {
    trackConcurrencyEnd();
  }
}

function isControlledError(row) {
  const code = row.body?.error?.code;
  if (row.status === 401 || row.status === 429 || row.status === 503 || row.status === 504) {
    return code ? CONTROLLED_CODES.has(code) : true;
  }
  return false;
}

function isUncontrolledError(row) {
  if (row.status === 0 || row.error) return true;
  if (row.status === 200) return false;
  if (row.status === 401 || row.status === 429 || row.status === 503 || row.status === 504) {
    return !isControlledError(row);
  }
  if (row.status >= 500) {
    const code = row.body?.error?.code;
    return !code || !CONTROLLED_CODES.has(code);
  }
  return row.status !== 200;
}

export async function run500OnlineSlowLoad(options = {}) {
  if (process.env.LIVE === "1") {
    throw new Error("P792 slow load runs against mock only — unset LIVE=1");
  }

  const virtualUsers = options.virtualUsers ?? VIRTUAL_USERS;
  const durationSeconds = options.durationSeconds ?? DURATION_SECONDS;
  const rampUpSeconds = options.rampUpSeconds ?? RAMP_UP_SECONDS;
  const apiBaseEnv = options.apiBase ?? API_BASE;
  const apiKeyEnv = options.apiKey ?? API_KEY;

  const memoryBefore = process.memoryUsage();

  let mock = null;
  let base = apiBaseEnv.replace(/\/+$/, "");
  let apiKey = apiKeyEnv;

  if (base.includes("127.0.0.1:8788") || base.includes("localhost:8788")) {
    mock = await ensureSlowMockGateway({ apiKey: apiKeyEnv });
    base = mock.baseUrl.replace(/\/+$/, "");
    apiKey = mock.apiKey;
  }

  activeConcurrency = 0;
  activeConcurrencyMax = 0;

  const results = [];
  const endAt = Date.now() + durationSeconds * 1000;

  async function virtualUser(userId) {
    const rampDelay = Math.floor((userId / virtualUsers) * rampUpSeconds * 1000);
    if (rampDelay > 0) await sleep(rampDelay);

    while (Date.now() < endAt) {
      const scenario = pickScenario();
      try {
        const row = await fetchScenario(base, apiKey, scenario);
        results.push({ userId, ...row });
      } catch (err) {
        results.push({
          userId,
          scenario,
          status: 0,
          latencyMs: 0,
          error: err instanceof Error ? err.message : String(err),
          body: {},
        });
      }
      await sleep(80 + Math.floor(Math.random() * 200));
    }
  }

  const workers = Array.from({ length: virtualUsers }, (_, i) => virtualUser(i + 1));
  await Promise.all(workers);

  const memoryAfter = process.memoryUsage();
  const heapGrowthMb = (memoryAfter.heapUsed - memoryBefore.heapUsed) / (1024 * 1024);

  const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs).sort((a, b) => a - b);
  const statusCounts = { 200: 0, 401: 0, 429: 0, 503: 0, 504: 0, other: 0 };
  const errorCodes = {
    too_many_requests: 0,
    too_many_concurrent_requests: 0,
    gateway_overloaded: 0,
    upstream_timeout: 0,
    upstream_model_busy: 0,
    missing_token: 0,
    invalid_token: 0,
    other: 0,
  };

  let successCount = 0;
  let controlledErrorCount = 0;
  let uncontrolledErrorCount = 0;
  let chargedSimulated = 0;
  let notChargedSimulated = 0;
  let apiSuccessCount = 0;
  let apiRequestIdCoverage = 0;

  for (const row of results) {
    const s = row.status;
    const code = row.body?.error?.code;

    if (code && errorCodes[code] !== undefined) errorCodes[code] += 1;
    else if (code) errorCodes.other += 1;

    if (s === 200) {
      statusCounts[200] += 1;
      successCount += 1;
      const rid =
        row.body?.request_id ??
        row.body?.tokfai?.request_id ??
        (row.scenario === "batch" && Array.isArray(row.body?.data)
          ? row.body.data.find((item) => item?.request_id)?.request_id
          : undefined);
      const isApiGen = ["chat", "responses", "batch", "image"].includes(row.scenario);
      if (isApiGen) {
        apiSuccessCount += 1;
        if (rid) apiRequestIdCoverage += 1;
      }
      if (row.scenario === "batch" && Array.isArray(row.body?.data)) {
        for (const item of row.body.data) {
          if (item?.credits_charged != null && item.credits_charged > 0) {
            chargedSimulated += 1;
          }
        }
      } else {
        const charged = row.body?.credits_charged ?? row.body?.tokfai?.credits_charged;
        if (charged != null && charged > 0) chargedSimulated += 1;
        else if (isApiGen) notChargedSimulated += 1;
      }
    } else if (s === 401) {
      statusCounts[401] += 1;
      notChargedSimulated += 1;
    } else if (s === 429) {
      statusCounts[429] += 1;
      notChargedSimulated += 1;
    } else if (s === 503) {
      statusCounts[503] += 1;
      notChargedSimulated += 1;
    } else if (s === 504) {
      statusCounts[504] += 1;
      notChargedSimulated += 1;
    } else {
      statusCounts.other += 1;
      notChargedSimulated += 1;
    }

    if (isUncontrolledError(row)) uncontrolledErrorCount += 1;
    else if (s !== 200) controlledErrorCount += 1;
  }

  const total = results.length;
  const apiRequestIdRate =
    apiSuccessCount > 0 ? apiRequestIdCoverage / apiSuccessCount : 1;

  const pass =
    total > 0 &&
    uncontrolledErrorCount === 0 &&
    apiRequestIdRate >= 0.99 &&
    heapGrowthMb <= MAX_HEAP_GROWTH_MB;

  const report = {
    suite: "p792-500-online-slow-load",
    timestamp: new Date().toISOString(),
    mock_base: base,
    mock_spawned: mock?.spawned ?? false,
    virtual_users: virtualUsers,
    duration_seconds: durationSeconds,
    ramp_up_seconds: rampUpSeconds,
    model: MODEL,
    total_requests: total,
    success_count: successCount,
    controlled_error_count: controlledErrorCount,
    uncontrolled_error_count: uncontrolledErrorCount,
    status_counts: statusCounts,
    error_codes: errorCodes,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? latencies[latencies.length - 1] : 0,
    },
    active_concurrency_max: activeConcurrencyMax,
    request_id_coverage: successCount ? apiRequestIdCoverage / successCount : 0,
    api_success_count: apiSuccessCount,
    api_request_id_coverage: apiRequestIdRate,
    charged_simulated: chargedSimulated,
    not_charged_simulated: notChargedSimulated,
    memory_mb: {
      heap_before: memoryBefore.heapUsed / (1024 * 1024),
      heap_after: memoryAfter.heapUsed / (1024 * 1024),
      heap_growth: heapGrowthMb,
      heap_growth_limit: MAX_HEAP_GROWTH_MB,
    },
    pass,
  };

  if (mock?.spawned && mock.child) {
    mock.child.kill();
  }

  return report;
}

async function main() {
  console.log("=== P792 500 online slow load ===");

  const report = await run500OnlineSlowLoad();

  console.log(`total_requests: ${report.total_requests}`);
  console.log(`success: ${report.success_count}`);
  console.log(
    `controlled errors: ${report.controlled_error_count} uncontrolled: ${report.uncontrolled_error_count}`
  );
  console.log(
    `401: ${report.status_counts[401]} 429: ${report.status_counts[429]} 503: ${report.status_counts[503]} 504: ${report.status_counts[504]}`
  );
  console.log(
    `latency p50=${report.latency_ms.p50}ms p95=${report.latency_ms.p95}ms p99=${report.latency_ms.p99}ms max=${report.latency_ms.max}ms`
  );
  console.log(`active concurrency max: ${report.active_concurrency_max}`);
  console.log(`request_id coverage (api): ${(report.api_request_id_coverage * 100).toFixed(1)}%`);
  console.log(
    `charged vs not-charged (sim): ${report.charged_simulated} / ${report.not_charged_simulated}`
  );
  console.log(
    `memory heap growth: ${report.memory_mb.heap_growth.toFixed(1)}MB (limit ${report.memory_mb.heap_growth_limit}MB)`
  );
  console.log(`P792 slow load: ${report.pass ? "PASS" : "FAIL"}`);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`results: ${RESULTS_FILE}`);

  process.exit(report.pass ? 0 : 1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
