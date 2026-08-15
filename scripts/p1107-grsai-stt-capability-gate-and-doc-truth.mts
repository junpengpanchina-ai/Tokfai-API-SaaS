#!/usr/bin/env node
/**
 * P1107 TypeScript entry (delegates to .mjs).
 *   npx tsx scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mts
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MJS = join(ROOT, "scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mjs");
const r = spawnSync(process.execPath, [MJS], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
