#!/usr/bin/env node
/**
 * Security Smoke Suite V1 — runs all security-*.mjs scripts.
 * Prints TOKFAI_SECURITY_SMOKE_ALL_PASS when every script exits 0.
 *
 * Usage: node scripts/security-smoke-suite.mjs
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = [
  "security-admin-auth-smoke.mjs",
  "security-tenant-isolation-smoke.mjs",
  "security-api-key-redaction-smoke.mjs",
  "security-billing-race-smoke.mjs",
  "security-model-pricing-smoke.mjs",
  "security-image-url-ssrf-smoke.mjs",
  "security-host-tenant-smoke.mjs",
  "security-rate-limit-smoke.mjs",
];

let failed = 0;
for (const name of SCRIPTS) {
  console.log(`\n── ${name} ──`);
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", name)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`SUITE FAIL: ${name} exited ${result.status}`);
  }
}

if (failed > 0) {
  console.error(`\nsecurity-smoke-suite: ${failed}/${SCRIPTS.length} failed`);
  process.exit(1);
}

console.log("\nTOKFAI_SECURITY_SMOKE_ALL_PASS");
process.exit(0);
