#!/usr/bin/env node
/**
 * Internal operator offline load simulation — not customer documentation.
 *
 * P791 — 500 virtual users against P786 mock gateway with backpressure.
 *
 * Usage:
 *   node scripts/p791-500-online-mock-load.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p791-capacity-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const VIRTUAL_USERS = parseInt(process.env.VIRTUAL_USERS ?? "500", 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS ?? "60", 10);
const CHAT_CONCURRENCY_LIMIT = process.env.CHAT_CONCURRENCY_LIMIT ?? "50";
const IMAGE_CONCURRENCY_LIMIT = process.env.IMAGE_CONCURRENCY_LIMIT ?? "10";
const BATCH_CONCURRENCY_LIMIT = process.env.BATCH_CONCURRENCY_LIMIT ?? "20";
const ERROR_RATE_THRESHOLD = parseFloat(process.env.ERROR_RATE_THRESHOLD ?? "0.05");
const MAX_REQUESTS_PER_USER = parseInt(process.env.MAX_REQUESTS_PER_USER ?? "5", 10);

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function pickScenario() {
  const r = Math.random();
  if (r < 0.55) return "read";
  if (r < 0.8) return "chat";
  if (r < 0.9) return "batch";
  if (r < 0.95) return "image";
  return "error_probe";
}

async function fetchScenario(base, apiKey, scenario) {
  const start = Date.now();
  let url = base;
  let method = "GET";
  let headers = {};
  let body = undefined;

  switch (scenario) {
    case "read": {
      const pick = Math.random();
      if (pick < 0.33) {
        url = base.replace(/\/v1$/, "") + "/health";
        headers = {};
      } else if (pick < 0.66) {
        url = base.replace(/\/v1$/, "") + "/v1/status";
        headers = {};
      } else {
        url = `${base}/models`;
        headers = { Authorization: `Bearer ${apiKey}` };
      }
      break;
    }
    case "chat": {
      url = `${base}/chat/completions`;
      method = "POST";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: "auto-fast",
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      });
      break;
    }
    case "batch": {
      url = `${base}/batches/chat`;
      method = "POST";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: "auto-fast",
        items: [{ messages: [{ role: "user", content: "Say ok only." }] }],
      });
      break;
    }
    case "image": {
      url = `${base}/images/generations`;
      method = "POST";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: "gpt-image-2",
        prompt: "Product photo mock",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      break;
    }
    case "error_probe": {
      if (Math.random() < 0.5) {
        url = `${base}/chat/completions`;
        method = "POST";
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          model: "auto-fast",
          messages: [{ role: "user", content: "Say ok only." }],
          stream: false,
        });
      } else {
        url = `${base}/chat/completions`;
        method = "POST";
        headers = {
          Authorization: "Bearer sk-tokfai_xxx",
          "Content-Type": "application/json",
        };
        body = JSON.stringify({
          model: "auto-fast",
          messages: [{ role: "user", content: "Say ok only." }],
          stream: false,
        });
      }
      break;
    }
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return {
    scenario,
    status: res.status,
    latencyMs: Date.now() - start,
    body: json,
  };
}

export async function run500OnlineMockLoad(options = {}) {
  if (process.env.LIVE === "1") {
    throw new Error("P791 load test runs against mock only — unset LIVE=1");
  }

  process.env.MOCK_BACKPRESSURE = "1";
  process.env.CHAT_CONCURRENCY_LIMIT = options.chatLimit ?? CHAT_CONCURRENCY_LIMIT;
  process.env.IMAGE_CONCURRENCY_LIMIT = options.imageLimit ?? IMAGE_CONCURRENCY_LIMIT;
  process.env.BATCH_CONCURRENCY_LIMIT = options.batchLimit ?? BATCH_CONCURRENCY_LIMIT;

  const virtualUsers = options.virtualUsers ?? VIRTUAL_USERS;
  const durationSeconds = options.durationSeconds ?? DURATION_SECONDS;
  const errorThreshold = options.errorRateThreshold ?? ERROR_RATE_THRESHOLD;

  const mock = await ensureMockGateway();
  const base = mock.baseUrl.replace(/\/+$/, "");
  const apiKey = mock.apiKey;

  const results = [];
  const endAt = Date.now() + durationSeconds * 1000;

  async function virtualUser(userId) {
    let count = 0;
    while (Date.now() < endAt && count < MAX_REQUESTS_PER_USER) {
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
      count += 1;
      await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 120)));
    }
  }

  const workers = Array.from({ length: virtualUsers }, (_, i) => virtualUser(i + 1));
  await Promise.all(workers);

  const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs).sort((a, b) => a - b);
  const statusCounts = { 200: 0, 401: 0, 429: 0, 503: 0, 504: 0, other: 0 };
  let successCount = 0;
  let requestIdCoverage = 0;
  let chargedSimulated = 0;
  let notChargedSimulated = 0;

  let apiSuccessCount = 0;
  let apiRequestIdCoverage = 0;

  for (const row of results) {
    const s = row.status;
    if (s === 200) {
      statusCounts[200] += 1;
      successCount += 1;
      const rid = row.body?.request_id ?? row.body?.tokfai?.request_id;
      const isApiGen = ["chat", "batch", "image"].includes(row.scenario);
      if (isApiGen) {
        apiSuccessCount += 1;
        if (rid) apiRequestIdCoverage += 1;
        if (row.body?.credits_charged != null) chargedSimulated += 1;
      }
      if (rid) requestIdCoverage += 1;
    } else if (s === 401) statusCounts[401] += 1;
    else if (s === 429) statusCounts[429] += 1;
    else if (s === 503) statusCounts[503] += 1;
    else if (s === 504) statusCounts[504] += 1;
    else statusCounts.other += 1;

    if (s !== 200) notChargedSimulated += 1;
  }

  const total = results.length;
  const errorRate = total ? (total - successCount) / total : 0;
  const apiRequestIdRate =
    apiSuccessCount > 0 ? apiRequestIdCoverage / apiSuccessCount : 1;
  const pass =
    total > 0 &&
    errorRate <= errorThreshold &&
    apiRequestIdRate >= 0.99;

  const report = {
    suite: "p791-500-online-mock-load",
    timestamp: new Date().toISOString(),
    mock_base: base,
    mock_spawned: mock.spawned,
    virtual_users: virtualUsers,
    duration_seconds: durationSeconds,
    concurrency_limits: {
      chat: parseInt(process.env.CHAT_CONCURRENCY_LIMIT, 10),
      image: parseInt(process.env.IMAGE_CONCURRENCY_LIMIT, 10),
      batch: parseInt(process.env.BATCH_CONCURRENCY_LIMIT, 10),
    },
    total_requests: total,
    success_count: successCount,
    status_counts: statusCounts,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? latencies[latencies.length - 1] : 0,
    },
    request_id_coverage: successCount ? requestIdCoverage / successCount : 0,
    api_success_count: apiSuccessCount,
    api_request_id_coverage: apiRequestIdRate,
    charged_simulated: chargedSimulated,
    not_charged_simulated: notChargedSimulated,
    error_rate: errorRate,
    error_rate_threshold: errorThreshold,
    pass,
  };

  if (mock.spawned && mock.child) {
    mock.child.kill();
  }

  return report;
}

async function main() {
  console.log("=== P791 500 online mock load ===");

  const report = await run500OnlineMockLoad();

  console.log(`total_requests: ${report.total_requests}`);
  console.log(`success: ${report.success_count}`);
  console.log(`401: ${report.status_counts[401]} 429: ${report.status_counts[429]} 503: ${report.status_counts[503]}`);
  console.log(
    `latency p50=${report.latency_ms.p50}ms p95=${report.latency_ms.p95}ms max=${report.latency_ms.max}ms`
  );
  console.log(`request_id coverage: ${(report.request_id_coverage * 100).toFixed(1)}%`);
  console.log(`charged vs not-charged (sim): ${report.charged_simulated} / ${report.not_charged_simulated}`);
  console.log(`error_rate: ${report.error_rate.toFixed(4)} (threshold ${report.error_rate_threshold})`);
  console.log(`P791 load: ${report.pass ? "PASS" : "FAIL"}`);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`results: ${RESULTS_FILE}`);

  process.exit(report.pass ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
