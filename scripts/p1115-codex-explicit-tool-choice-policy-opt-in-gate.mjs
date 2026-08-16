#!/usr/bin/env node
/**
 * P1115 launcher — Codex explicit tool_choice policy opt-in gate.
 *
 *   node scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mjs
 *
 * Optional LIVE nested P1114:
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1115-...
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mts"
);
const FAIL = "TOKFAI_P1115_CODEX_EXPLICIT_TOOL_CHOICE_POLICY_OPT_IN_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mts"
  );
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
