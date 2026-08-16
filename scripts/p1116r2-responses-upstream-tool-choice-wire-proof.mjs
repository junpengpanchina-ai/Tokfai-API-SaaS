#!/usr/bin/env node
/**
 * P1116R2 launcher — upstream tool_choice wire proof.
 *
 *   node scripts/p1116r2-responses-upstream-tool-choice-wire-proof.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1116r2-responses-upstream-tool-choice-wire-proof.mts"
);
const FAIL = "TOKFAI_P1116R2_RESPONSES_UPSTREAM_TOOL_CHOICE_WIRE_PROOF_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1116r2-responses-upstream-tool-choice-wire-proof.mts"
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
