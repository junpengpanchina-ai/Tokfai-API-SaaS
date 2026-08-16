#!/usr/bin/env node
/**
 * P1119 launcher — real Codex tool schema wire diff.
 *
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1119-real-codex-tool-schema-wire-diff.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1119-real-codex-tool-schema-wire-diff.mts"
);
const FAIL = "TOKFAI_P1119_REAL_CODEX_TOOL_SCHEMA_WIRE_DIFF_FAIL";

if (!existsSync(MTS)) {
  console.error("missing scripts/p1119-real-codex-tool-schema-wire-diff.mts");
  console.log(FAIL);
  process.exit(1);
}

const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
const r = spawnSync(
  process.execPath,
  ["--import", loader, MTS, ...process.argv.slice(2)],
  { cwd: ROOT, stdio: "inherit", env: process.env }
);
process.exit(r.status ?? 1);
