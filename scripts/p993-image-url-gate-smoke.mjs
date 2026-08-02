#!/usr/bin/env node
/**
 * P993 — Image URL gate smoke (unit + static source guards).
 *
 *   node scripts/p993-image-url-gate-smoke.mjs
 *
 * Marker: TOKFAI_P993_IMAGE_URL_GATE_PASS
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const unit = join(ROOT, "scripts/p993-image-url-gate-unit.mts");

const result = spawnSync("npx", ["tsx", unit], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status === 0 ? 0 : 1);
