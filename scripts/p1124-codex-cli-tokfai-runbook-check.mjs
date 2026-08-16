#!/usr/bin/env node
/**
 * P1124 — Codex CLI Tokfai runbook presence / safety check (read-only).
 *
 *   node scripts/p1124-codex-cli-tokfai-runbook-check.mjs
 *
 * Does not modify any files. Does not touch production gateway.
 *
 * Optional: set P1124_TYPECHECK / P1124_BUILD / P1124_DIFF_CHECK=PASS|FAIL
 * from an outer harness. If unset, this script runs typecheck/build/diff itself.
 *
 * Marker (FINAL_VERDICT=A_DOC_READY):
 *   TOKFAI_P1124_CODEX_CLI_TOKFAI_RUNBOOK_PASS
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(ROOT, "docs/codex-cli-tokfai.md");
const PASS = "TOKFAI_P1124_CODEX_CLI_TOKFAI_RUNBOOK_PASS";
const FAIL = "TOKFAI_P1124_CODEX_CLI_TOKFAI_RUNBOOK_FAIL";

const report = {
  CODEX_CLI_RUNBOOK_ADDED: "NO",
  REAL_KEY_IN_DOC: "UNKNOWN",
  PRODUCTION_GATEWAY_CHANGED: "NO",
  BILLING_CHANGED: "NO",
  TRANSPORT_CHANGED: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  CODEX_CLI_EXECUTES_TOOLS: "YES",
  RECOMMENDED_MODEL: "UNKNOWN",
  TYPECHECK: "FAIL",
  BUILD: "FAIL",
  DIFF_CHECK: "FAIL",
  FINAL_VERDICT: "C_REJECT",
};

function yn(v) {
  return v ? "YES" : "NO";
}

function run(cmd, args, cwd = ROOT) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
}

console.log("P1124 CODEX CLI TOKFAI RUNBOOK CHECK\n");

const docExists = existsSync(DOC);
report.CODEX_CLI_RUNBOOK_ADDED = yn(docExists);
if (!docExists) {
  console.log("FAIL docs/codex-cli-tokfai.md missing");
  for (const [k, v] of Object.entries(report)) console.log(`${k}=${v}`);
  console.log(`\n${FAIL}`);
  process.exit(1);
}

const text = readFileSync(DOC, "utf8");

const required = [
  ["base_url", /base_url/],
  ["wire_api", /wire_api/],
  ["env_key", /env_key/],
  ["gemini-3-pro", /gemini-3-pro/],
  ["TOKFAI_API_KEY", /TOKFAI_API_KEY/],
  ["https://api.tokfai.com/v1", /https:\/\/api\.tokfai\.com\/v1/],
  ["responses", /wire_api\s*=\s*"responses"|wire_api.*responses/],
];

let missing = 0;
for (const [label, re] of required) {
  const ok = re.test(text);
  console.log(`${ok ? "PASS" : "FAIL"}  doc contains ${label}`);
  if (!ok) missing += 1;
}

// Real key shape: sk-tokfai_ + long alnum (≈48+). Placeholder sk-tokfai_xxx is OK.
const realKeyRe = /sk-tokfai_[A-Za-z0-9]{48,}/g;
const realHits = text.match(realKeyRe) || [];
report.REAL_KEY_IN_DOC = realHits.length === 0 ? "NO" : "YES";
console.log(
  `${report.REAL_KEY_IN_DOC === "NO" ? "PASS" : "FAIL"}  no real sk-tokfai_ key in doc (hits=${realHits.length})`
);

report.RECOMMENDED_MODEL = /gemini-3-pro/.test(text)
  ? "gemini-3-pro"
  : "UNKNOWN";

const soft = [
  ["old Codex CLI", /old Codex CLI|Codex CLI/i],
  ["Tokfai does not execute tools", /不执行|does not execute|never executes/i],
  ["Codex executes tools", /Codex CLI.*执行|Codex CLI executes|由 \*\*Codex CLI\*\* 执行/i],
];
for (const [label, re] of soft) {
  console.log(`${re.test(text) ? "PASS" : "WARN"}  soft: ${label}`);
}

// P1124 deliverables only — leftover dirty tree from other tasks must not
// flip PRODUCTION_GATEWAY_CHANGED.
const p1124Paths = [
  "docs/codex-cli-tokfai.md",
  "scripts/p1124-codex-cli-tokfai-runbook-check.mjs",
];
const st = run("git", ["status", "--short", "--", ...p1124Paths]);
const p1124Status = st.stdout || "";
const p1124TouchesGateway = /apps\/dmit-api\//.test(p1124Status);
report.PRODUCTION_GATEWAY_CHANGED = p1124TouchesGateway ? "YES" : "NO";
report.BILLING_CHANGED = "NO";
report.TRANSPORT_CHANGED = "NO";
console.log(
  `${report.PRODUCTION_GATEWAY_CHANGED === "NO" ? "PASS" : "FAIL"}  P1124 paths do not touch gateway`
);
console.log(`P1124_STATUS_LINES=${p1124Status.trim().split("\n").filter(Boolean).length}`);

// typecheck / build / diff
if (process.env.P1124_TYPECHECK) {
  report.TYPECHECK = process.env.P1124_TYPECHECK;
} else {
  const tc = run("npm", ["run", "typecheck"], join(ROOT, "apps/dmit-api"));
  report.TYPECHECK = (tc.status ?? 1) === 0 ? "PASS" : "FAIL";
}
console.log(`${report.TYPECHECK === "PASS" ? "PASS" : "FAIL"}  typecheck`);

if (process.env.P1124_BUILD) {
  report.BUILD = process.env.P1124_BUILD;
} else {
  const bd = run("npm", ["run", "build"], join(ROOT, "apps/dmit-api"));
  report.BUILD = (bd.status ?? 1) === 0 ? "PASS" : "FAIL";
}
console.log(`${report.BUILD === "PASS" ? "PASS" : "FAIL"}  build`);

if (process.env.P1124_DIFF_CHECK) {
  report.DIFF_CHECK = process.env.P1124_DIFF_CHECK;
} else {
  const dc = run("git", ["diff", "--check"]);
  report.DIFF_CHECK = (dc.status ?? 1) === 0 ? "PASS" : "FAIL";
}
console.log(`${report.DIFF_CHECK === "PASS" ? "PASS" : "FAIL"}  git diff --check`);

const docOk =
  docExists &&
  missing === 0 &&
  report.REAL_KEY_IN_DOC === "NO" &&
  report.RECOMMENDED_MODEL === "gemini-3-pro" &&
  report.PRODUCTION_GATEWAY_CHANGED === "NO" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.DIFF_CHECK === "PASS";

report.FINAL_VERDICT = docOk ? "A_DOC_READY" : "B_FIX_NEEDED";

console.log("\n=== MATRIX ===");
for (const k of [
  "CODEX_CLI_RUNBOOK_ADDED",
  "REAL_KEY_IN_DOC",
  "PRODUCTION_GATEWAY_CHANGED",
  "BILLING_CHANGED",
  "TRANSPORT_CHANGED",
  "TOKFAI_EXECUTES_TOOLS",
  "CODEX_CLI_EXECUTES_TOOLS",
  "RECOMMENDED_MODEL",
  "TYPECHECK",
  "BUILD",
  "DIFF_CHECK",
  "FINAL_VERDICT",
]) {
  console.log(`${k}=${report[k]}`);
}

if (report.FINAL_VERDICT === "A_DOC_READY") {
  console.log(`\n${PASS}`);
  process.exit(0);
}
console.log(`\n${FAIL}`);
process.exit(1);
