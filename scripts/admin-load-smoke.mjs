#!/usr/bin/env node
/**
 * Admin read-only API load smoke — stability acceptance (default 10,000 requests).
 *
 * Usage:
 *   TOKFAI_ADMIN_JWT=<supabase_access_token> node scripts/admin-load-smoke.mjs
 *
 * Env:
 *   TOKFAI_API_BASE           default https://api.tokfai.com
 *   TOKFAI_ADMIN_JWT          required — Supabase access token for admin user
 *   TOKFAI_LOAD_TOTAL         default 10000
 *   TOKFAI_LOAD_CONCURRENCY   default 20
 *   TOKFAI_LOAD_TIMEOUT_MS    default 30000
 *   TOKFAI_LOAD_P95_WARN_MS   default 1000
 */

import { getAcceptanceHeaders } from "./lib/acceptance-http.mjs";

const API_ROOT = normalizeBase(
  process.env.TOKFAI_API_BASE,
  "https://api.tokfai.com"
);
const ADMIN_JWT = (process.env.TOKFAI_ADMIN_JWT ?? "").trim();
const TOTAL = Math.max(
  1,
  parseInt(process.env.TOKFAI_LOAD_TOTAL ?? "10000", 10) || 10_000
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.TOKFAI_LOAD_CONCURRENCY ?? "20", 10) || 20
);
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TOKFAI_LOAD_TIMEOUT_MS ?? "30000", 10) || 30_000
);
const P95_WARN_MS = Math.max(
  100,
  parseInt(process.env.TOKFAI_LOAD_P95_WARN_MS ?? "1000", 10) || 1000
);

/** UI "overview" maps to DMIT GET /admin/dashboard-summary today. */
const ENDPOINTS = [
  { id: "overview", path: "/dashboard-summary" },
  { id: "users", path: "/users" },
  { id: "api-keys", path: "/api-keys" },
  { id: "models", path: "/models" },
  { id: "channels", path: "/channels" },
  { id: "pricing", path: "/pricing" },
  { id: "usage", path: "/usage" },
  { id: "credit-orders", path: "/credit-orders" },
  { id: "logs", path: "/logs" },
  { id: "settings", path: "/settings" },
  { id: "announcements", path: "/announcements" },
  { id: "recharge-plans", path: "/recharge-plans" },
];

function normalizeBase(value, fallback) {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function createEmptyStats() {
  return {
    requests: 0,
    success: 0,
    authErrors: 0,
    client4xx: 0,
    server5xx: 0,
    timeouts: 0,
    networkErrors: 0,
    latencies: [],
    requestIdSamples: [],
  };
}

function classifyResult(status, isTimeout, isNetwork) {
  if (isTimeout) return "timeout";
  if (isNetwork || status === 0) return "network";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 200 && status < 300) return "ok";
  return "other";
}

async function fetchAdmin(path) {
  const url = `${API_ROOT}/admin${path}`;
  const started = performance.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...getAcceptanceHeaders(),
        Authorization: `Bearer ${ADMIN_JWT}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text();
    const latencyMs = performance.now() - started;

    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    const requestId =
      body?.request_id ??
      body?.data?.request_id ??
      res.headers.get("x-request-id") ??
      null;

    return {
      status: res.status,
      latencyMs,
      requestId,
      isTimeout: false,
      isNetwork: false,
    };
  } catch (error) {
    const latencyMs = performance.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout =
      error?.name === "TimeoutError" ||
      error?.name === "AbortError" ||
      /timeout|aborted/i.test(message);

    return {
      status: 0,
      latencyMs,
      requestId: null,
      isTimeout,
      isNetwork: !isTimeout,
      message,
    };
  }
}

function recordResult(stats, result) {
  stats.requests += 1;
  stats.latencies.push(result.latencyMs);

  const kind = classifyResult(
    result.status,
    result.isTimeout,
    result.isNetwork
  );

  switch (kind) {
    case "ok":
      stats.success += 1;
      break;
    case "auth":
      stats.authErrors += 1;
      break;
    case "4xx":
      stats.client4xx += 1;
      break;
    case "5xx":
      stats.server5xx += 1;
      break;
    case "timeout":
      stats.timeouts += 1;
      break;
    default:
      stats.networkErrors += 1;
      break;
  }

  if (result.requestId && stats.requestIdSamples.length < 3) {
    if (!stats.requestIdSamples.includes(result.requestId)) {
      stats.requestIdSamples.push(result.requestId);
    }
  }
}

async function runPool(total, concurrency, worker) {
  const results = [];
  let next = 0;

  async function workerLoop() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      results.push(await worker(i));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => workerLoop())
  );
  return results;
}

function summarizeEndpoint(id, stats) {
  const latencies = [...stats.latencies].sort((a, b) => a - b);
  const p50 = Math.round(percentile(latencies, 50));
  const p95 = Math.round(percentile(latencies, 95));
  const p99 = Math.round(percentile(latencies, 99));

  const fails = [];
  const warns = [];

  if (stats.server5xx > 0) fails.push(`5xx=${stats.server5xx}`);
  if (stats.timeouts > 0) fails.push(`timeout=${stats.timeouts}`);
  if (stats.authErrors > 0) fails.push(`401/403=${stats.authErrors}`);
  if (p95 >= P95_WARN_MS) warns.push(`p95=${p95}ms (threshold ${P95_WARN_MS}ms)`);

  let status = "PASS";
  if (fails.length > 0) status = "FAIL";
  else if (warns.length > 0) status = "WARN";

  return {
    id,
    status,
    stats,
    p50,
    p95,
    p99,
    fails,
    warns,
  };
}

function printEndpointReport(summary) {
  const s = summary.stats;
  console.log(`\n[${summary.status}] GET /admin/${summary.id === "overview" ? "dashboard-summary (overview)" : summary.id}`);
  console.log(`  requests=${s.requests} success=${s.success} 401/403=${s.authErrors} 4xx=${s.client4xx} 5xx=${s.server5xx} timeout=${s.timeouts} network=${s.networkErrors}`);
  console.log(`  p50=${summary.p50}ms p95=${summary.p95}ms p99=${summary.p99}ms`);
  if (s.requestIdSamples.length > 0) {
    console.log(`  request_id samples: ${s.requestIdSamples.join(", ")}`);
  }
  if (summary.fails.length > 0) {
    console.log(`  FAIL: ${summary.fails.join(", ")}`);
  }
  if (summary.warns.length > 0) {
    console.log(`  WARN: ${summary.warns.join(", ")}`);
  }
}

async function main() {
  console.log("=== Tokfai admin load smoke ===");
  console.log(`API:         ${API_ROOT}/admin/*`);
  console.log(`TOTAL:       ${TOTAL}`);
  console.log(`CONCURRENCY: ${CONCURRENCY}`);
  console.log(`TIMEOUT:     ${TIMEOUT_MS}ms`);
  console.log(`JWT:         ${ADMIN_JWT ? `${ADMIN_JWT.slice(0, 12)}…` : "(missing)"}`);
  console.log("");

  if (!ADMIN_JWT) {
    console.error("TOKFAI_ADMIN_JWT is required (Supabase access token for admin user).");
    process.exit(1);
  }

  const perEndpoint = Object.fromEntries(
    ENDPOINTS.map((endpoint) => [endpoint.id, createEmptyStats()])
  );

  const wallStarted = performance.now();

  const results = await runPool(TOTAL, CONCURRENCY, async (index) => {
    const endpoint = ENDPOINTS[index % ENDPOINTS.length];
    const result = await fetchAdmin(endpoint.path);
    recordResult(perEndpoint[endpoint.id], result);
    return { endpoint: endpoint.id, ...result };
  });

  const wallMs = Math.round(performance.now() - wallStarted);

  const summaries = ENDPOINTS.map((endpoint) =>
    summarizeEndpoint(endpoint.id, perEndpoint[endpoint.id])
  );

  for (const summary of summaries) {
    printEndpointReport(summary);
  }

  const global = createEmptyStats();
  for (const summary of summaries) {
    const s = summary.stats;
    global.requests += s.requests;
    global.success += s.success;
    global.authErrors += s.authErrors;
    global.client4xx += s.client4xx;
    global.server5xx += s.server5xx;
    global.timeouts += s.timeouts;
    global.networkErrors += s.networkErrors;
    global.latencies.push(...s.latencies);
  }

  const globalLatencies = [...global.latencies].sort((a, b) => a - b);
  const globalP95 = Math.round(percentile(globalLatencies, 95));

  const failCount = summaries.filter((s) => s.status === "FAIL").length;
  const warnCount = summaries.filter((s) => s.status === "WARN").length;
  const passCount = summaries.filter((s) => s.status === "PASS").length;

  console.log("\n=== Summary ===");
  console.log(`wall time: ${wallMs}ms`);
  console.log(
    `global: requests=${global.requests} success=${global.success} 401/403=${global.authErrors} 4xx=${global.client4xx} 5xx=${global.server5xx} timeout=${global.timeouts} network=${global.networkErrors}`
  );
  console.log(
    `global latency: p50=${Math.round(percentile(globalLatencies, 50))}ms p95=${globalP95}ms p99=${Math.round(percentile(globalLatencies, 99))}ms`
  );
  console.log(`endpoints: PASS=${passCount} WARN=${warnCount} FAIL=${failCount}`);
  console.log(`completed iterations: ${results.length}`);

  const globalFail =
    global.server5xx > 0 ||
    global.timeouts > 0 ||
    global.authErrors > 0 ||
    failCount > 0;

  if (globalFail) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  if (warnCount > 0 || globalP95 >= P95_WARN_MS) {
    console.log("\nRESULT: PASS (with warnings)");
    process.exit(0);
  }

  console.log("\nRESULT: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
