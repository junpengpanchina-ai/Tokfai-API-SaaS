#!/usr/bin/env node
/**
 * P1100 launcher — upstream transport failover + long-stream resilience.
 *
 *   node scripts/p1100-upstream-transport-failover-long-stream-resilience.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MTS = join(
  ROOT,
  "scripts/p1100-upstream-transport-failover-long-stream-resilience.mts"
);
const FAIL =
  "TOKFAI_P1100_UPSTREAM_TRANSPORT_FAILOVER_LONG_STREAM_RESILIENCE_FAIL";

if (!existsSync(MTS)) {
  console.error(
    "missing scripts/p1100-upstream-transport-failover-long-stream-resilience.mts"
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
  { cwd: ROOT, stdio: "inherit", env: process.env }
);
process.exit(r.status === null ? 1 : r.status);
