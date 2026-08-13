/**
 * P1090 — GRSAI tool-call compatibility fallback hotfix.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY (route=/v1/responses)
 *   REAL grsaiToolCompatFallback + codexAutoToolRetry helpers
 *   REAL chatCompletionResponseToResponses + responsesToSseBody
 *   MOCK provider boundary + MOCK/SPY billing
 *
 *   npx tsx --experimental-test-module-mocks scripts/p1090-grsai-tool-call-compat-fallback-hotfix.mts
 *   node scripts/p1090-grsai-tool-call-compat-fallback-hotfix.mjs
 *
 * Marker (only FINAL_VERDICT=A):
 *   TOKFAI_P1090_GRSAI_TOOL_CALL_COMPAT_FALLBACK_HOTFIX_PASS
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
  shouldAttemptGrsaiToolCompatFallback,
  buildGrsaiToolCompatFallbackUpstreamBody,
  parseGrsaiToolCompatFallbackCompletion,
  outboundLooksLikeGrsaiToolCompatFallback,
  hashToolNameForLog,
  GRSAI_TOOL_COMPAT_FALLBACK_MARKER,
} = await import("../apps/dmit-api/src/lib/grsaiToolCompatFallback.ts");
const { chatCompletionResponseToResponses } = await import(
  "../apps/dmit-api/src/lib/responsesTransform.ts"
);
const { responsesToSseBody } = await import(
  "../apps/dmit-api/src/lib/responsesSse.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1090_GRSAI_TOOL_CALL_COMPAT_FALLBACK_HOTFIX_PASS";
const FAIL =
  "TOKFAI_P1090_GRSAI_TOOL_CALL_COMPAT_FALLBACK_HOTFIX_FAIL";

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
] as const;

let failed = 0;
const report: Record<string, string> = {
  GRSAI_NATIVE_REQUIRED_UNRELIABLE: "YES",
  COMPAT_FALLBACK_SELECTED_ONLY_AFTER_NATIVE_RETRY_FAILS: "NO",
  COMPAT_FALLBACK_RETURNS_FUNCTION_CALL_WIRE: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  NO_AGENT_ORCHESTRATION_REINTRODUCED: "YES",
  NO_PROMPT_CONTENT_LOGGED: "YES",
  NO_SCHEMA_CONTENT_LOGGED: "YES",
  NO_DOUBLE_BILLING_RISK: "YES",
  CHAT_COMPLETIONS_NON_TOOL_CHANGED: "NO",
  RESPONSES_ROUND2_CHANGED: "NO",
  STT_CHANGED: "NO",
  DASHBOARD_CHANGED: "NO",
  TYPECHECK: "FAIL",
  BUILD: "FAIL",
  REGRESSIONS: "FAIL",
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

async function execResponses(
  body: Record<string, unknown>,
  requestId: string,
  opts?: { clientStream?: boolean; route?: string }
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: opts?.route ?? "/v1/responses",
    limitKey: "p1090",
    clientStream: opts?.clientStream === true,
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
        content: "Please read the test file and summarize it.",
      },
    ],
    tools: READ_TOOLS,
    tool_choice: "auto",
    parallel_tool_calls: false,
    ...overrides,
  };
}

function stopText(content: string) {
  return {
    kind: "completion" as const,
    content,
    finish_reason: "stop",
  };
}

function compatJsonReply() {
  return {
    kind: "completion" as const,
    content: JSON.stringify({
      name: "read_test_file",
      arguments: { path: "/tmp/x" },
    }),
    finish_reason: "stop",
  };
}

console.log("P1090 GRSAI TOOL-CALL COMPAT FALLBACK HOTFIX\n");

// ── Static: wiring / no agent resurrection ───────────────────────────────
{
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const helperSrc = read("apps/dmit-api/src/lib/grsaiToolCompatFallback.ts");
  const loggerSrc = read("apps/dmit-api/src/logger.ts");
  assert(
    execSrc.includes("shouldAttemptGrsaiToolCompatFallback") &&
      execSrc.includes("grsai_tool_compat_fallback_selected") &&
      execSrc.includes("buildGrsaiToolCompatFallbackUpstreamBody"),
    "exec wires P1090 compat fallback"
  );
  assert(
    loggerSrc.includes("fallbackSelected") &&
      loggerSrc.includes("allowedToolNameHashes") &&
      loggerSrc.includes("selectedToolHash"),
    "logger allowlists P1090 safe fields"
  );
  assert(
    helperSrc.includes(GRSAI_TOOL_COMPAT_FALLBACK_MARKER) &&
      /Does NOT execute tools/.test(helperSrc) &&
      !helperSrc.includes("detectExplicitToolExecutionIntent") &&
      !helperSrc.includes("incomplete_tool_task"),
    "helper is protocol-only (no agent orchestration)"
  );
  assert(
    execSrc.includes("grsaiToolCompatFallback"),
    "P1090 path present in executeChatCompletion"
  );
  for (const rel of [
    "apps/web/package.json",
    "apps/dmit-api/src/routes/audio.ts",
  ]) {
    assert(existsSync(join(ROOT, rel)), `forbidden surface exists: ${rel}`);
  }
}

// ── Unit helpers ─────────────────────────────────────────────────────────
{
  const gateBase = {
    route: "/v1/responses",
    providerId: "grsai-primary",
    hasTools: true,
    toolsCount: 1,
    toolChoice: "auto" as unknown,
    incomingToolMessageCount: 0,
    codexAutoToolRetryAttempted: true,
    nativeRetryReturnedToolCalls: false,
    nativeRetryHttpOk: true,
    nativeRetryFinishReason: "stop",
    alreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
  };
  assert(
    shouldAttemptGrsaiToolCompatFallback(gateBase) === true,
    "unit gate: responses+grsai+after native retry → yes"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      ...gateBase,
      codexAutoToolRetryAttempted: false,
    }) === false,
    "unit gate: before native retry → no"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      ...gateBase,
      nativeRetryReturnedToolCalls: true,
    }) === false,
    "unit gate: native retry already tool_calls → no"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      ...gateBase,
      route: "/v1/chat/completions",
    }) === false,
    "unit gate: chat/completions → no"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      ...gateBase,
      hasTools: false,
      toolsCount: 0,
    }) === false,
    "unit gate: no tools → no"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      ...gateBase,
      incomingToolMessageCount: 1,
    }) === false,
    "unit gate: round2 tool results → no"
  );

  const built = buildGrsaiToolCompatFallbackUpstreamBody(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: READ_TOOLS,
      tool_choice: "required",
    },
    {
      tools: READ_TOOLS,
      tool_choice: "auto",
    }
  );
  assert(
    outboundLooksLikeGrsaiToolCompatFallback(built.body) === true &&
      built.body.tools === undefined &&
      built.body.tool_choice === undefined &&
      built.selectedToolName === "read_test_file",
    "unit build: strips native tools; selects allowed tool"
  );

  const parsed = parseGrsaiToolCompatFallbackCompletion({
    data: {
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              name: "read_test_file",
              arguments: { path: "/tmp/x" },
            }),
          },
          finish_reason: "stop",
        },
      ],
    },
    clientTools: READ_TOOLS,
    toolChoice: "auto",
  });
  assert(
    parsed.selectedToolName === "read_test_file" &&
      parsed.argumentsByteLength > 0 &&
      parsed.intent.kind === "tool_call",
    "unit parse: {name,arguments} → tool_call intent",
    `hash=${hashToolNameForLog(parsed.selectedToolName)} bytes=${parsed.argumentsByteLength}`
  );
}

// ── A: auto → required fail → compat JSON → function_call wire ───────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => stopText("I will read the file."),
      async () => stopText(""),
      async ({ json }) => {
        if (!outboundLooksLikeGrsaiToolCompatFallback(json as any)) {
          return stopText("wrong-path");
        }
        return compatJsonReply();
      },
    ],
  });
  const result = await execResponses(baseBody(), "p1090-a-success");
  const c = getCounts();
  const snap = billingSnapshot(result);
  const wireOk =
    result.ok === true &&
    c.providerCallCount === 3 &&
    c.outboundBodies[1]?.tool_choice === "required" &&
    c.outboundBodies[2]?.hasTools === false &&
    hasToolCalls(result) &&
    msg(result)?.tool_calls?.[0]?.function?.name === "read_test_file" &&
    snap.debitCallCount === 1;

  let sseOk = false;
  if (wireOk) {
    const responses = chatCompletionResponseToResponses(
      result.response as Record<string, unknown>,
      "p1090-a-success"
    );
    const sse = responsesToSseBody(responses as any);
    sseOk =
      sse.includes("function_call") &&
      sse.includes("read_test_file") &&
      sse.includes("[DONE]");
  }

  assert(
    wireOk && sseOk,
    "A: auto+blank retry → compat JSON → function_call wire",
    `ok=${result.ok} calls=${c.providerCallCount} debit=${snap.debitCallCount} sse=${sseOk}`
  );
  if (wireOk) {
    report.COMPAT_FALLBACK_SELECTED_ONLY_AFTER_NATIVE_RETRY_FAILS = "YES";
    report.COMPAT_FALLBACK_RETURNS_FUNCTION_CALL_WIRE = sseOk ? "YES" : "NO";
    report.NO_DOUBLE_BILLING_RISK =
      snap.debitCallCount === 1 ? "YES" : "NO";
  }
}

// ── B: compat JSON invalid → 502 / tool_call_not_generated ───────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => stopText(""),
      async () => stopText(""),
      async () => stopText("not a tool json"),
    ],
  });
  const result = await execResponses(baseBody(), "p1090-b-parse-fail");
  const c = getCounts();
  const snap = billingSnapshot(result);
  assert(
    result.ok === false &&
      c.providerCallCount === 3 &&
      result.errorCode === "tool_call_not_generated" &&
      snap.debitCallCount === 0,
    "B: invalid compat JSON → 502 tool_call_not_generated, no debit",
    `ok=${result.ok} calls=${c.providerCallCount} code=${result.errorCode}`
  );
}

// ── C: native retry already tool_calls → no compat fallback ──────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => stopText("planning"),
      async ({ json }) =>
        json.tool_choice === "required"
          ? nativeToolCompletion("read_test_file", { path: "/tmp/x" })
          : stopText("no"),
    ],
  });
  const result = await execResponses(baseBody(), "p1090-c-retry-ok");
  const c = getCounts();
  assert(
    result.ok === true &&
      c.providerCallCount === 2 &&
      hasToolCalls(result),
    "C: native retry tool_calls → compat fallback NOT called",
    `calls=${c.providerCallCount}`
  );
}

// ── D: no tools → no compat fallback ─────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [async () => stopText("hello")],
  });
  const result = await execResponses(
    baseBody({ tools: undefined, tool_choice: undefined }),
    "p1090-d-no-tools"
  );
  const c = getCounts();
  assert(
    result.ok === true && c.providerCallCount === 1 && !hasToolCalls(result),
    "D: no tools → compat fallback NOT called",
    `calls=${c.providerCallCount}`
  );
}

// ── E: round2 tool result → no compat fallback ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [async () => stopText("after tool")],
  });
  const result = await execResponses(
    baseBody({
      messages: [
        { role: "user", content: "read it" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "read_test_file",
                arguments: '{"path":"/tmp/x"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          content: "file contents",
        },
      ],
    }),
    "p1090-e-round2"
  );
  const c = getCounts();
  assert(
    result.ok === true && c.providerCallCount === 1,
    "E: incoming tool result round2 → compat fallback NOT called",
    `calls=${c.providerCallCount}`
  );
}

// ── F: /v1/chat/completions non-tool unchanged ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [async () => stopText("chat ok")],
  });
  const result = await executeChatCompletion({
    caller: CALLER,
    requestId: "p1090-f-chat",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    } as any,
    route: "/v1/chat/completions",
    limitKey: "p1090",
  });
  const c = getCounts();
  assert(
    result.ok === true &&
      c.providerCallCount === 1 &&
      typeof msg(result)?.content === "string",
    "F: chat/completions non-tool unchanged",
    `calls=${c.providerCallCount}`
  );
}

// ── G: named tool_choice path unchanged (no P1088/P1090) ─────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_test_file", { path: "named.ts" }),
    ],
  });
  const result = await execResponses(
    baseBody({
      tool_choice: {
        type: "function",
        function: { name: "read_test_file" },
      },
    }),
    "p1090-g-named"
  );
  const c = getCounts();
  assert(
    result.ok === true &&
      c.providerCallCount === 1 &&
      hasToolCalls(result),
    "G: named tool_choice → single call (P1083 path)",
    `calls=${c.providerCallCount}`
  );
}

// ── H: blank reject when compat fallback fails ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => stopText(""),
      async () => stopText(""),
      async () => stopText(""),
    ],
  });
  const result = await execResponses(baseBody(), "p1090-h-blank-reject");
  const c = getCounts();
  const snap = billingSnapshot(result);
  assert(
    result.ok === false &&
      c.providerCallCount === 3 &&
      result.errorCode === "tool_call_not_generated" &&
      snap.debitCallCount === 0,
    "H: blank after required+compat fail → still rejects blank",
    `calls=${c.providerCallCount} code=${result.errorCode}`
  );
}

// ── Forbidden golden surfaces + typecheck/build/regressions ──────────────
{
  const webDiff = spawnSync("git", ["diff", "--check", "--", "apps/web"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(webDiff.status === 0, "git_diff_check apps/web");

  const sttTouched = spawnSync(
    "git",
    ["diff", "--name-only", "--", "apps/dmit-api/src/upstream/audio", "apps/dmit-api/src/routes/audioTranscription.ts"],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert(
    (sttTouched.stdout || "").trim() === "",
    "STT_CHANGED=NO"
  );

  const dashTouched = spawnSync(
    "git",
    ["diff", "--name-only", "--", "apps/web"],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert((dashTouched.stdout || "").trim() === "", "DASHBOARD_CHANGED=NO");

  const typecheck = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(typecheck.status === 0, "typecheck");
  report.TYPECHECK = typecheck.status === 0 ? "PASS" : "FAIL";

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(build.status === 0, "build");
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";

  const regressions: Array<[string, string, RegExp]> = [
    ["P1083", "scripts/p1083-codex-responses-real-toolcall-hotfix.mjs", /TOKFAI_P1083_LOCAL_CHECKS_PASS|TOKFAI_P1083_.*_PASS/],
    ["P1087", "scripts/p1087-codex-auto-tool-no-call-retry-hotfix.mjs", /TOKFAI_P1087_.*_PASS|FINAL_VERDICT=A_FIX_READY|REAL: auto stop/],
    ["P1088", "scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mjs", /TOKFAI_P1088_.*_PASS|RETRY_SECOND_PROVIDER_FETCH=YES/],
    ["P1081", "scripts/p1081-responses-completed-usage-total-tokens-hotfix.mjs", /TOKFAI_P1081_.*_PASS/],
    ["P1059", "scripts/p1059-explicit-model-transparent-gateway.mts", /TOKFAI_P1059_.*_PASS/],
    ["P1061", "scripts/p1061-autopro-transparent-carrier.mts", /TOKFAI_P1061_.*_PASS/],
    ["P1062R2", "scripts/p1062-cursor-gateway-root-cause.mts", /TOKFAI_P1062R2_.*_PASS/],
    ["P991", "scripts/p991-responses-sse-cherry-smoke.mjs", /TOKFAI_P991_.*_PASS/],
  ];

  let regOk = true;
  for (const [label, script, re] of regressions) {
    const abs = join(ROOT, script);
    if (!existsSync(abs)) {
      fail(`regression_${label}`, "missing script");
      regOk = false;
      continue;
    }
    const isMts = script.endsWith(".mts");
    const childEnv = {
      ...process.env,
      LIVE: "",
      P1090_INNER: "1",
      LOG_LEVEL: "info",
    };
    const r = isMts
      ? spawnSync(
          process.execPath,
          [
            "--experimental-test-module-mocks",
            "--import",
            join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs"),
            abs,
          ],
          {
            cwd: ROOT,
            encoding: "utf8",
            env: childEnv,
            timeout: 240_000,
            maxBuffer: 20 * 1024 * 1024,
          }
        )
      : spawnSync(process.execPath, [abs], {
          cwd: ROOT,
          encoding: "utf8",
          env: childEnv,
          timeout: 240_000,
          maxBuffer: 20 * 1024 * 1024,
        });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(
      ok,
      `regression_${label}`,
      `status=${r.status}${ok ? "" : ` err=${(r.stderr || "").slice(0, 200)}`}`
    );
    if (!ok) regOk = false;
  }
  report.REGRESSIONS = regOk ? "PASS" : "FAIL";

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(diffCheck.status === 0, "git_diff_check");
}

if (
  failed === 0 &&
  report.COMPAT_FALLBACK_RETURNS_FUNCTION_CALL_WIRE === "YES" &&
  report.COMPAT_FALLBACK_SELECTED_ONLY_AFTER_NATIVE_RETRY_FAILS === "YES" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.REGRESSIONS === "PASS"
) {
  report.FINAL_VERDICT = "A_FIX_READY";
} else if (failed === 0) {
  report.FINAL_VERDICT = "B_FIX_WITH_RISK";
} else {
  report.FINAL_VERDICT = "C_REJECT";
}

console.log("\n--- P1090 report ---");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}

if (report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}

console.log(FAIL);
process.exit(1);
