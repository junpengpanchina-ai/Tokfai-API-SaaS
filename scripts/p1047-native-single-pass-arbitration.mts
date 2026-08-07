/**
 * P1047 — Native single-pass under OpenAI auto tool semantics.
 *
 * After a valid native OpenAI-compatible response, Tokfai must NOT run a
 * second continuation / tool arbitration solely because tools[] were present.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL shouldRunToolArbitrationAfterNativeResponse / P1028 / P1036 gates
 *   REAL strict repair path (required / named)
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1047-native-single-pass-arbitration.mts
 *
 * Marker: TOKFAI_P1047_NATIVE_SINGLE_PASS_PASS
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
  getCounts,
  installP1018Mocks,
  loadExecuteChatCompletion,
  makeAssistantTextIntent,
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
  isAutoEffectiveToolChoice,
  effectiveToolChoice,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  validateCursorToolTranscript,
  DUPLICATE_TOOL_RESULT_CODE,
  INVALID_TOOL_CALL_ID_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1047_NATIVE_SINGLE_PASS_PASS";
const FAIL = "TOKFAI_P1047_NATIVE_SINGLE_PASS_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL arbitration gates + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
};

let failed = 0;
const caseCounts: Record<
  string,
  { provider: number; arbitration: number; debit: number; note: string }
> = {};

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
function choice(result: any) {
  return result?.response?.choices?.[0] ?? null;
}
function tokfai(result: any) {
  return (result?.response?.tokfai as Record<string, unknown>) ?? {};
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1047",
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

function recordCase(
  id: string,
  meta: { providerCallCount: number; arbitrationCallCount?: number; debitCallCount: number },
  note: string
) {
  caseCounts[id] = {
    provider: meta.providerCallCount,
    arbitration: meta.arbitrationCallCount ?? 0,
    debit: meta.debitCallCount,
    note,
  };
}

console.log("P1047 NATIVE SINGLE-PASS ARBITRATION\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit gates ───────────────────────────────────────────────────────────
{
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
    shouldRunToolArbitrationAfterNativeResponse(autoBase) === false &&
      shouldRunToolArbitrationAfterNativeResponse({
        ...autoBase,
        effectiveToolChoice: null,
        upstreamReturnedToolCalls: false,
      }) === false &&
      shouldRunToolArbitrationAfterNativeResponse({
        ...autoBase,
        upstreamReturnedToolCalls: true,
        finishReason: "tool_calls",
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...autoBase,
        autoIntentArbitrationAttempted: false,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...autoBase,
        effectiveToolChoice: null,
        autoIntentArbitrationAttempted: false,
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
      }) === false &&
      isAutoEffectiveToolChoice(null) === true &&
      effectiveToolChoice({ tools: WEATHER_TOOLS }) === "auto",
    "unit.P1047 gates closed for auto/missing valid native",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT",
    }
  );
}

// ── CASE A: tools present, tool_choice missing, native ordinary text ─────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "SHOULD_NOT_RUN" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
    },
    "req_p1047_a"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "hello" &&
      !Array.isArray(msg(result)?.tool_calls) &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tokfai(result).tool_calling_mode === "native",
    "A. tools + missing tool_choice + native text — provider=1 arb=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
  recordCase("A", meta, "missing tool_choice + native text");
}

// ── CASE B: tools + tool_choice=auto + native ordinary text ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "ordinary final",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("arb must not run"),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_b"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "ordinary final" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "B. tools + auto + native text — provider=1 arb=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
  recordCase("B", meta, "auto + native text");
}

// ── CASE C: tools + auto + native valid tool_calls ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Direct" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_c"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      Array.isArray(msg(result)?.tool_calls) &&
      msg(result).tool_calls.length === 1 &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "C. tools + auto + native tool_calls — provider=1 arb=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
  recordCase("C", meta, "auto + native tool_calls");
}

// ── CASE D: resumeToolRound + native final text ──────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "done after tool",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "SHOULD_NOT_RUN.ts" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: "read then finish" },
    assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
    toolMsg("call_r1_a", { text: "contents of a" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_d"
  );
  const meta = billingSnapshot(result);
  assert(
    v.ok === true &&
      v.resumeToolRound === true &&
      result.ok === true &&
      msg(result)?.content === "done after tool" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "D. resumeToolRound + native final text — provider=1 arb=0 debit=1",
    { ...meta, resumeToolRound: v.resumeToolRound, provider: 1, arbitration: 0, debit: 1 }
  );
  recordCase("D", meta, "resume + native final text");
}

// ── CASE E: resumeToolRound + native next tool_calls ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Read", { path: "b.ts" }, { id: "call_r2_b" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: "read a then b" },
    assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
    toolMsg("call_r1_a", { text: "contents of a" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_e"
  );
  const meta = billingSnapshot(result);
  assert(
    v.resumeToolRound === true &&
      result.ok === true &&
      msg(result)?.tool_calls?.[0]?.function?.name === "Read" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "E. resumeToolRound + native next tool_calls — provider=1 arb=0 debit=1",
    { ...meta, resumeToolRound: v.resumeToolRound, provider: 1, arbitration: 0, debit: 1 }
  );
  recordCase("E", meta, "resume + native next tool_calls");
}

// ── CASE F: tool_choice=required + native text only → repair/arb ─────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain pretending",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Required" }),
        usage: NATIVE_USAGE,
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
    "req_p1047_f"
  );
  const meta = billingSnapshot(result);
  const secondPass =
    meta.providerCallCount >= 2 &&
    ((meta.arbitrationCallCount ?? 0) >= 1 || meta.repairCallCount >= 1);
  assert(
    result.ok === true &&
      secondPass &&
      Array.isArray(msg(result)?.tool_calls) &&
      msg(result).tool_calls[0]?.function?.name === "get_weather" &&
      meta.debitCallCount === 1,
    "F. required + native text → still second-pass repair; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      arbitration: meta.arbitrationCallCount ?? 0,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
  recordCase("F", meta, "required → repair/arb");
}

// ── CASE G: named tool_choice + native wrong / no tool → repair ──────────
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
        usage: NATIVE_USAGE,
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
    "req_p1047_g"
  );
  const meta = billingSnapshot(result);
  const secondPass =
    meta.providerCallCount >= 2 &&
    ((meta.arbitrationCallCount ?? 0) >= 1 || meta.repairCallCount >= 1);
  assert(
    result.ok === true &&
      secondPass &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      meta.debitCallCount === 1,
    "G. named tool_choice + native miss → still second-pass; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      arbitration: meta.arbitrationCallCount ?? 0,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
  recordCase("G", meta, "named → repair/arb");
}

// ── CASE H: malformed native under required — repair/fallback retained ───
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
        content: "NOT_VALID_JSON{{{",
        usage: NATIVE_USAGE,
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
    "req_p1047_h"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.providerCallCount >= 2 &&
      meta.debitCallCount === 0 &&
      meta.credits_charged === 0,
    "H. malformed after required repair — fail not_billable; debit=0",
    {
      ...meta,
      provider: meta.providerCallCount,
      arbitration: meta.arbitrationCallCount ?? 0,
      debit: 0,
    }
  );
  recordCase("H", meta, "malformed required repair retained");
}

// ── CASE I: P1033 invalid transcript — provider=0 debit=0 ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "Nope" }),
    ],
  });
  const messages = [
    { role: "user", content: "x" },
    assistantTools([tc("call_dup", "Read", { path: "a.ts" })]),
    toolMsg("call_dup", { text: "a" }),
    toolMsg("call_dup", { text: "duplicate" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_i"
  );
  const meta = billingSnapshot(result);
  assert(
    v.ok === false &&
      (v.code === DUPLICATE_TOOL_RESULT_CODE ||
        v.code === INVALID_TOOL_CALL_ID_CODE ||
        typeof v.code === "string") &&
      result.ok === false &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "I. P1033 invalid transcript — provider=0 debit=0",
    {
      ...meta,
      transcriptCode: v.ok ? null : v.code,
      provider: 0,
      arbitration: 0,
      debit: 0,
    }
  );
  recordCase("I", meta, "invalid transcript");
}

// ── CASE J: provider transport failure — model/provider fallback retained ─
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
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1047_j"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "fallback ok" &&
      meta.fallbackCount >= 1 &&
      meta.providerCallCount >= 2 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "J. provider transport failure — model/provider fallback retained; debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      arbitration: 0,
      debit: 1,
    }
  );
  recordCase("J", meta, "provider transport fallback");
}

// Exact-once billing spot-check across A–E
{
  const c = getCounts();
  void c;
  assert(
    caseCounts.A?.debit === 1 &&
      caseCounts.B?.debit === 1 &&
      caseCounts.C?.debit === 1 &&
      caseCounts.D?.debit === 1 &&
      caseCounts.E?.debit === 1 &&
      caseCounts.A?.arbitration === 0 &&
      caseCounts.B?.arbitration === 0 &&
      caseCounts.C?.arbitration === 0 &&
      caseCounts.D?.arbitration === 0 &&
      caseCounts.E?.arbitration === 0,
    "billing. A–E exact-once debit; zero auto arbitration",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      caseCounts,
      level: "SUMMARY",
    }
  );
}

console.log("\n── P1047 CASE A–J counts ──");
console.log(JSON.stringify(caseCounts, null, 2));

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
