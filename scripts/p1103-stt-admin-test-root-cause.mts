#!/usr/bin/env node
/**
 * P1103 TypeScript entry (delegates to .mjs harness).
 *   node scripts/p1103-stt-admin-test-root-cause.mts
 *   npx tsx scripts/p1103-stt-admin-test-root-cause.mts
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MJS = join(ROOT, "scripts/p1103-stt-admin-test-root-cause.mjs");
const r = spawnSync(process.execPath, [MJS], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
