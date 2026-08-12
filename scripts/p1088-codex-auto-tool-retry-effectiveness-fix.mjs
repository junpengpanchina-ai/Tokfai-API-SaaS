#!/usr/bin/env node
/**
 * P1088 launcher — runs the .mts REAL ENTRY suite under node test mocks.
 *
 *   node scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mts"
);
const FAIL =
  "TOKFAI_P1088_CODEX_AUTO_TOOL_RETRY_EFFECTIVENESS_FIX_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mts"
  );
  console.log(FAIL);
  process.exit(1);
}

const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
const r = spawnSync(
  process.execPath,
  [
    "--experimental-test-module-mocks",
    "--import",
    loader,
    MTS,
    ...process.argv.slice(2),
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  }
);
process.exit(r.status === null ? 1 : r.status);
