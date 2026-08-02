#!/usr/bin/env node
/**
 * P997 — Image quota REAL ENTRY smoke.
 *
 * Runs route + worker entry tests (production modules loaded).
 *
 *   node scripts/p997-image-quota-real-entry-smoke.mjs
 *
 * Marker: TOKFAI_P997_IMAGE_QUOTA_REAL_ENTRY_PASS
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P997_IMAGE_QUOTA_REAL_ENTRY_PASS";
const FAIL = "TOKFAI_P997_IMAGE_QUOTA_REAL_ENTRY_FAIL";
const BLOCKED = "TOKFAI_P997_BLOCKED_BY_TESTABILITY";

const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");

function run(scriptRel) {
  const script = join(ROOT, scriptRel);
  console.log(`\n>>> ${scriptRel}\n`);
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", loader, script],
    { cwd: ROOT, encoding: "utf8", env: process.env }
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return {
    status: result.status ?? 1,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const route = run("scripts/p997-image-quota-route-entry-test.mts");
const worker = run("scripts/p997-image-quota-worker-entry-test.mts");

const routeOk = route.status === 0 && route.out.includes("TOKFAI_P997_IMAGE_QUOTA_ROUTE_ENTRY_PASS");
const workerOk =
  worker.status === 0 && worker.out.includes("TOKFAI_P997_IMAGE_QUOTA_WORKER_ENTRY_PASS");

if (route.out.includes(BLOCKED) || worker.out.includes(BLOCKED)) {
  console.error(`\n${BLOCKED}`);
  process.exit(1);
}

if (!routeOk || !workerOk) {
  console.error(`\n${FAIL}`);
  console.error(
    JSON.stringify({ routeOk, workerOk, routeStatus: route.status, workerStatus: worker.status })
  );
  process.exit(1);
}

console.log(`\n${PASS}`);
process.exit(0);
