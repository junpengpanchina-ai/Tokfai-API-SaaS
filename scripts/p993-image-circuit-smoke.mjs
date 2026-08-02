#!/usr/bin/env node
/**
 * P993-IMAGE-CIRCUIT smoke wrapper.
 *
 *   node scripts/p993-image-circuit-smoke.mjs
 *
 * Marker: TOKFAI_P993_IMAGE_CIRCUIT_PASS
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const unit = join(ROOT, "scripts/p993-image-circuit-unit.mts");

const result = spawnSync("npx", ["tsx", unit], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status === 0 ? 0 : 1);
