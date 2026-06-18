#!/usr/bin/env node
/**
 * Internal operator acceptance entry — not customer documentation.
 *
 * P787 — default offline; production only with LIVE=1.
 *
 * Usage:
 *   node scripts/p787-acceptance-runner.mjs          # offline mock (default)
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p787-acceptance-runner.mjs
 *   node scripts/p787-acceptance-runner.mjs --live   # same as LIVE=1
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isLiveMode, printOfflineDefaultHint } from "./lib/acceptance-config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function runNode(scriptRel, extraEnv = {}) {
  const script = join(ROOT, scriptRel);
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isLiveMode()) {
  console.log("=== P787 acceptance runner (LIVE) ===");
  runNode("scripts/p787-live-smoke.mjs");
  process.exit(0);
}

console.log("=== P787 acceptance runner (OFFLINE default) ===");
printOfflineDefaultHint("scripts/p787-acceptance-runner.mjs");
console.log("");

runNode("scripts/p786-offline-customer-acceptance.mjs");
runNode("scripts/p778-docs-customer-visible-grep.mjs");

console.log("");
console.log("Offline acceptance complete. For production: LIVE=1 TOKFAI_API_KEY=... node scripts/p787-live-smoke.mjs");
