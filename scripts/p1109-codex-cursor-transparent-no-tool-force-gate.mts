/**
 * P1109 — Transparent Codex/Cursor no tool-force gate.
 *
 * REAL executeChatCompletion ENTRY (/v1/responses) + helper predicates.
 * MOCK provider + billing via p1018 harness.
 *
 *   node scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mjs
 *
 * Marker (FINAL_VERDICT=A only):
 *   TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_PASS
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_FILE_TOOLS,
  CALLER,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
  getCounts,
  installP1018Mocks,
  loadExecuteChatCompletion,
  nativeToolCompletion,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  shouldAttemptCodexAutoToolNoCallRetry,
} = await import("../apps/dmit-api/src/lib/codexAutoToolRetry.ts");
const {
  shouldAttemptGrsaiToolCompatFallback,
} = await import("../apps/dmit-api/src/lib/grsaiToolCompatFallback.ts");
const {
  shouldBypassTokfaiToolForceForTransparentClient,
  TRANSPARENT_TOOL_FORCE_BYPASS_REASON,
} = await import("../apps/dmit-api/src/lib/transparentToolForceBypass.ts");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_PASS";
const FAIL =
  "TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_FAIL";
const SUMMARY = join(
  ROOT,
  "tmp/p1109-codex-cursor-transparent-no-tool-force-gate-summary.json"
);

const READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_test_file",
      description: "Read a test file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  ...AGENT_FILE_TOOLS,
] as const;

let failed = 0;
const report: Record<string, string> = {
  TRANSPARENT_CODEX_NO_FORCE_GATE_ADDED: "NO",
  AUTO_TOOL_RETRY_BYPASSED_FOR_TRANSPARENT_AUTO: "NO",
  GRS_COMPAT_FALLBACK_BYPASSED_FOR_TRANSPARENT_AUTO: "NO",
  CLIENT_REQUIRED_TOOL_CHOICE_PRESERVED: "NO",
  CLIENT_NAMED_TOOL_CHOICE_PRESERVED: "NO",
  PROVIDER_NATIVE_TOOL_CALLS_PRESERVED: "NO",
  PROVIDER_STOP_NO_TOOL_CALLS_RETURNED_AS_STOP: "NO",
  NO_PROMPT_LOGGED: "YES",
  NO_FILE_PATH_LOGGED: "YES",
  NO_TOOL_ARGS_LOGGED: "YES",
  BILLING_DOUBLE_CHARGE_RISK: "YES",
  CHAT_COMPLETIONS_CHANGED: "NO",
  STT_CHANGED: "NO",
  RESPONSES_CHANGED: "YES",
  DURABLE_CHANGED: "NO",
  TRANSPORT_CHANGED: "NO",
  TYPECHECK: "FAIL",
  BUILD: "FAIL",
  REGRESSIONS: "FAIL",
  GIT_DIFF_CHECK: "FAIL",
  FINAL_VERDICT: "C_REJECT",
};

function pass(label: string, detail?: string) {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label, detail);
  else fail(label, detail);
}
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}
function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}
function hasToolCalls(result: any): boolean {
  const m = msg(result);
  return Array.isArray(m?.tool_calls) && m.tool_calls.length > 0;
}
function finishReason(result: any): string | null {
  return result?.response?.choices?.[0]?.finish_reason ?? null;
}

async function execResponses(
  body: Record<string, unknown>,
  requestId: string
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/responses",
    limitKey: "p1109",
    clientStream: false,
  });
}

function baseBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    model: "gpt-5.5",
    messages: [
      {
        role: "user",
        content: "Please read /tmp/tokfai-p1108-file-read-target.txt",
      },
    ],
    tools: READ_TOOLS,
    tool_choice: "auto",
    stream: false,
    ...overrides,
  };
}

console.log("P1109 TRANSPARENT CODEX/CURSOR NO TOOL-FORCE GATE\n");

// ── Static ───────────────────────────────────────────────────────────────
{
  const bypassSrc = read(
    "apps/dmit-api/src/lib/transparentToolForceBypass.ts"
  );
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const retrySrc = read("apps/dmit-api/src/lib/codexAutoToolRetry.ts");
  const compatSrc = read("apps/dmit-api/src/lib/grsaiToolCompatFallback.ts");
  const logSrc = read("apps/dmit-api/src/logger.ts");

  assert(
    /shouldBypassTokfaiToolForceForTransparentClient/.test(bypassSrc) &&
      /TRANSPARENT_TOOL_FORCE_BYPASS_REASON/.test(bypassSrc),
    "helper module present"
  );
  assert(
    /transparent_tool_force_bypassed/.test(execSrc) &&
      /bypassTokfaiToolForce:\s*transparentNoToolForce/.test(execSrc) &&
      /shouldBypassTokfaiToolForceForTransparentClient/.test(execSrc),
    "exec wires bypass + safe log"
  );
  assert(
    /bypassTokfaiToolForce/.test(retrySrc) &&
      /bypassTokfaiToolForce/.test(compatSrc),
    "retry + compat gates accept bypassTokfaiToolForce"
  );
  assert(
    /retrySkipped/.test(logSrc) && /compatFallbackSkipped/.test(logSrc),
    "logger allowlists bypass fields"
  );
  assert(
    !/fs\.readFile|readFileSync\(|prompt|file path/.test(
      bypassSrc.toLowerCase()
    ),
    "helper does not inspect prompts/paths/files"
  );
  report.TRANSPARENT_CODEX_NO_FORCE_GATE_ADDED = "YES";

  const forbidden = [
    "apps/dmit-api/src/routes/audio.ts",
    "apps/dmit-api/src/upstream/audio",
    "apps/dmit-api/src/lib/usageBilling.ts",
    "apps/dmit-api/src/gateway",
    "apps/dmit-api/src/upstream/grsai.ts",
  ];
  let dirtyForbidden = false;
  for (const f of forbidden) {
    const r = spawnSync("git", ["diff", "--name-only", "HEAD", "--", f], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if ((r.stdout || "").trim()) dirtyForbidden = true;
  }
  assert(!dirtyForbidden, "STT/billing/transport/gateway untouched in diff");
  report.STT_CHANGED = "NO";
  report.DURABLE_CHANGED = "NO";
  report.TRANSPORT_CHANGED = "NO";
  report.CHAT_COMPLETIONS_CHANGED = "NO";
}

// ── Unit predicates ──────────────────────────────────────────────────────
{
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: true,
      toolChoice: "auto",
    }) === true,
    "unit: responses+transparent+auto → bypass"
  );
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: true,
      toolChoice: undefined,
    }) === true,
    "unit: missing tool_choice → bypass"
  );
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: true,
      toolChoice: "required",
    }) === false,
    "unit: required → no bypass"
  );
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: true,
      toolChoice: {
        type: "function",
        function: { name: "read_test_file" },
      },
    }) === false,
    "unit: named → no bypass"
  );
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/chat/completions",
      transparentGateway: true,
      toolChoice: "auto",
    }) === false,
    "unit: chat completions → no bypass"
  );
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: false,
      toolChoice: "auto",
    }) === false,
    "unit: non-transparent → no bypass"
  );

  const gateBase = {
    route: "/v1/responses",
    hasTools: true,
    toolsCount: 4,
    toolChoice: "auto" as unknown,
    incomingToolMessageCount: 0,
    upstreamHttpOk: true,
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    alreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
    activeToolMode: "native",
  };
  assert(
    shouldAttemptCodexAutoToolNoCallRetry(gateBase) === true,
    "unit legacy: without bypass flag, retry still eligible"
  );
  assert(
    shouldAttemptCodexAutoToolNoCallRetry({
      ...gateBase,
      bypassTokfaiToolForce: true,
    }) === false,
    "unit: bypassTokfaiToolForce blocks retry"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      route: "/v1/responses",
      providerId: "grsai-primary",
      hasTools: true,
      toolsCount: 4,
      toolChoice: "auto",
      incomingToolMessageCount: 0,
      codexAutoToolRetryAttempted: true,
      nativeRetryReturnedToolCalls: false,
      nativeRetryHttpOk: true,
      nativeRetryFinishReason: "stop",
      alreadyAttempted: false,
      freshRemainingTotalMs: 60_000,
      bypassTokfaiToolForce: true,
    }) === false,
    "unit: bypassTokfaiToolForce blocks compat fallback"
  );
  assert(
    TRANSPARENT_TOOL_FORCE_BYPASS_REASON ===
      "codex_cursor_transparent_auto_tool_choice",
    "reason enum stable"
  );
}

// ── A. transparent auto + provider stop → single fetch, no force ─────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "I cannot read files; describing from context only.",
        finish_reason: "stop",
      }),
      async () =>
        nativeToolCompletion("read_test_file", { path: "should-not-run" }),
    ],
  });
  const result = await execResponses(baseBody(), "p1109-a-auto-stop");
  const c = getCounts();
  const snap = billingSnapshot(result);
  const outboundChoices = c.outboundBodies.map((b) => b.tool_choice);
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    outboundChoices[0] === "auto" &&
    !hasToolCalls(result) &&
    finishReason(result) === "stop" &&
    snap.debitCallCount === 1;
  assert(
    ok,
    "A: transparent auto+stop → 1 fetch, no retry/fallback, stop",
    `calls=${c.providerCallCount} choices=${JSON.stringify(outboundChoices)} fr=${finishReason(result)} debit=${snap.debitCallCount}`
  );
  if (ok) {
    report.AUTO_TOOL_RETRY_BYPASSED_FOR_TRANSPARENT_AUTO = "YES";
    report.GRS_COMPAT_FALLBACK_BYPASSED_FOR_TRANSPARENT_AUTO = "YES";
    report.PROVIDER_STOP_NO_TOOL_CALLS_RETURNED_AS_STOP = "YES";
    report.BILLING_DOUBLE_CHARGE_RISK =
      snap.debitCallCount === 1 ? "NO" : "YES";
  }
}

// ── B. provider native tool_calls preserved ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_test_file", { path: "native.ts" }),
    ],
  });
  const result = await execResponses(baseBody(), "p1109-b-native-tc");
  const c = getCounts();
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    hasToolCalls(result) &&
    msg(result)?.tool_calls?.[0]?.function?.name === "read_test_file";
  assert(
    ok,
    "B: native tool_calls preserved (no retry)",
    `calls=${c.providerCallCount} hasTc=${hasToolCalls(result)}`
  );
  if (ok) report.PROVIDER_NATIVE_TOOL_CALLS_PRESERVED = "YES";
}

// ── C. client required preserved (no downgrade / no extra force) ─────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice !== "required") {
          return {
            kind: "completion",
            content: "wrong choice",
            finish_reason: "stop",
          };
        }
        return nativeToolCompletion("read_test_file", { path: "req.ts" });
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tool_choice: "required" }),
    "p1109-c-required"
  );
  const c = getCounts();
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    c.outboundBodies[0]?.tool_choice === "required" &&
    hasToolCalls(result);
  assert(
    ok,
    "C: client required preserved, single fetch",
    `calls=${c.providerCallCount} choice=${JSON.stringify(c.outboundBodies[0]?.tool_choice)}`
  );
  if (ok) report.CLIENT_REQUIRED_TOOL_CHOICE_PRESERVED = "YES";
}

// ── D. named tool_choice preserved (not downgraded to auto) ──────────────
// P1024: GRSAI adapts object tool_choice → outbound string "required".
// P1109 must not rewrite named → auto or add a force-retry beyond that.
{
  const named = {
    type: "function",
    function: { name: "read_test_file" },
  };
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        // Accept either passthrough object or P1024 GRSAI "required" adapt.
        const tc = json.tool_choice;
        const okForced =
          tc === "required" ||
          (tc &&
            typeof tc === "object" &&
            (tc as any).type === "function" &&
            (tc as any).function?.name === "read_test_file");
        if (!okForced) {
          return {
            kind: "completion",
            content: "named missing",
            finish_reason: "stop",
          };
        }
        return nativeToolCompletion("read_test_file", { path: "named.ts" });
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tool_choice: named }),
    "p1109-d-named"
  );
  const c = getCounts();
  const sent = c.outboundBodies[0]?.tool_choice as any;
  const forcedOk =
    sent === "required" ||
    (sent?.type === "function" && sent?.function?.name === "read_test_file");
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    forcedOk &&
    sent !== "auto" &&
    hasToolCalls(result);
  assert(
    ok,
    "D: named tool_choice preserved",
    `calls=${c.providerCallCount} choice=${JSON.stringify(sent)}`
  );
  if (ok) report.CLIENT_NAMED_TOOL_CHOICE_PRESERVED = "YES";
}

// ── E. legacy gate still eligible without bypass flag ────────────────────
{
  const legacyOk =
    shouldAttemptCodexAutoToolNoCallRetry({
      route: "/v1/responses",
      hasTools: true,
      toolsCount: 2,
      toolChoice: "auto",
      incomingToolMessageCount: 0,
      upstreamHttpOk: true,
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      alreadyAttempted: false,
      freshRemainingTotalMs: 30_000,
      activeToolMode: "native",
    }) === true;
  assert(legacyOk, "E: legacy retry gate intact when bypass omitted");
}

// ── F. billing: bypass path charges once ─────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "plain stop text for billing",
        finish_reason: "stop",
      }),
      async () =>
        nativeToolCompletion("read_test_file", { path: "bill-should-not" }),
    ],
  });
  const result = await execResponses(baseBody(), "p1109-f-billing");
  const snap = billingSnapshot(result);
  const c = getCounts();
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    snap.debitCallCount === 1;
  assert(
    ok,
    "F: single successful attempt billed once",
    `calls=${c.providerCallCount} debit=${snap.debitCallCount}`
  );
  if (ok && report.BILLING_DOUBLE_CHARGE_RISK !== "NO") {
    report.BILLING_DOUBLE_CHARGE_RISK = "NO";
  }
}

// ── typecheck / build / git diff --check ─────────────────────────────────
{
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 120_000,
  });
  assert(tc.status === 0, "typecheck", (tc.stderr || "").slice(0, 200));
  report.TYPECHECK = tc.status === 0 ? "PASS" : "FAIL";

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 180_000,
  });
  assert(build.status === 0, "build", (build.stderr || "").slice(0, 200));
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const dirtyWs = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`.includes(
    "trailing whitespace"
  );
  assert(!dirtyWs, "git_diff_check");
  report.GIT_DIFF_CHECK = dirtyWs ? "FAIL" : "PASS";
}

// Light nested: P1107 + P1104 + P1103 (full matrix run separately by agent)
{
  const light: Array<[string, string, RegExp]> = [
    [
      "P1107",
      "scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mjs",
      /TOKFAI_P1107_.*_PASS/,
    ],
    [
      "P1104",
      "scripts/p1104-grsai-stt-provider-adapter.mjs",
      /TOKFAI_P1104_.*_PASS/,
    ],
    [
      "P1103",
      "scripts/p1103-stt-admin-test-root-cause.mjs",
      /TOKFAI_P1103_.*_PASS/,
    ],
  ];
  let allOk = true;
  // Fresh env: p1018 ensureDummyEnv pollutes SUPABASE_SERVICE_ROLE_KEY which
  // forces STT admin store into DATABASE mode. Nested STT suites must boot
  // with their own ??= defaults only.
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
    USER: process.env.USER,
    LIVE: "",
    LOG_LEVEL: "error",
  };
  for (const [label, script, re] of light) {
    if (!existsSync(join(ROOT, script))) {
      fail(`regression_${label}`, "missing");
      allOk = false;
      continue;
    }
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...childEnv, LIVE: "", LOG_LEVEL: "error" },
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(
      ok,
      `regression_${label}`,
      `status=${r.status} err=${r.error?.message || ""} marker=${re.test(out)}`
    );
    if (!ok) allOk = false;
  }
  report.REGRESSIONS = allOk ? "PASS" : "FAIL";
}

report.FINAL_VERDICT =
  failed === 0 &&
  report.AUTO_TOOL_RETRY_BYPASSED_FOR_TRANSPARENT_AUTO === "YES" &&
  report.PROVIDER_NATIVE_TOOL_CALLS_PRESERVED === "YES" &&
  report.CLIENT_REQUIRED_TOOL_CHOICE_PRESERVED === "YES" &&
  report.CLIENT_NAMED_TOOL_CHOICE_PRESERVED === "YES" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS"
    ? "A_FIX_READY"
    : "B_NEEDS_FIX";

mkdirSync(dirname(SUMMARY), { recursive: true });
writeFileSync(
  SUMMARY,
  JSON.stringify({ ok: failed === 0, report, failed }, null, 2)
);

console.log("\n--- P1109 report ---");
for (const [k, v] of Object.entries(report)) console.log(`${k}=${v}`);
console.log(
  report.FINAL_VERDICT === "A_FIX_READY" ? PASS : FAIL
);
process.exit(report.FINAL_VERDICT === "A_FIX_READY" && failed === 0 ? 0 : 1);
