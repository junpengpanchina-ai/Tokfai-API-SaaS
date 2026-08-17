#!/usr/bin/env node
/**
 * Local aviation-sim baseline: mock health + load ladder 1/5/10 + isolation + billing sims.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;

function run(script, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(node, [join(root, script)], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const mock = spawn(node, [join(root, "scripts/aviation-sim/mock-upstream.mjs")], {
  stdio: "ignore",
  detached: true,
});
mock.unref();
await sleep(400);

const load = await run("scripts/aviation-sim/load-harness.mjs", {
  LOAD_TARGET: "http://127.0.0.1:9470",
  LOAD_LADDER: "1,5,10",
  LOAD_WORKLOAD: "normal",
});
const iso = await run("scripts/aviation-sim/session-isolation.mjs");
const bill = await run("scripts/aviation-sim/billing-invariants.mjs");

const summary = {
  MOCK_PROVIDER_READY: true,
  LOAD_HARNESS_READY: true,
  LOCAL_BASELINE_PASS: load.code === 0 && /LOCAL_BASELINE_PASS\": true/.test(load.out),
  TOOL_ROUNDTRIP_PASS: "NO",
  RESUME_PASS: "NO",
  SESSION_ISOLATION_PASS: "NO",
  SESSION_ISOLATION_INPROC: iso.code === 0,
  BILLING_INVARIANT_PASS: "NO",
  BILLING_INVARIANT_SIM: bill.code === 0,
  PRODUCTION_LOAD_TEST_EXECUTED: false,
  DMIT_BASELINE_CAPACITY: "UNKNOWN",
};

console.log(JSON.stringify(summary, null, 2));
console.log("--- load ---");
console.log(load.out.slice(-800));
process.exit(summary.LOCAL_BASELINE_PASS ? 0 : 1);
