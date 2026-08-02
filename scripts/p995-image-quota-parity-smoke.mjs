#!/usr/bin/env node
/**
 * P995-IMAGE-QUOTA-PARITY smoke wrapper (+ optional P997 real-entry chain).
 *
 *   node scripts/p995-image-quota-parity-smoke.mjs
 *
 * Marker: TOKFAI_P995_IMAGE_QUOTA_PARITY_PASS
 * Also runs: scripts/p997-image-quota-real-entry-smoke.mjs when P995 unit passes.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const unit = join(ROOT, "scripts/p995-image-quota-parity-unit.mts");
const p997 = join(ROOT, "scripts/p997-image-quota-real-entry-smoke.mjs");

const result = spawnSync("npx", ["tsx", unit], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\n--- chaining P997 real-entry smoke ---\n");
const p997result = spawnSync(process.execPath, [p997], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});
process.stdout.write(p997result.stdout ?? "");
process.stderr.write(p997result.stderr ?? "");
process.exit(p997result.status ?? 1);
