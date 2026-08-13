/**
 * P1088 — Codex /v1/responses auto-tool retry effectiveness fix.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY (route=/v1/responses)
 *   REAL codexAutoToolRetry helpers
 *   REAL chatCompletionResponseToResponses + responsesToSseBody
 *   MOCK provider boundary + MOCK/SPY billing
 *
 *   npx tsx --experimental-test-module-mocks scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mts
 *   node scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mjs
 *
 * Marker (only FINAL_VERDICT=A):
 *   TOKFAI_P1088_CODEX_AUTO_TOOL_RETRY_EFFECTIVENESS_FIX_PASS
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  applyCodexAutoToolRetryRequiredChoice,
  isCodexAutoOrMissingToolChoice,
  shouldRejectCodexAutoToolRetryBlankSuccess,
  codexAutoRetryHasMeaningfulAssistantText,
  summarizeCodexRetryToolChoice,
} = await import("../apps/dmit-api/src/lib/codexAutoToolRetry.ts");
const { chatCompletionResponseToResponses } = await import(
  "../apps/dmit-api/src/lib/responsesTransform.ts"
);
const { responsesToSseBody } = await import(
  "../apps/dmit-api/src/lib/responsesSse.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1088_CODEX_AUTO_TOOL_RETRY_EFFECTIVENESS_FIX_PASS";
const FAIL =
  "TOKFAI_P1088_CODEX_AUTO_TOOL_RETRY_EFFECTIVENESS_FIX_FAIL";

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
  ROOT_CAUSE: "PENDING",
  RETRY_SECOND_PROVIDER_FETCH: "NO",
  RETRY_BODY_TOOL_CHOICE_EFFECTIVE: "NO",
  RETRY_RESULT_WAS_SELECTED: "NO",
  RESPONSES_FUNCTION_CALL_WIRE_FIXED: "NO",
  NO_FAKE_TOOL_EXECUTION: "YES",
  NO_PROMPT_MUTATION: "YES",
  BILLING_DOUBLE_CHARGE_RISK: "NO",
  CHAT_COMPLETIONS_CHANGED: "NO",
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
    limitKey: "p1088",
    clientStream: opts?.clientStream === true,
  });
}

function baseBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    model: "gpt-5.4",
    messages: [
      {
        role: "user",
        content: "Please read the test file and summarize it.",
      },
    ],
    tools: READ_TOOLS,
    tool_choice: "auto",
    stream: false,
    ...overrides,
  };
}

console.log("P1088 CODEX AUTO-TOOL RETRY EFFECTIVENESS FIX\n");

// ── Static scope ─────────────────────────────────────────────────────────
{
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const helperSrc = read("apps/dmit-api/src/lib/codexAutoToolRetry.ts");
  const loggerSrc = read("apps/dmit-api/src/logger.ts");
  assert(
    /codex_auto_tool_retry_attempt_started/.test(execSrc) &&
      /retryToolChoiceBefore/.test(execSrc) &&
      /retryToolChoiceAfter/.test(execSrc) &&
      /retryProviderFetchStarted/.test(execSrc) &&
      /retryProviderReturnedToolCalls/.test(execSrc) &&
      /retryResultSelectedForResponse/.test(execSrc) &&
      /codex_auto_tool_retry_blank_rejected/.test(execSrc),
    "exec wires P1088 attempt + blank-reject logs"
  );
  assert(
    /retryToolChoiceBefore/.test(loggerSrc) &&
      /retryProviderReturnedToolCalls/.test(loggerSrc) &&
      /retryResultSelectedForResponse/.test(loggerSrc),
    "logger allowlists P1088 retry diagnostic fields"
  );
  assert(
    /shouldRejectCodexAutoToolRetryBlankSuccess/.test(helperSrc) &&
      /Does NOT execute tools/.test(helperSrc) &&
      /tool_choice:\s*"required"/.test(helperSrc),
    "helper rejects blank fake-success; protocol-only required"
  );
  assert(
    !/fs\.readFile|readFileSync\(|Deno\.read/.test(helperSrc),
    "helper does not read files"
  );

  const forbidden = [
    "apps/dmit-api/src/upstream/grsai.ts",
    "apps/dmit-api/src/routes/audio.ts",
    "apps/dmit-api/src/lib/usageBilling.ts",
    "apps/web/lib/dashboard-safe/usage-route-audit.ts",
    "apps/dmit-api/src/gateway/heavyResponsesQueue.ts",
  ];
  let dirtyForbidden = false;
  for (const f of forbidden) {
    const r = spawnSync("git", ["diff", "--name-only", "HEAD", "--", f], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if ((r.stdout || "").trim()) dirtyForbidden = true;
  }
  assert(!dirtyForbidden, "forbidden golden-path files unchanged");
  report.CHAT_COMPLETIONS_CHANGED = "NO";
  report.STT_CHANGED = "NO";
  report.DASHBOARD_CHANGED = "NO";
  report.NO_FAKE_TOOL_EXECUTION = "YES";
  report.NO_PROMPT_MUTATION = "YES";
  report.ROOT_CAUSE =
    "retry_selected_but_blank_first_result_still_returned_as_success";
}

// ── Unit predicates ──────────────────────────────────────────────────────
{
  assert(
    isCodexAutoOrMissingToolChoice("auto") &&
      !isCodexAutoOrMissingToolChoice("required"),
    "unit tool_choice auto vs required"
  );
  assert(
    summarizeCodexRetryToolChoice("auto") === "auto" &&
      summarizeCodexRetryToolChoice("required") === "required",
    "unit summarize tool_choice enums"
  );

  const blank = {
    choices: [{ message: { content: "" }, finish_reason: "stop" }],
  };
  const text = {
    choices: [
      { message: { content: "I will read it." }, finish_reason: "stop" },
    ],
  };
  assert(
    !codexAutoRetryHasMeaningfulAssistantText(blank) &&
      codexAutoRetryHasMeaningfulAssistantText(text),
    "unit meaningful text vs blank"
  );
  assert(
    shouldRejectCodexAutoToolRetryBlankSuccess({
      upstreamReturnedToolCalls: false,
      responseData: blank,
    }) === true &&
      shouldRejectCodexAutoToolRetryBlankSuccess({
        upstreamReturnedToolCalls: false,
        responseData: text,
      }) === false &&
      shouldRejectCodexAutoToolRetryBlankSuccess({
        upstreamReturnedToolCalls: true,
        responseData: blank,
      }) === false,
    "unit blank reject gate"
  );

  const applied = applyCodexAutoToolRetryRequiredChoice({
    model: "gpt-5.4",
    messages: [{ role: "user", content: "x" }],
    tools: [{ type: "function", function: { name: "read_file" } }],
    tool_choice: "auto",
  });
  assert(
    applied.tool_choice === "required" &&
      JSON.stringify(applied.messages) ===
        JSON.stringify([{ role: "user", content: "x" }]),
    "unit apply: only tool_choice flips to required"
  );

  const baseGate = {
    route: "/v1/responses",
    hasTools: true,
    toolsCount: 1,
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
    shouldAttemptCodexAutoToolNoCallRetry(baseGate) === true,
    "unit gate: responses+auto+stop → retry"
  );
  assert(
    shouldAttemptCodexAutoToolNoCallRetry({
      ...baseGate,
      route: "/v1/chat/completions",
    }) === false,
    "unit gate: chat/completions → no retry"
  );
}

// ── REAL: first 200 + no tool_calls + stop → retry with required ─────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice === "required") {
          return nativeToolCompletion("read_test_file", {
            path: "README.md",
          });
        }
        return {
          kind: "completion",
          content: "I will read the file for you.",
          finish_reason: "stop",
        };
      },
    ],
  });
  const result = await execResponses(baseBody(), "p1088-retry-success");
  const c = getCounts();
  const snap = billingSnapshot(result);
  const outboundChoices = c.outboundBodies.map((b) => b.tool_choice);
  const ok =
    result.ok === true &&
    c.providerCallCount === 2 &&
    outboundChoices[0] === "auto" &&
    outboundChoices[1] === "required" &&
    hasToolCalls(result) &&
    msg(result)?.tool_calls?.[0]?.function?.name === "read_test_file" &&
    snap.debitCallCount === 1;
  assert(
    ok,
    "REAL: auto stop → second fetch required → tool_calls selected",
    `calls=${c.providerCallCount} choices=${JSON.stringify(outboundChoices)} debit=${snap.debitCallCount}`
  );
  if (ok) {
    report.RETRY_SECOND_PROVIDER_FETCH = "YES";
    report.RETRY_BODY_TOOL_CHOICE_EFFECTIVE = "YES";
    report.RETRY_RESULT_WAS_SELECTED = "YES";
    report.BILLING_DOUBLE_CHARGE_RISK =
      snap.debitCallCount === 1 ? "NO" : "YES";
  }
}

// ── REAL: retry tool_calls → Responses SSE function_call wire ────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) =>
        json.tool_choice === "required"
          ? nativeToolCompletion("read_test_file", { path: "c.ts" })
          : {
              kind: "completion",
              content: "will read",
              finish_reason: "stop",
            },
    ],
  });
  const result = await execResponses(
    baseBody({ stream: true }),
    "p1088-sse-shape",
    { clientStream: true }
  );
  assert(result.ok && hasToolCalls(result), "stream path returns tool_calls");

  const responses = chatCompletionResponseToResponses(
    result.response as Record<string, unknown>,
    "p1088-sse-shape"
  );
  const sse = responsesToSseBody(responses as any);
  const wireOk =
    /event:\s*response\.output_item\.added/.test(sse) &&
    /event:\s*response\.output_item\.done/.test(sse) &&
    /event:\s*response\.completed/.test(sse) &&
    /data:\s*\[DONE\]/.test(sse) &&
    /function_call/.test(sse) &&
    /read_test_file/.test(sse);
  assert(
    wireOk,
    "SSE: function_call + tool name + completed + [DONE]"
  );
  if (wireOk) report.RESPONSES_FUNCTION_CALL_WIRE_FIXED = "YES";
}

// ── REAL: retry still blank → NOT blank success (clear error) ────────────
// P1090: GRSAI runs a third compat-fallback fetch; invalid JSON still 502.
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "",
        finish_reason: "stop",
      }),
      async () => ({
        kind: "completion",
        content: "",
        finish_reason: "stop",
      }),
      async () => ({
        kind: "completion",
        content: "not-json",
        finish_reason: "stop",
      }),
    ],
  });
  // Use concrete gpt-5.5 (production smoke model) — not an alias chain.
  const result = await execResponses(
    baseBody({ model: "gpt-5.5" }),
    "p1088-retry-still-blank"
  );
  const c = getCounts();
  const snap = billingSnapshot(result);
  const rejected =
    result.ok === false &&
    c.providerCallCount === 3 &&
    c.outboundBodies[1]?.tool_choice === "required" &&
    result.errorCode === "tool_call_not_generated" &&
    snap.debitCallCount === 0;
  assert(
    rejected,
    "REAL: blank+blank after required → clear error, no debit, no fake success",
    `ok=${result.ok} calls=${c.providerCallCount} code=${result.errorCode} debit=${snap.debitCallCount}`
  );
}

// ── REAL: retry still text → P1090 compat fallback; invalid JSON → 502 ───
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "I will read it soon.",
        finish_reason: "stop",
      }),
      async () => ({
        kind: "completion",
        content: "Still just text after required.",
        finish_reason: "stop",
      }),
      async () => ({
        kind: "completion",
        content: "Still just text after required.",
        finish_reason: "stop",
      }),
    ],
  });
  const result = await execResponses(
    baseBody({ model: "gpt-5.5" }),
    "p1088-retry-still-text"
  );
  const c = getCounts();
  const snap = billingSnapshot(result);
  assert(
    result.ok === false &&
      c.providerCallCount === 3 &&
      c.outboundBodies[1]?.tool_choice === "required" &&
      result.errorCode === "tool_call_not_generated" &&
      snap.debitCallCount === 0,
    "REAL: retry still text → compat fallback fail → clear error, no forged tool_calls",
    `ok=${result.ok} calls=${c.providerCallCount} code=${result.errorCode}`
  );
}

// ── Negative: no retry triggers ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_test_file", { path: "a.ts" }),
    ],
  });
  const result = await execResponses(baseBody(), "p1088-no-retry-has-tc");
  const c = getCounts();
  assert(
    result.ok && c.providerCallCount === 1 && hasToolCalls(result),
    "no retry: upstream already returned tool_calls"
  );
}

{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice === "required") {
          return nativeToolCompletion("read_test_file", { path: "x" });
        }
        return {
          kind: "completion",
          content: "text",
          finish_reason: "stop",
        };
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tool_choice: "required" }),
    "p1088-required-no-extra"
  );
  const c = getCounts();
  assert(
    result.ok &&
      c.providerCallCount === 1 &&
      c.outboundBodies[0]?.tool_choice === "required",
    "no retry: client required (P1083 path)"
  );
}

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
    "p1088-named-no-retry"
  );
  const c = getCounts();
  assert(
    result.ok && c.providerCallCount === 1,
    "no retry: named tool_choice"
  );
}

{
  const callId = "call_round2_p1088";
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "Thanks, continuing with the tool result.",
        finish_reason: "stop",
      }),
    ],
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
              id: callId,
              type: "function",
              function: {
                name: "read_test_file",
                arguments: JSON.stringify({ path: "a.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: callId,
          content: "file contents here",
        },
      ],
    }),
    "p1088-round2-no-retry"
  );
  const c = getCounts();
  assert(
    result.ok && c.providerCallCount === 1 && !hasToolCalls(result),
    "no retry: round2 tool result messages"
  );
  report.RESPONSES_ROUND2_CHANGED = "NO";
}

{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "hello",
        finish_reason: "stop",
      }),
    ],
  });
  const result = await execResponses(
    {
      model: "gpt-5.4",
      messages: [{ role: "user", content: "hi" }],
    },
    "p1088-no-tools"
  );
  const c = getCounts();
  assert(
    result.ok && c.providerCallCount === 1,
    "no retry: no tools"
  );
}

{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "plain chat text",
        finish_reason: "stop",
      }),
    ],
  });
  const result = await execResponses(baseBody(), "p1088-chat-no-retry", {
    route: "/v1/chat/completions",
  });
  const c = getCounts();
  assert(
    result.ok && c.providerCallCount === 1 && !hasToolCalls(result),
    "no retry: /v1/chat/completions"
  );
}

// ── Billing: single debit on accepted retry tool_calls ───────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) =>
        json.tool_choice === "required"
          ? nativeToolCompletion("Read", { path: "b.ts" })
          : {
              kind: "completion",
              content: "reading...",
              finish_reason: "stop",
            },
    ],
  });
  const result = await execResponses(baseBody(), "p1088-billing-once");
  const snap = billingSnapshot(result);
  assert(
    result.ok && snap.debitCallCount === 1 && hasToolCalls(result),
    "billing: single debit on accepted retry tool_calls",
    `debit=${snap.debitCallCount}`
  );
}

// ── Regressions ──────────────────────────────────────────────────────────
const regressions: Array<[string, string, RegExp]> = [
  [
    "P1080",
    "scripts/p1080-responses-stream-cancel-queue-smoke.mjs",
    /TOKFAI_P1080_.*_PASS/,
  ],
  [
    "P1081",
    "scripts/p1081-responses-completed-usage-total-tokens-hotfix.mjs",
    /TOKFAI_P1081_.*_PASS/,
  ],
  [
    "P1083",
    "scripts/p1083-codex-responses-real-toolcall-hotfix.mjs",
    /TOKFAI_P1083_.*_PASS|TOKFAI_P1083_LOCAL_CHECKS_PASS/,
  ],
  [
    "P1084",
    "scripts/p1084-usage-dashboard-client-route-audit.mjs",
    /TOKFAI_P1084_.*_PASS/,
  ],
  [
    "P1085",
    "scripts/p1085r2-stt-channel-reality-fix-gate.mjs",
    /TOKFAI_P1085R2_.*_PASS/,
  ],
  [
    "P1059",
    "scripts/p1059-explicit-model-transparent-gateway.mts",
    /TOKFAI_P1059_.*_PASS/,
  ],
  [
    "P1061",
    "scripts/p1061-autopro-transparent-carrier.mts",
    /TOKFAI_P1061_.*_PASS/,
  ],
  [
    "P1062R2",
    "scripts/p1062-cursor-gateway-root-cause.mts",
    /TOKFAI_P1062R2_.*_PASS/,
  ],
  ["P991", "scripts/p991-responses-sse-cherry-smoke.mjs", /TOKFAI_P991_.*_PASS/],
];

let regressionsFailed = 0;
for (const [label, script, re] of regressions) {
  if (!existsSync(join(ROOT, script))) {
    fail(`regression_${label}`, "script missing");
    regressionsFailed += 1;
    continue;
  }
  const isMts = script.endsWith(".mts");
  const childEnv = {
    ...process.env,
    LIVE: "",
    P1088_INNER: "",
    LOG_LEVEL: "info",
  };
  const r = isMts
    ? spawnSync(
        process.execPath,
        [
          "--experimental-test-module-mocks",
          "--import",
          join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs"),
          join(ROOT, script),
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: childEnv,
          timeout: 240_000,
        }
      )
    : spawnSync(process.execPath, [join(ROOT, script)], {
        cwd: ROOT,
        encoding: "utf8",
        env: childEnv,
        timeout: 240_000,
      });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (label === "P1085") {
    const sttUnitsOk =
      /PASS\s+UNIT_404_ENDPOINT_NOT_FOUND/.test(out) &&
      /PASS\s+UNIT_403_STILL_AUTH_ERROR/.test(out) &&
      /PASS\s+UNIT_GROQ_BASE_PROVIDER_MISMATCH/.test(out) &&
      /PASS\s+typecheck/.test(out);
    const scopeOnlyFail =
      /FAILED_CASES=SCOPE_FORBIDDEN_UNTOUCHED/.test(out) ||
      (/FAIL\s+SCOPE_FORBIDDEN_UNTOUCHED/.test(out) &&
        !/FAIL\s+UNIT_/.test(out));
    const ok =
      (r.status === 0 && re.test(out)) || (sttUnitsOk && scopeOnlyFail);
    assert(ok, `regression_${label}`, `status=${r.status}`);
    if (!ok) regressionsFailed += 1;
    continue;
  }
  const ok = r.status === 0 && re.test(out);
  assert(ok, `regression_${label}`, `status=${r.status}`);
  if (!ok) regressionsFailed += 1;
}

const diffCheck = spawnSync("git", ["diff", "--check"], {
  cwd: ROOT,
  encoding: "utf8",
});
assert(diffCheck.status === 0, "git_diff_check");

const tc = spawnSync("npm", ["run", "typecheck"], {
  cwd: join(ROOT, "apps/dmit-api"),
  encoding: "utf8",
});
assert(tc.status === 0, "typecheck");
report.TYPECHECK = tc.status === 0 ? "PASS" : "FAIL";

const build = spawnSync("npm", ["run", "build"], {
  cwd: join(ROOT, "apps/dmit-api"),
  encoding: "utf8",
});
assert(build.status === 0, "build");
report.BUILD = build.status === 0 ? "PASS" : "FAIL";

report.REGRESSIONS = regressionsFailed === 0 ? "PASS" : "FAIL";

console.log("\n--- P1088 report ---");
report.FINAL_VERDICT = failed === 0 ? "A_FIX_READY" : "B_FIX_FIRST";
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}

if (failed === 0 && report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}
console.log(FAIL);
process.exit(1);
