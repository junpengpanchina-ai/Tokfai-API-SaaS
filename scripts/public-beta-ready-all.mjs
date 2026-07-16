#!/usr/bin/env node
/**
 * Public Beta Ready All — offline suite + optional live probes.
 *
 * Order:
 *  1. security-smoke-suite
 *  2. p822 / p821 leak
 *  3. public-model-registry
 *  4. docs-or-ui-en-no-chinese
 *  5. public-beta-final-qa-suite
 *  6. public-beta-light-load-smoke (mock)
 *  7. public-beta-live-acceptance        if TOKFAI_API_KEY set
 *  8. public-beta-live-image-smoke       if TOKFAI_LIVE_IMAGE_SMOKE=1
 *  9. public-beta-live-load              if TOKFAI_LIVE_LOAD=1
 *     (default TOKFAI_LOAD_MODE=rate-limit → RATE_LIMIT_PASS;
 *      TOKFAI_LOAD_MODE=throughput → THROUGHPUT_PASS, needs high RPM key)
 *
 * Usage:
 *   node scripts/public-beta-ready-all.mjs
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-ready-all.mjs
 *   TOKFAI_API_KEY=... TOKFAI_LIVE_IMAGE_SMOKE=1 TOKFAI_LIVE_LOAD=1 \
 *     node scripts/public-beta-ready-all.mjs
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { maskApiKey } from "./lib/public-beta-live-helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const LIVE_IMAGE = process.env.TOKFAI_LIVE_IMAGE_SMOKE === "1";
const LIVE_LOAD = process.env.TOKFAI_LIVE_LOAD === "1";

const OFFLINE = [
  "scripts/security-smoke-suite.mjs",
  "scripts/p822-public-consumer-leak-smoke.mjs",
  "scripts/p821-docs-leak-smoke.mjs",
  "scripts/p830-client-provider-selection-smoke.mjs",
  "scripts/public-model-registry-smoke.mjs",
  "scripts/docs-or-ui-en-no-chinese-smoke.mjs",
  "scripts/responses-nonstream-envelope-smoke.mjs",
  "scripts/public-beta-final-qa-suite.mjs",
  "scripts/public-beta-light-load-smoke.mjs",
];

function run(scriptRel) {
  console.log(`\n════════ ${scriptRel} ════════`);
  const result = spawnSync(process.execPath, [join(ROOT, scriptRel)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\nSUITE FAIL: ${scriptRel} exited ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log("=== Tokfai Public Beta Ready All ===");
console.log(
  `api_key: ${API_KEY ? maskApiKey(API_KEY) : "(not set — live steps skipped)"}`
);
console.log(`live_image: ${LIVE_IMAGE ? "yes" : "no"}`);
console.log(`live_load: ${LIVE_LOAD ? "yes" : "no"}`);

for (const script of OFFLINE) {
  run(script);
}

if (API_KEY.startsWith("sk-tokfai_")) {
  run("scripts/public-beta-live-acceptance.mjs");
} else {
  console.log("\nSKIP  public-beta-live-acceptance.mjs (TOKFAI_API_KEY not set)");
}

if (LIVE_IMAGE) {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_LIVE_IMAGE_SMOKE=1 requires TOKFAI_API_KEY");
    process.exit(1);
  }
  run("scripts/public-beta-live-image-smoke.mjs");
} else {
  console.log("\nSKIP  public-beta-live-image-smoke.mjs (TOKFAI_LIVE_IMAGE_SMOKE!=1)");
}

if (LIVE_LOAD) {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_LIVE_LOAD=1 requires TOKFAI_API_KEY");
    process.exit(1);
  }
  run("scripts/public-beta-live-load.mjs");
} else {
  console.log("\nSKIP  public-beta-live-load.mjs (TOKFAI_LIVE_LOAD!=1)");
}

console.log("\nTOKFAI_PUBLIC_BETA_READY_ALL_PASS");
process.exit(0);
