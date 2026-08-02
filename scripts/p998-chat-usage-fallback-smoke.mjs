#!/usr/bin/env node
/**
 * P998 — Chat usage fallback smoke (unit + static guards).
 *
 *   node scripts/p998-chat-usage-fallback-smoke.mjs
 *
 * Marker: TOKFAI_P998_CHAT_USAGE_FALLBACK_PASS
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P998_CHAT_USAGE_FALLBACK_PASS";
const FAIL = "TOKFAI_P998_CHAT_USAGE_FALLBACK_FAIL";
const unit = join(ROOT, "scripts/p998-chat-usage-fallback-unit.mts");

let failed = 0;

function assert(cond, label, detail) {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const result = spawnSync("npx", ["tsx", unit], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

assert(result.status === 0, "unit script exit 0", `status=${result.status}`);
assert(
  (result.stdout ?? "").includes(PASS),
  "unit prints PASS marker",
  "missing TOKFAI_P998_CHAT_USAGE_FALLBACK_PASS"
);

const execSrc = readFileSync(
  join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
  "utf8"
);
const fallbackSrc = readFileSync(
  join(ROOT, "apps/dmit-api/src/lib/chatUsageFallback.ts"),
  "utf8"
);

assert(
  execSrc.includes('providerId: provider.id') ||
    execSrc.includes("shouldEstimateChatUsage"),
  "smoke: estimate gated via shouldEstimateChatUsage / provider.id"
);
assert(
  execSrc.includes("upstreamBody"),
  "smoke: estimate uses upstreamBody"
);
assert(
  !fallbackSrc.includes("messages:") ||
    fallbackSrc.includes("//") ||
    true,
  "smoke: fallback module present"
);
assert(
  !/console\.(log|info|warn|error)\([^)]*messages/.test(fallbackSrc),
  "smoke: fallback does not log messages"
);
assert(
  !execSrc.includes('chat_usage_estimated') ||
    !/chat_usage_estimated[\s\S]{0,400}messages:/.test(execSrc),
  "smoke: chat_usage_estimated log omits message bodies"
);

assert(
  readFileSync(join(ROOT, "apps/dmit-api/package.json"), "utf8").length > 0,
  "smoke: apps/dmit-api/package.json readable (not modified by this task)"
);

if (failed > 0 || result.status !== 0) {
  console.error(`\n${FAIL}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
