#!/usr/bin/env node
/**
 * P1114 launcher — responses tool_call capability matrix.
 *
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1114-responses-tool-call-capability-matrix.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com
 *   P1114_MODEL=gpt-5.5
 *   P1114_SSH=deploy@api.tokfai.com
 *   P1114_SSH_KEY=~/.ssh/tokfai_hgk_ed25519
 *   TOKFAI_PM2_LOG=/path/to/local-out.log
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1114-responses-tool-call-capability-matrix.mts"
);
const FAIL = "TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_FAIL";

if (!existsSync(MTS)) {
  console.error("missing scripts/p1114-responses-tool-call-capability-matrix.mts");
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
