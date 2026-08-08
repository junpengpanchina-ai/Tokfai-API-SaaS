/**
 * P1048 — Auto/missing explicit tool-intent repair (narrow exception on P1047).
 *
 * Informational prompts stay single-pass. Explicit Search/Read/Write/Terminal
 * execution intent + native plain text → exactly one tool-intent repair.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL detectExplicitToolExecutionIntent / arbitration gates
 *   REAL compileEmulatedUpstreamBody (required override on repair)
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1048-auto-tool-intent-repair.mts
 *
 * Marker: TOKFAI_P1048_AUTO_TOOL_INTENT_REPAIR_PASS
 */

import { fileURLToPath } from "node:url";
import {
  AGENT_FILE_TOOLS,
  CALLER,
  WEATHER_TOOLS,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
  installP1018Mocks,
  loadExecuteChatCompletion,
  makeToolCallIntent,
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  shouldRunToolArbitrationAfterNativeResponse,
  shouldAttemptAutoToolIntentArbitration,
  shouldAttemptResumeToolContinuationArbitration,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const { detectExplicitToolExecutionIntent } = await import(
  "../apps/dmit-api/src/lib/toolIntentCompiler.ts"
);
const {
  validateCursorToolTranscript,
  INVALID_TOOL_CALL_ID_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1048_AUTO_TOOL_INTENT_REPAIR_PASS";
const FAIL = "TOKFAI_P1048_AUTO_TOOL_INTENT_REPAIR_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL toolIntentCompiler detect + REAL gates + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
};
const REPAIR_USAGE = {
  prompt_tokens: 40,
  completion_tokens: 8,
  total_tokens: 48,
};

/** Cursor-like agent tools including Search / Terminal for CASE B. */
const CURSOR_AGENT_TOOLS = [
  ...AGENT_FILE_TOOLS,
  {
    type: "function",
    function: {
      name: "Search",
      description: "Search the codebase",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Terminal",
      description: "Run a shell command",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
] as const;

const EXPLICIT_EXEC_PROMPT =
  "搜索 executeChatCompletion，读取文件并修改它，然后运行测试";
const INFO_PROMPT = "解释一下这个函数";

let failed = 0;
const caseResults: Record<string, string> = {};

function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(JSON.stringify({ level: meta.level ?? LEVEL, ...meta }, null, 2));
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(
  cond: boolean,
  label: string,
  meta: AssertMeta & Record<string, unknown>,
  detail?: string
) {
  if (cond) pass(label, meta);
  else fail(label, detail ?? JSON.stringify(meta));
}

function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1048",
    clientStream: false,
  });
}

function objectChoice(name: string) {
  return { type: "function", function: { name } };
}

function tc(
  id: string,
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function toolMsg(id: string, content: unknown): Record<string, unknown> {
  return {
    role: "tool",
    tool_call_id: id,
    content: typeof content === "string" ? content : JSON.stringify(content),
  };
}

function assistantTools(
  toolCalls: Record<string, unknown>[]
): Record<string, unknown> {
  return { role: "assistant", content: null, tool_calls: toolCalls };
}

function secondPassRepair(meta: {
  providerCallCount: number;
  repairCallCount: number;
  arbitrationCallCount?: number;
}) {
  return (
    meta.providerCallCount === 2 &&
    (meta.repairCallCount >= 1 || (meta.arbitrationCallCount ?? 0) >= 1)
  );
}

console.log("P1048 AUTO TOOL INTENT REPAIR\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit: detect + gates ─────────────────────────────────────────────────
{
  const info = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: INFO_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
  });
  const execIntent = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
  });
  const weatherHi = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: "hi" }],
    tools: WEATHER_TOOLS,
  });

  const autoBase = {
    hasTools: true,
    supportsToolsRequested: true,
    effectiveToolChoice: "auto" as unknown,
    activeToolMode: "native",
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    alreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
    nativeResponseValid: true,
  };

  assert(
    info.detected === false &&
      execIntent.detected === true &&
      weatherHi.detected === false &&
      shouldRunToolArbitrationAfterNativeResponse(autoBase) === false &&
      shouldRunToolArbitrationAfterNativeResponse({
        ...autoBase,
        explicitToolExecutionIntent: true,
      }) === true &&
      shouldAttemptAutoToolIntentArbitration({
        ...autoBase,
        autoIntentArbitrationAttempted: false,
        toolIntentDetected: false,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...autoBase,
        autoIntentArbitrationAttempted: false,
        toolIntentDetected: true,
      }) === true &&
      shouldAttemptAutoToolIntentArbitration({
        ...autoBase,
        autoIntentArbitrationAttempted: false,
        toolIntentDetected: true,
        resumeToolRound: true,
      }) === false &&
      shouldAttemptResumeToolContinuationArbitration({
        hasTools: true,
        supportsToolsRequested: true,
        effectiveToolChoice: "auto",
        activeToolMode: "native",
        upstreamReturnedToolCalls: false,
        finishReason: "stop",
        resumeToolRound: true,
        unmatchedToolCallIdCount: 0,
        duplicateToolResultCount: 0,
        orderViolationCount: 0,
        continuationArbitrationAttempted: false,
        autoIntentArbitrationAttempted: false,
        freshRemainingTotalMs: 60_000,
        upstreamHttpOk: true,
      }) === false,
    "unit.detect + P1047 fast path + P1048 intent exception",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      infoDetected: info.detected,
      execDetected: execIntent.detected,
      matched: execIntent.matchedToolNames,
    }
  );
}

// ── CASE A: informational — no repair ────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "这是函数说明",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "SHOULD_NOT_RUN.ts" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: INFO_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
    },
    "req_p1048_a"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "这是函数说明" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "A. informational + tools + missing — provider=1 repair=0 debit=1",
    { ...meta, provider: 1, repair: 0, debit: 1 }
  );
  caseResults.A = ok ? "PASS" : "FAIL";
}

// ── CASE B: explicit intent + native text → repair once ──────────────────
// P1055: prefers native tool_choice repair; emulated_json remains fallback.
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "I will help without tools",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        const json = ctx.json ?? {};
        const tools = Array.isArray(json.tools) ? json.tools : [];
        const choice = json.tool_choice;
        const named =
          choice &&
          typeof choice === "object" &&
          (choice as { function?: { name?: string } }).function?.name;
        const forcedRequired = choice === "required" && tools.length > 0;
        // P1055 native repair: tools retained + required/named tool_choice.
        if (tools.length > 0 && (forcedRequired || named)) {
          return {
            ...nativeToolCompletion("Search", {
              query: "executeChatCompletion",
            }),
            usage: REPAIR_USAGE,
          };
        }
        const flat = (json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "repair body missing compiler",
            usage: REPAIR_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("Search", {
            query: "executeChatCompletion",
          }),
          usage: REPAIR_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_b"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "B. explicit intent + native text — provider=2 repair=1 debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      arbitration: meta.arbitrationCallCount ?? 0,
      debit: 1,
    }
  );
  caseResults.B = ok ? "PASS" : "FAIL";
}

// ── CASE C: explicit intent + native tool_calls — no repair ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Search", { query: "executeChatCompletion" }),
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "SHOULD_NOT_RUN.ts" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_c"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "C. explicit intent + native tool_calls — provider=1 repair=0 debit=1",
    { ...meta, provider: 1, repair: 0, debit: 1 }
  );
  caseResults.C = ok ? "PASS" : "FAIL";
}

// ── CASE D: resumeToolRound + native final text — no first-turn repair ───
// P1049: all required capabilities must already be complete so final text
// stays single-pass (incomplete gap would open continuation repair).
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "done after tools",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "SHOULD_NOT_RUN.ts" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: EXPLICIT_EXEC_PROMPT },
    assistantTools([
      tc("call_r1_s", "Search", { query: "executeChatCompletion" }),
      tc("call_r1_a", "Read", { path: "a.ts" }),
      tc("call_r1_w", "Write", { path: "a.ts", contents: "x" }),
      tc("call_r1_t", "Terminal", { command: "npm test" }),
    ]),
    toolMsg("call_r1_s", { hits: ["apps/.../executeChatCompletion.ts"] }),
    toolMsg("call_r1_a", { text: "contents of a" }),
    toolMsg("call_r1_w", { ok: true }),
    toolMsg("call_r1_t", { exit: 0 }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_d"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    v.ok === true &&
    v.resumeToolRound === true &&
    msg(result)?.content === "done after tools" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "D. resume final text — provider=1 repair=0 (no first-turn intent arb)",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      provider: 1,
      repair: 0,
      debit: 1,
    }
  );
  caseResults.D = ok ? "PASS" : "FAIL";
}

// ── CASE E: resumeToolRound + native next tool_calls ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Write", {
          path: "b.ts",
          contents: "x",
        }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: EXPLICIT_EXEC_PROMPT },
    assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
    toolMsg("call_r1_a", { text: "contents of a" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_e"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    v.resumeToolRound === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "E. resume + native next tool_calls — provider=1 repair=0",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      provider: 1,
      repair: 0,
      debit: 1,
    }
  );
  caseResults.E = ok ? "PASS" : "FAIL";
}

// ── CASE F: informational English — must not force tools ─────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "It returns the sum of a and b.",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "nope.ts" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        {
          role: "user",
          content: "Explain what this function does; do not change anything.",
        },
      ],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_f"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    typeof msg(result)?.content === "string" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "F. informational English + tools — provider=1 repair=0 debit=1",
    { ...meta, provider: 1, repair: 0, debit: 1 }
  );
  caseResults.F = ok ? "PASS" : "FAIL";
}

// ── CASE G: tool_choice=required — existing repair ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Required" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "must tool" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1048_g"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount >= 2 &&
    (meta.repairCallCount >= 1 || (meta.arbitrationCallCount ?? 0) >= 1) &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "G. required + native text — existing repair; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
  caseResults.G = ok ? "PASS" : "FAIL";
}

// ── CASE H: named tool_choice unsatisfied — existing repair ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "no tool",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Named" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "forced weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: objectChoice("get_weather"),
    },
    "req_p1048_h"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "get_weather" &&
    meta.providerCallCount >= 2 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "H. named tool_choice miss — existing repair; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
  caseResults.H = ok ? "PASS" : "FAIL";
}

// ── CASE I: P1033 invalid transcript — provider=0 debit=0 ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not fetch",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: "resume broken" },
    assistantTools([tc("call_ok", "Read", { path: "a.ts" })]),
    toolMsg("call_MISSING", { text: "orphan" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_i"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === false &&
    v.ok === false &&
    (v.code === INVALID_TOOL_CALL_ID_CODE ||
      String(v.code ?? "").includes("tool")) &&
    meta.providerCallCount === 0 &&
    meta.debitCallCount === 0;
  assert(
    ok,
    "I. invalid transcript — provider=0 debit=0",
    {
      ...meta,
      provider: 0,
      debit: 0,
      code: (result as any)?.error?.code ?? v.code,
    }
  );
  caseResults.I = ok ? "PASS" : "FAIL";
}

// ── CASE J: transport/provider failure — existing fallback ───────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary", "openai-compatible-secondary"]),
    scripts: [
      () => ({
        kind: "error",
        code: "upstream_error",
        status: 502,
        message: "transport boom",
      }),
      () => ({
        kind: "completion",
        content: "fallback ok",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: INFO_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1048_j"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "fallback ok" &&
    meta.providerCallCount >= 2 &&
    meta.fallbackCount >= 1 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "J. provider failure — existing fallback; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      debit: 1,
    }
  );
  caseResults.J = ok ? "PASS" : "FAIL";
}

console.log("\n── P1048 CASE A–J ──");
console.log(JSON.stringify(caseResults, null, 2));

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
