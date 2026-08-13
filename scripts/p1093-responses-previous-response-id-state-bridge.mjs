#!/usr/bin/env node
/**
 * P1093 launcher — runs the .mts REAL ENTRY suite under node test mocks.
 *
 *   node scripts/p1093-responses-previous-response-id-state-bridge.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1093-responses-previous-response-id-state-bridge.mts"
);
const FAIL =
  "TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1093-responses-previous-response-id-state-bridge.mts"
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
