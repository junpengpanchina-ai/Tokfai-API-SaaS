#!/usr/bin/env node
/**
 * P1104 TypeScript entry (delegates to .mjs harness).
 *   npx tsx scripts/p1104-grsai-stt-provider-adapter.mts
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MJS = join(ROOT, "scripts/p1104-grsai-stt-provider-adapter.mjs");
const r = spawnSync(process.execPath, [MJS], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
