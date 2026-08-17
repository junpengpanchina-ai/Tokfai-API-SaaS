#!/usr/bin/env node
/**
 * Local load harness against mock upstream only (default).
 * Does NOT hit production DMIT unless explicitly overridden — and even then
 * prints PRODUCTION_LOAD_TEST_READY and refuses without ALLOW_PRODUCTION_LOAD=1.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TARGET = (process.env.LOAD_TARGET || "http://127.0.0.1:9470").replace(/\/+$/, "");
const LADDER = (process.env.LOAD_LADDER || "1,5,10")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((n) => n > 0);
const WORKLOAD = process.env.LOAD_WORKLOAD || "normal";
const ALLOW_PROD = process.env.ALLOW_PRODUCTION_LOAD === "1";

function isProdTarget(url) {
  return /api\.tokfai\.com|tokfai\.com/i.test(url) && !/127\.0\.0\.1|localhost/i.test(url);
}

if (isProdTarget(TARGET) && !ALLOW_PROD) {
  console.log("PRODUCTION_LOAD_TEST_READY");
  console.log(
    JSON.stringify(
      {
        Target: TARGET,
        Expected_concurrency: LADDER,
        Duration: "NOT_AUTHORIZED",
        Estimated_requests: "N/A",
        Estimated_bandwidth: "N/A",
        Stop_thresholds: "use repo baseline — UNKNOWN until measured",
        Rollback_stop_command: "Ctrl-C / kill harness PID",
      },
      null,
      2
    )
  );
  console.log("Refusing production load without ALLOW_PRODUCTION_LOAD=1");
  process.exit(2);
}

async function oneRequest(scenario) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${TARGET}/v1/mock?scenario=${scenario}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await res.text();
    return { ok: res.ok || res.status === 429 || res.status >= 400, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, err: String(e) };
  }
}

async function runLevel(concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < concurrency * 2) {
      i += 1;
      results.push(await oneRequest(WORKLOAD));
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = Date.now() - t0;
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => lat[Math.max(0, Math.ceil((q / 100) * lat.length) - 1)] || 0;
  const errors = results.filter((r) => r.status === 0).length;
  return {
    concurrency,
    requests: results.length,
    elapsed_ms: elapsed,
    rps: results.length / (elapsed / 1000),
    p50: p(50),
    p95: p(95),
    p99: p(99),
    network_errors: errors,
  };
}

async function ensureMock() {
  try {
    const h = await fetch(`${TARGET}/health`);
    if (h.ok) return null;
  } catch {
    /* start */
  }
  const child = spawn(process.execPath, ["scripts/aviation-sim/mock-upstream.mjs"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  await sleep(300);
  return child.pid;
}

const pid = await ensureMock();
const report = [];
for (const c of LADDER) {
  const row = await runLevel(c);
  report.push(row);
  console.log(JSON.stringify(row));
  if (row.network_errors > 0) {
    console.log("STOP_GATE network_errors>0 — not escalating further");
    break;
  }
}

console.log(
  JSON.stringify(
    {
      TOKFAI_AVIATION_LOAD_HARNESS: "COMPLETE",
      target: TARGET,
      mock_pid: pid,
      levels: report,
      LOCAL_BASELINE_PASS: report.length > 0 && report.every((r) => r.network_errors === 0),
      PRODUCTION_LOAD_TEST_EXECUTED: false,
    },
    null,
    2
  )
);
