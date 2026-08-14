#!/usr/bin/env node
/**
 * P1097 launcher — canonical previous_response_id key fix.
 *
 *   node scripts/p1097-responses-previous-response-id-canonical-key-fix.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1097-responses-previous-response-id-canonical-key-fix.mts"
);
const FAIL =
  "TOKFAI_P1097_RESPONSES_PREVIOUS_RESPONSE_ID_CANONICAL_KEY_FIX_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1097-responses-previous-response-id-canonical-key-fix.mts"
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
