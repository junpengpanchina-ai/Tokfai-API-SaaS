#!/usr/bin/env node
/**
 * P1109 launcher — transparent Codex/Cursor no tool-force gate.
 *
 *   node scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mts"
);
const FAIL =
  "TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_FAIL";

if (!existsSync(MTS)) {
  console.error("missing scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mts");
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
    env: { ...process.env, P1109_INNER: "1" },
  }
);
process.exit(r.status ?? 1);
