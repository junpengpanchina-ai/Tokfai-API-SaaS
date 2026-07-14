#!/usr/bin/env node
/**
 * Public Beta light load smoke — concurrency 10 for 60s.
 *
 * Probes:
 *   GET  /health
 *   GET  /v1/models
 *   GET  /v1/billing/plans
 *   POST /v1/responses (small prompt)
 *
 * Fail if:
 *   - error rate > 1%
 *   - any 5xx
 *   - unexpected 429 (only allowed when intentionally over limit)
 *
 * Usage:
 *   node scripts/public-beta-light-load-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-light-load-smoke.mjs
 *
 * Env:
 *   TOKFAI_LOAD_DURATION_MS   default 60000
 *   TOKFAI_LOAD_CONCURRENCY   default 10
 *   TOKFAI_LOAD_ALLOW_429=1   treat 429 as non-error (default off)
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const LIVE = isLiveMode();
const DURATION_MS = Math.max(
  5_000,
  parseInt(process.env.TOKFAI_LOAD_DURATION_MS ?? "60000", 10) || 60_000
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.TOKFAI_LOAD_CONCURRENCY ?? "10", 10) || 10
);
const ALLOW_429 = process.env.TOKFAI_LOAD_ALLOW_429 === "1";
const TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.TOKFAI_LOAD_TIMEOUT_MS ?? "30000", 10) || 30_000
);

/** @type {number[]} */
const latencies = [];
let total = 0;
let errors = 0;
let status5xx = 0;
let status429 = 0;
let mockChild = null;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function endpointFor(i) {
  const n = i % 4;
  if (n === 0) return { method: "GET", path: "/health", auth: false };
  if (n === 1) return { method: "GET", path: "/v1/models", auth: true };
  if (n === 2) return { method: "GET", path: "/v1/billing/plans", auth: false };
  return {
    method: "POST",
    path: "/v1/responses",
    auth: true,
    body: { model: "auto-fast", input: "ping", stream: false },
  };
}

async function oneRequest(base, apiKey, seq) {
  const ep = endpointFor(seq);
  const url = `${base}${ep.path}`;
  const started = Date.now();
  try {
    const headers = {};
    if (ep.auth) headers.Authorization = `Bearer ${apiKey}`;
    if (ep.body) headers["Content-Type"] = "application/json";

    const { res } = await acceptanceFetch(url, {
      method: ep.method,
      headers,
      body: ep.body ? JSON.stringify(ep.body) : undefined,
      timeoutMs: TIMEOUT_MS,
    });

    const ms = Date.now() - started;
    latencies.push(ms);
    total += 1;

    if (res.status >= 500) {
      status5xx += 1;
      errors += 1;
      return;
    }
    if (res.status === 429) {
      status429 += 1;
      if (!ALLOW_429) errors += 1;
      return;
    }
    if (!res.ok) {
      errors += 1;
    }
  } catch {
    latencies.push(Date.now() - started);
    total += 1;
    errors += 1;
  }
}

async function worker(base, apiKey, stopAt, counter) {
  while (Date.now() < stopAt) {
    const seq = counter.n++;
    await oneRequest(base, apiKey, seq);
  }
}

async function main() {
  console.log("=== Tokfai Public Beta light load smoke ===");
  console.log(`Mode: ${LIVE ? "LIVE" : "offline/mock"}`);
  console.log(`Concurrency=${CONCURRENCY} duration=${DURATION_MS}ms`);

  let base;
  let apiKey;

  try {
    if (LIVE) {
      base = resolveApiBaseUrl(true).replace(/\/v1$/, "");
      apiKey = process.env.TOKFAI_API_KEY ?? "";
      if (!apiKey) {
        console.error("LIVE=1 requires TOKFAI_API_KEY");
        process.exit(1);
      }
    } else {
      const mock = await ensureMockGateway();
      mockChild = mock.child ?? null;
      base = mock.baseUrl.replace(/\/v1$/, "");
      apiKey = mock.apiKey ?? DEFAULT_MOCK_KEY;
    }

    console.log(`API: ${base}`);

    const stopAt = Date.now() + DURATION_MS;
    const counter = { n: 0 };
    const workers = Array.from({ length: CONCURRENCY }, () =>
      worker(base, apiKey, stopAt, counter)
    );
    await Promise.all(workers);

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const errorRate = total === 0 ? 1 : errors / total;

    console.log("\n=== Results ===");
    console.log(`requests=${total}`);
    console.log(`errors=${errors} error_rate=${(errorRate * 100).toFixed(2)}%`);
    console.log(`5xx=${status5xx} 429=${status429}`);
    console.log(`p50=${p50}ms p95=${p95}ms`);

    let failed = false;
    if (status5xx > 0) {
      console.error("FAIL  5xx responses observed");
      failed = true;
    }
    if (errorRate > 0.01) {
      console.error("FAIL  error rate > 1%");
      failed = true;
    }
    if (status429 > 0 && !ALLOW_429) {
      console.error(
        "FAIL  unexpected 429 (set TOKFAI_LOAD_ALLOW_429=1 only when intentionally over limit)"
      );
      failed = true;
    }

    if (failed) {
      console.error("\npublic-beta-light-load-smoke: FAILED");
      process.exit(1);
    }

    console.log("\nPASS  light load within error budget");
    console.log("public-beta-light-load-smoke: OK");
  } finally {
    if (mockChild) {
      try {
        mockChild.kill();
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
