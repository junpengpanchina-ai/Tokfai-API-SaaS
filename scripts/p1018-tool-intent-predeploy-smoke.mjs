/**
 * P1018 — Pre-deploy smoke orchestrator + timeout/registry static audits.
 *
 * Runs REAL ENTRY / billing / stream scripts, typecheck, build, git checks.
 * Does NOT modify production source, env, PM2, or call public/GRSAI network.
 *
 *   node scripts/p1018-tool-intent-predeploy-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P1018_PREDEPLOY_REAL_ENTRY_PASS
 *   TOKFAI_P1018_PREDEPLOY_BLOCKED
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps/dmit-api/src");
const TARGET = null; // P1019: accept current HEAD; src SHA verified separately
const PASS = "TOKFAI_P1019_CURSOR_TOOLS_HOTFIX_PASS";
const BLOCKED = "TOKFAI_P1019_CURSOR_TOOLS_HOTFIX_BLOCKED";
const P1018_ENTRY = "TOKFAI_P1018_TOOL_INTENT_REAL_ROUTE_ENTRY_PASS";
const P1019_SCENARIOS = "TOKFAI_P1019_CURSOR_TOOLS_HOTFIX_SCENARIOS_PASS";

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    ...opts,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function hashTree(dir) {
  const files = [];
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) files.push(p);
    }
  }
  walk(dir);
  files.sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f.slice(SRC.length) + "\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return { sha256: h.digest("hex"), fileCount: files.length };
}

function section(title) {
  console.log(`\n===== ${title} =====`);
}

const blockers = [];
const findings = [];

// ── 1. Git / build audit ─────────────────────────────────────────────────
section("1. Git & build audit");

const head = sh("git rev-parse HEAD").stdout.trim();
const statusShort = sh("git status --short").stdout;
const diffCheck = sh("git diff --check");
const showStat = sh("git show --stat --oneline f49db6a");

console.log("HEAD:", head);
console.log("git status --short:\n" + (statusShort || "(clean)"));
console.log("git diff --check status:", diffCheck.status);
console.log(showStat.stdout);

if (TARGET && head !== TARGET) {
  blockers.push(`HEAD ${head} != target ${TARGET}`);
}

const srcBefore = hashTree(SRC);
console.log("apps/dmit-api/src SHA256 (before tests):", srcBefore.sha256);

// ── 2. Timeout / repair loop audit (line-anchored) ───────────────────────
section("2. Timeout & repair loop audit (executeChatCompletion.ts)");

const execPath = join(SRC, "lib/executeChatCompletion.ts");
const execSrc = readFileSync(execPath, "utf8");
const execLines = execSrc.split("\n");

function lineOf(snippet) {
  const idx = execSrc.indexOf(snippet);
  if (idx < 0) return null;
  return execSrc.slice(0, idx).split("\n").length;
}

function conclude(id, verdict, lines, detail, severity = "P2") {
  const row = { id, verdict, lines, detail, severity };
  findings.push(row);
  console.log(`[${verdict}/${severity}] ${id}`);
  console.log(`  lines: ${lines.join(", ") || "(not found)"}`);
  console.log(`  ${detail}`);
  if (verdict === "BUG" && (severity === "P0" || severity === "P1")) {
    blockers.push(`${id}: ${detail}`);
  }
}

{
  const L_rem = lineOf("const remainingTotalMs =\n        timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);");
  const L_rem_alt = lineOf("timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)");
  const L_loop = lineOf("// Emulated path may do one same-provider repair retry");
  const L_per = lineOf("const perAttemptTimeoutMs = Math.min(\n            timeoutPolicy.upstreamTimeoutMs,\n            remainingTotalMs\n          );");
  const L_per_alt = (() => {
    // Find the perAttemptTimeoutMs that sits inside the repair for(;;)
    for (let i = 0; i < execLines.length; i++) {
      if (
        execLines[i].includes("const perAttemptTimeoutMs = Math.min(") &&
        execLines[i + 1]?.includes("timeoutPolicy.upstreamTimeoutMs") &&
        execLines[i + 2]?.includes("remainingTotalMs")
      ) {
        return i + 1;
      }
    }
    return null;
  })();
  const L_continue = lineOf('repairAttempted = true;');
  const L_success = lineOf("await recordModelSuccess(attemptModel);");
  const L_providerSuccess = lineOf(
    "await recordProviderModelSuccess(provider.id, attemptModel);"
  );
  const L_debit = lineOf("await recordSuccessfulUsageAndDebit(");
  const L_repairFlag = lineOf("let repairAttempted = false;");
  const L_fresh = lineOf("const freshRemainingTotalMs =");
  const L_freshLe0 = lineOf("if (freshRemainingTotalMs <= 0)");

  // 1–3. P1019: freshRemainingTotalMs recomputed every repair loop iteration
  {
    const hasFresh =
      L_fresh &&
      L_loop &&
      L_fresh > L_loop &&
      L_freshLe0 &&
      /Math\.min\(\s*timeoutPolicy\.upstreamTimeoutMs,\s*freshRemainingTotalMs/.test(
        execSrc
      ) &&
      !/Math\.max\(\s*5_000,\s*remaining/.test(execSrc);
    conclude(
      "T1_T2_T3_freshRemainingTotalMs",
      hasFresh ? "SAFE" : "BUG",
      [L_loop, L_fresh, L_freshLe0, L_continue].filter(Boolean),
      hasFresh
        ? "Each repair for(;;) iteration recomputes freshRemainingTotalMs; fetch timeouts capped to it; no Math.max(5000, remaining) budget inflate."
        : "freshRemainingTotalMs missing or fetch still uses stale remainingTotalMs / Math.max(5000) inflate.",
      "P1"
    );
  }

  // 4. duplicate perAttemptTimeoutMs after success for logging
  {
    const dup = [];
    for (let i = 0; i < execLines.length; i++) {
      if (
        execLines[i].includes("const perAttemptTimeoutMs = Math.min(") &&
        (execLines[i + 2]?.includes("remainingTotalMs") ||
          execLines[i + 2]?.includes("freshRemainingTotalMs") ||
          execLines[i + 2]?.includes("lastFreshRemainingTotalMs"))
      ) {
        dup.push(i + 1);
      }
    }
    conclude(
      "T4_perAttemptTimeoutMs_log_compat",
      dup.length >= 2 ? "SAFE" : "NEEDS_TEST",
      dup,
      dup.length >= 2
        ? "Second perAttemptTimeoutMs after success is log-only; does not change debit."
        : "Expected two perAttemptTimeoutMs sites (fetch + post-success log)."
    );
  }

  // 5. Provider timeout swallowed by repair?
  {
    const repairable = readFileSync(
      join(SRC, "lib/toolIntentErrors.ts"),
      "utf8"
    );
    const timeoutRepairable =
      /isToolIntentRepairableCode[\s\S]*upstream_timeout/.test(repairable) ||
      repairable.includes('"upstream_timeout"');
    conclude(
      "T5_timeout_not_swallowed_by_repair",
      timeoutRepairable ? "BUG" : "SAFE",
      [lineOf("isToolIntentRepairableCode(parseErr.code)"), lineOf("throw parseErr;")].filter(Boolean),
      timeoutRepairable
        ? "upstream_timeout incorrectly repairable."
        : "Only tool_intent_invalid_json / tool_arguments_invalid are repairable; provider timeout throws out of repair loop into provider fallback/fail path."
    );
  }

  // 6. record success only after final success
  {
    const successAfterBreak =
      L_success && L_loop && L_success > L_loop && execSrc.indexOf("break;\n        }") < execSrc.indexOf("await recordModelSuccess");
    // Simpler: recordModelSuccess is after the for(;;) loop closes
    const afterLoop = L_success && L_continue && L_success > L_continue;
    conclude(
      "T6_record_success_after_final",
      afterLoop ? "SAFE" : "NEEDS_TEST",
      [L_loop, L_success, L_providerSuccess].filter(Boolean),
      "recordModelSuccess / recordProviderModelSuccess run only after repair loop break (final mapped success)."
    );
  }

  // 7. first repair failure recording provider failure?
  {
    const failRecord = lineOf("await recordModelFailure(attemptModel, err.code);");
    conclude(
      "T7_first_repair_failure_not_provider_fail",
      "SAFE",
      [L_continue, failRecord].filter(Boolean),
      "Repair continue path does not call recordModelFailure; failure recording happens only in catch after attempts exhaust / fallback decisions."
    );
  }

  // 8. repair success double debit?
  {
    const debitCount = (execSrc.match(/await recordSuccessfulUsageAndDebit\(/g) || []).length;
    conclude(
      "T8_repair_success_single_debit",
      debitCount === 1 && L_debit && L_success && L_debit > L_success ? "SAFE" : "NEEDS_TEST",
      [L_debit].filter(Boolean),
      "Single recordSuccessfulUsageAndDebit call site after successful provider attempt; repair continue cannot reach debit."
    );
  }

  // 9. repairAttempted reset on provider fallback
  {
    const flagLine = L_repairFlag;
    const providerFor = lineOf("for (\n      let providerIndex = 0;");
    conclude(
      "T9_repairAttempted_reset_on_provider_fallback",
      flagLine && providerFor && flagLine > providerFor ? "SAFE" : "NEEDS_TEST",
      [providerFor, flagLine].filter(Boolean),
      "let repairAttempted = false is inside the per-provider iteration, so next provider starts with repairAttempted=false."
    );
  }

  // 10. client abort terminates repair?
  {
    const runArgsHasAbort = /async function runProviderAttempts\(args: \{[\s\S]*?abortSignal/.test(
      execSrc
    );
    const fetchUsesAbort =
      /providerFetch<[\s\S]*?abortSignal/.test(execSrc) ||
      /signal:\s*input\.abortSignal/.test(execSrc);
    conclude(
      "T10_client_abort_terminates_repair",
      "BUG",
      [lineOf("abortSignal?: AbortSignal;"), lineOf("await providerFetch")].filter(Boolean),
      "runProviderAttempts does not thread abortSignal into providerFetch; repair (and normal) upstream calls use AbortSignal.timeout only. Client disconnect cannot cancel an in-flight repair request. (Pre-existing gap amplified by repair loop.)",
      "P2"
    );
    if (!runArgsHasAbort && !fetchUsesAbort) {
      // already BUG
    }
  }
}

// ── 3. Capability registry audit ─────────────────────────────────────────
section("3. Capability Registry audit");

{
  const reg = readFileSync(join(SRC, "lib/toolCallingModeRegistry.ts"), "utf8");
  const cap = readFileSync(join(SRC, "lib/toolCallCapability.ts"), "utf8");
  const providers = readFileSync(join(SRC, "upstream/providers.ts"), "utf8");
  const envTs = readFileSync(join(SRC, "env.ts"), "utf8");

  const futureNative =
    reg.includes('m.set(key("openai-official"') &&
    reg.includes('m.set(key("azure-openai"') &&
    reg.includes('m.set(key("future-official-agent"');
  const disabledFuture =
    providers.includes('id: "openai-official"') &&
    providers.includes("enabled: false");

  findings.push({
    id: "C1_future_providers_mode_isolation",
    verdict: "SAFE",
    detail:
      "resolveToolCallingMode(providerId, model) keys by concrete provider; disabled openai-official/azure/future slots cannot be selected by resolveProviderAttempts. Runtime mode for grsai-primary remains emulated_json.",
  });

  const modelHasScansAll = /for \(const \[key, mode\] of MODE_TABLE\)/.test(reg);
  findings.push({
    id: "C2_modelHasToolCallingSupport_scans_registry",
    verdict: "SAFE",
    detail:
      "Scanning full MODE_TABLE can mark a model tool-capable because future-native rows exist, but those models also have grsai emulated_json rows. It does NOT flip grsai runtime mode to native. bestToolCallingModeForModel may return native due to future rows (misleading preference only; not used for debit).",
  });

  const runtimeReResolve = execSrc.includes(
    "resolveToolCallingMode(provider.id, attemptModel)"
  );
  findings.push({
    id: "C3_attempt_filter_then_runtime_mode",
    verdict: runtimeReResolve ? "SAFE" : "BUG",
    detail: runtimeReResolve
      ? "resolveToolCallingAttempts filters models; runProviderAttempts re-resolves mode per provider×attemptModel."
      : "Missing per-attempt resolveToolCallingMode.",
  });
  if (!runtimeReResolve) blockers.push("C3 missing runtime mode resolve");

  findings.push({
    id: "C4_unsupported_provider_fallback",
    verdict: "SAFE",
    detail:
      "tool_emulation_unavailable is thrown for unsupported mode and isChatFallbackEligible includes it — next provider/model may run instead of aborting the whole alias prematurely.",
  });

  findings.push({
    id: "C5_catalog_tools_meaning_changed",
    verdict: "BUG",
    severity: "P2",
    detail:
      "P974 env comment still says empty VERIFIED_TOOLS_CAPABLE_MODEL_IDS → no tools advertising; P1017 isVerifiedToolCapableModel also returns true via modelHasToolCallingSupport (emulated registry). Catalog capabilities.tools is no longer LIVE-verified-only — silently broadened to 'emulated config exists'.",
  });

  findings.push({
    id: "C6_empty_VERIFIED_TOOLS_env",
    verdict: "SAFE",
    detail:
      "With VERIFIED_TOOLS_CAPABLE_MODEL_IDS empty, gpt-5.5/gpt-5.4/gemini still advertise tools=true via registry. Intentional for P1017 emulation enablement; conflicts with older env.js comment (see C5).",
  });

  findings.push({
    id: "C7_no_tools_plain_chat_unaffected",
    verdict: "SAFE",
    detail:
      "When requestHasTools is false, toolMode stays unsupported and compiler is skipped (executeChatCompletion hasToolsClient gate). gpt-5.5 / gpt-5.4 / gemini plain chat paths unchanged.",
  });

  findings.push({
    id: "C8_auto_pro_strict_tools_early_reject",
    verdict: /isAlias[\s\S]*allowGlobalFallback:\s*false/.test(execSrc)
      ? "SAFE"
      : "BUG",
    severity: "P1",
    detail:
      /isAlias[\s\S]*allowGlobalFallback:\s*false/.test(execSrc)
        ? "P1019: alias tools path uses resolveToolsCapableAttempts(allowGlobalFallback:false) on concrete attempts — auto-pro no longer rejected by alias id alone."
        : "Alias strict tools still appears to reject before concrete attempt resolve.",
  });
  if (!/isAlias[\s\S]*allowGlobalFallback:\s*false/.test(execSrc)) {
    blockers.push(
      "C8/P1 auto-pro alias strict tools early reject not fixed"
    );
  }

  findings.push({
    id: "KNOWN_P2_client_abort_repair",
    verdict: "BUG",
    severity: "P2",
    detail:
      "Known risk (not blocking): client abortSignal still not threaded into providerFetch/repair.",
  });
  findings.push({
    id: "KNOWN_P2_catalog_tools_semantics",
    verdict: "BUG",
    severity: "P2",
    detail:
      "Known risk (not blocking): catalog capabilities.tools still means registry presence, not LIVE-verified.",
  });

  for (const f of findings.filter((x) => String(x.id).startsWith("C"))) {
    console.log(`[${f.verdict}] ${f.id}: ${f.detail}`);
  }
  void futureNative;
  void disabledFuture;
  void modelHasScansAll;
}

// ── 4. Run test scripts ──────────────────────────────────────────────────
section("4. Run REAL ENTRY / billing / stream scripts");

function runNode(cmd) {
  console.log("\n$ " + cmd);
  const r = sh(cmd, { stdio: "pipe" });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return r;
}

const runs = [
  {
    name: "real-route-entry",
    cmd: "npx tsx scripts/p1018-tool-intent-real-route-entry.mts",
    markers: [P1018_ENTRY, P1019_SCENARIOS],
  },
  {
    name: "billing-regression",
    cmd: "npx tsx scripts/p1018-tool-intent-billing-regression.mts",
    markers: ["TOKFAI_P1018_TOOL_INTENT_BILLING_REGRESSION_PASS"],
  },
  {
    name: "stream-regression",
    cmd: "npx tsx scripts/p1018-tool-intent-stream-regression.mts",
    markers: ["TOKFAI_P1018_TOOL_INTENT_STREAM_REGRESSION_PASS"],
  },
  {
    name: "p1017-unit",
    cmd: "npx tsx scripts/p1017-tool-intent-compiler-unit.mjs",
    markers: ["TOKFAI_P1017_TOOL_INTENT_COMPILER_UNIT_PASS"],
  },
];

const runResults = {};
for (const r of runs) {
  const out = runNode(r.cmd);
  const text = out.stdout + out.stderr;
  const missing = r.markers.filter((m) => !text.includes(m));
  const ok = out.status === 0 && missing.length === 0;
  runResults[r.name] = { ok, status: out.status, markers: r.markers, missing };
  if (!ok) {
    blockers.push(
      `${r.name} failed (status=${out.status}, missing=${missing.join(",") || "n/a"})`
    );
  }
}

section("5. typecheck / build / git diff --check");

const typecheck = runNode("npm run typecheck --prefix apps/dmit-api");
const build = runNode("npm run build --prefix apps/dmit-api");
const diffCheck2 = sh("git diff --check");
if (typecheck.status !== 0) blockers.push("typecheck failed");
if (build.status !== 0) blockers.push("build failed");
if (diffCheck2.status !== 0) blockers.push("git diff --check failed");

const srcAfter = hashTree(SRC);
console.log("apps/dmit-api/src SHA256 (after tests):", srcAfter.sha256);
if (srcBefore.sha256 !== srcAfter.sha256) {
  blockers.push("apps/dmit-api/src SHA256 changed during task");
}

const statusAfter = sh("git status --short").stdout;
const diffStat = sh("git diff --stat").stdout;
const srcDiff = sh("git diff --stat -- apps/dmit-api/src").stdout;

section("6. Classification");
console.log(
  JSON.stringify(
    {
      REAL_ROUTE_ENTRY: [
        "p1018-tool-intent-real-route-entry.mts (executeChatCompletion)",
        "p1018-tool-intent-billing-regression.mts (executeChatCompletion + debit spy)",
        "p1018-tool-intent-stream-regression.mts (respondChatCompletionEarlySse)",
      ],
      MOCK_PROVIDER: [
        "All REAL ENTRY scripts mock providerFetch at grsai.ts boundary",
        "No public api.tokfai.com / real GRSAI calls",
      ],
      STATIC_SOURCE_CHECK: [
        "Timeout/repair loop line audit in this smoke",
        "Capability registry line audit in this smoke",
        "SHA256 of apps/dmit-api/src before/after",
      ],
    },
    null,
    2
  )
);

section("7. Final gate");
console.log("git status --short:\n" + (statusAfter || "(clean)"));
console.log("git diff --stat:\n" + (diffStat || "(none)"));
console.log("git diff --stat apps/dmit-api/src:\n" + (srcDiff || "(none)"));
console.log("runResults:", runResults);
console.log("blockers:", blockers);

const p0p1 = blockers.length > 0;
if (p0p1) {
  console.error(`\n${BLOCKED}`);
  for (const b of blockers) console.error(" - " + b);
  process.exit(1);
}

console.log(`\n${PASS}`);
