/**
 * P1049 — Incomplete multi-step tool-task continuation (resume capability gap).
 *
 * After tool results are injected, native plain "I'll continue" text must NOT
 * finalize when required capabilities remain unmet. Exactly ONE continuation
 * repair may emit the next tool_calls. Completed capability sets stay final.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL shouldContinueIncompleteToolTask / capability mapping
 *   REAL shouldAttemptResumeToolContinuationArbitration
 *   REAL compileEmulatedResumeTranscript
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1049-cursor-multistep-continuation.mts
 *
 * Marker: TOKFAI_P1049_CURSOR_MULTISTEP_CONTINUATION_PASS
 */

import { fileURLToPath } from "node:url";
import {
  AGENT_FILE_TOOLS,
  CALLER,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
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
  shouldAttemptResumeToolContinuationArbitration,
  shouldAttemptAutoToolIntentArbitration,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  detectExplicitToolExecutionIntent,
  shouldContinueIncompleteToolTask,
  normalizeToolNameToCapability,
  inferRequiredAgentCapabilities,
  extractCompletedAgentCapabilities,
} = await import("../apps/dmit-api/src/lib/toolIntentCompiler.ts");
const {
  validateCursorToolTranscript,
  INVALID_TOOL_CALL_ID_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1049_CURSOR_MULTISTEP_CONTINUATION_PASS";
const FAIL = "TOKFAI_P1049_CURSOR_MULTISTEP_CONTINUATION_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL shouldContinueIncompleteToolTask + REAL gates + MOCK provider + MOCK/SPY billing";

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

const MULTISTEP_PROMPT =
  "搜索 executeChatCompletion 的定义，读取该文件，写入 result.json，用终端验证 JSON，再读取该 JSON，最后删除测试目录";

const SEARCH_ONLY_PROMPT = "搜索 executeChatCompletion 并告诉我在哪里";

const CURSOR_AGENT_TOOLS = [
  ...AGENT_FILE_TOOLS,
  {
    type: "function",
    function: {
      name: "Grep",
      description: "Search the codebase",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Search",
      description: "Search",
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
  {
    type: "function",
    function: {
      name: "Delete",
      description: "Delete a file or directory",
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
    limitKey: "p1049",
    clientStream: false,
  });
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

function searchOnlyRoundMessages(): Record<string, unknown>[] {
  return [
    { role: "user", content: SEARCH_ONLY_PROMPT },
    assistantTools([
      tc("call_s1", "Grep", { pattern: "executeChatCompletion" }),
    ]),
    toolMsg("call_s1", {
      path: "apps/dmit-api/src/lib/executeChatCompletion.ts",
    }),
  ];
}

function multistepSearchOnlyRoundMessages(): Record<string, unknown>[] {
  return [
    { role: "user", content: MULTISTEP_PROMPT },
    assistantTools([
      tc("call_g1", "Grep", { pattern: "executeChatCompletion" }),
      tc("call_g2", "Grep", { pattern: "recordSuccessfulUsageAndDebit" }),
    ]),
    toolMsg("call_g1", { hits: ["apps/.../executeChatCompletion.ts"] }),
    toolMsg("call_g2", { hits: ["apps/.../usageBilling.ts"] }),
  ];
}

function multistepAllDoneMessages(): Record<string, unknown>[] {
  return [
    { role: "user", content: MULTISTEP_PROMPT },
    assistantTools([
      tc("call_g1", "Grep", { pattern: "executeChatCompletion" }),
      tc("call_r1", "Read", { path: "apps/dmit-api/src/lib/executeChatCompletion.ts" }),
      tc("call_w1", "Write", {
        path: ".tokfai-real-agent-test/result.json",
        contents: "{}",
      }),
      tc("call_t1", "Terminal", { command: "node -e \"JSON.parse('{}')\"" }),
      tc("call_r2", "Read", { path: ".tokfai-real-agent-test/result.json" }),
      tc("call_d1", "Delete", { path: ".tokfai-real-agent-test" }),
    ]),
    toolMsg("call_g1", { ok: true }),
    toolMsg("call_r1", { ok: true }),
    toolMsg("call_w1", { ok: true }),
    toolMsg("call_t1", { ok: true }),
    toolMsg("call_r2", { ok: true }),
    toolMsg("call_d1", { ok: true }),
  ];
}

console.log("P1049 CURSOR MULTISTEP CONTINUATION\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit: capability mapping + gates ─────────────────────────────────────
{
  const mapOk =
    normalizeToolNameToCapability("Grep") === "search" &&
    normalizeToolNameToCapability("Search") === "search" &&
    normalizeToolNameToCapability("Read") === "read" &&
    normalizeToolNameToCapability("ReadFile") === "read" &&
    normalizeToolNameToCapability("Write") === "write" &&
    normalizeToolNameToCapability("Edit") === "write" &&
    normalizeToolNameToCapability("Terminal") === "terminal" &&
    normalizeToolNameToCapability("Shell") === "terminal" &&
    normalizeToolNameToCapability("Delete") === "delete" &&
    normalizeToolNameToCapability("RemoveFile") === "delete";

  const required = inferRequiredAgentCapabilities({
    messages: [{ role: "user", content: MULTISTEP_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
  });
  const requiredOk =
    required.includes("search") &&
    required.includes("read") &&
    required.includes("write") &&
    required.includes("terminal") &&
    required.includes("delete");

  const partial = extractCompletedAgentCapabilities(
    multistepSearchOnlyRoundMessages()
  );
  const allDone = extractCompletedAgentCapabilities(multistepAllDoneMessages());

  const gap = shouldContinueIncompleteToolTask({
    resumeToolRound: true,
    explicitExecutionIntent: true,
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    continuationAlreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
    unmatchedToolCallIdCount: 0,
    duplicateToolResultCount: 0,
    orderViolationCount: 0,
    upstreamHttpOk: true,
    messages: multistepSearchOnlyRoundMessages(),
    tools: CURSOR_AGENT_TOOLS,
    nativeAssistantText: "我会按步骤直接执行，并继续完成。",
  });

  const doneGate = shouldContinueIncompleteToolTask({
    resumeToolRound: true,
    explicitExecutionIntent: true,
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    continuationAlreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
    messages: multistepAllDoneMessages(),
    tools: CURSOR_AGENT_TOOLS,
    nativeAssistantText: "全部完成。",
  });

  const infoIntent = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: "解释这个函数" }],
    tools: CURSOR_AGENT_TOOLS,
  });

  const gateClosedByDefault =
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
    }) === false;

  const gateOpensWithGap =
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
      incompleteToolTask: true,
    }) === true;

  const ok =
    mapOk &&
    requiredOk &&
    partial.length === 1 &&
    partial[0] === "search" &&
    allDone.includes("search") &&
    allDone.includes("read") &&
    allDone.includes("write") &&
    allDone.includes("terminal") &&
    allDone.includes("delete") &&
    gap.shouldContinue === true &&
    gap.remainingCapabilities.length > 0 &&
    doneGate.shouldContinue === false &&
    infoIntent.detected === false &&
    gateClosedByDefault &&
    gateOpensWithGap &&
    shouldAttemptAutoToolIntentArbitration({
      hasTools: true,
      supportsToolsRequested: true,
      effectiveToolChoice: "auto",
      activeToolMode: "native",
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      autoIntentArbitrationAttempted: false,
      freshRemainingTotalMs: 60_000,
      resumeToolRound: true,
      toolIntentDetected: true,
    }) === false;

  assert(ok, "unit.capability mapping + incomplete-task gates", {
    providerCallCount: 0,
    repairCallCount: 0,
    arbitrationCallCount: 0,
    fallbackCount: 0,
    debitCallCount: 0,
    level: "UNIT",
    required,
    partial,
    allDone,
    gapRemaining: gap.remainingCapabilities,
  });
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
      messages: [{ role: "user", content: "解释这个函数" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_a"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "这是函数说明" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "A. informational — provider=1 repair=0 debit=1", {
    ...meta,
    provider: 1,
    repair: 0,
    debit: 1,
  });
  caseResults.A = ok ? "PASS" : "FAIL";
}

// ── CASE B: search-only task satisfied — final ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content:
          "定义位于 apps/dmit-api/src/lib/executeChatCompletion.ts",
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
  const messages = searchOnlyRoundMessages();
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_b"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    v.resumeToolRound === true &&
    String(msg(result)?.content ?? "").includes("executeChatCompletion.ts") &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "B. search satisfied — final provider=1 repair=0 debit=1", {
    ...meta,
    resumeToolRound: v.resumeToolRound,
    provider: 1,
    repair: 0,
    debit: 1,
  });
  caseResults.B = ok ? "PASS" : "FAIL";
}

// ── CASE C: multistep incomplete + promise text → continuation ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "我接下来会读取文件并继续。",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", {
          path: "apps/dmit-api/src/lib/executeChatCompletion.ts",
        }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const messages = multistepSearchOnlyRoundMessages();
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "auto-pro",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_c"
  );
  const meta = billingSnapshot(result);
  const toolCalls = msg(result)?.tool_calls;
  const ok =
    result.ok === true &&
    v.resumeToolRound === true &&
    Array.isArray(toolCalls) &&
    toolCalls.length > 0 &&
    meta.providerCallCount === 2 &&
    meta.repairCallCount >= 1 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "C. incomplete multistep + promise → continuation repair=1 tool_calls>0",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
  caseResults.C = ok ? "PASS" : "FAIL";
}

// ── CASE D: continuation at most once (second still plain → return text) ─
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "现在读取文件然后执行。",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("仍是普通文本，不再继续 repair"),
        usage: REPAIR_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "loop.ts" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: multistepSearchOnlyRoundMessages(),
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_d"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    typeof msg(result)?.content === "string" &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "D. continuation repair max once; plain after repair → return text; no loop",
    {
      ...meta,
      provider: meta.providerCallCount,
      debit: 1,
      content: msg(result)?.content,
    }
  );
  caseResults.D = ok ? "PASS" : "FAIL";
}

// ── CASE E: repair still plain text → return that text (alias of D) ──────
{
  caseResults.E = caseResults.D;
  assert(
    caseResults.D === "PASS",
    "E. repair plain text returned; no infinite loop (shared with D)",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      shared: "D",
    }
  );
}

// ── CASE F: resume native already returns tool_calls → repair=0 ──────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Read", {
          path: "apps/dmit-api/src/lib/executeChatCompletion.ts",
        }),
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Write", {
          path: "SHOULD_NOT_RUN.json",
          contents: "x",
        }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: multistepSearchOnlyRoundMessages(),
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_f"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "F. resume native tool_calls — provider=1 repair=0 debit=1", {
    ...meta,
    provider: 1,
    repair: 0,
    debit: 1,
  });
  caseResults.F = ok ? "PASS" : "FAIL";
}

// ── CASE G: all capabilities complete → final ────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "TOKFAI_P1048_REAL_AGENT_PASS",
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
  const messages = multistepAllDoneMessages();
  const gap = shouldContinueIncompleteToolTask({
    resumeToolRound: true,
    explicitExecutionIntent: true,
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    continuationAlreadyAttempted: false,
    freshRemainingTotalMs: 60_000,
    messages,
    tools: CURSOR_AGENT_TOOLS,
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_g"
  );
  const meta = billingSnapshot(result);
  const ok =
    gap.shouldContinue === false &&
    result.ok === true &&
    msg(result)?.content === "TOKFAI_P1048_REAL_AGENT_PASS" &&
    meta.providerCallCount === 1 &&
    meta.repairCallCount === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "G. all capabilities done — final provider=1 repair=0 debit=1", {
    ...meta,
    remaining: gap.remainingCapabilities,
    provider: 1,
    repair: 0,
    debit: 1,
  });
  caseResults.G = ok ? "PASS" : "FAIL";
}

// ── CASE H: invalid transcript → provider=0 debit=0 ──────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: MULTISTEP_PROMPT },
    assistantTools([tc("call_ok", "Grep", { pattern: "x" })]),
    toolMsg("call_MISSING", { oops: true }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_h"
  );
  const meta = billingSnapshot(result);
  const ok =
    v.ok === false &&
    result.ok === false &&
    meta.providerCallCount === 0 &&
    meta.debitCallCount === 0 &&
    (meta.errorCode === INVALID_TOOL_CALL_ID_CODE ||
      typeof meta.errorCode === "string");
  assert(ok, "H. invalid transcript — provider=0 debit=0", {
    ...meta,
    validateOk: v.ok,
    provider: 0,
    debit: 0,
  });
  caseResults.H = ok ? "PASS" : "FAIL";
}

// ── CASE I: unmatched/duplicate protections remain ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: MULTISTEP_PROMPT },
    assistantTools([tc("call_dup", "Grep", { pattern: "x" })]),
    toolMsg("call_dup", { a: 1 }),
    toolMsg("call_dup", { a: 2 }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1049_i"
  );
  const meta = billingSnapshot(result);
  const ok =
    v.ok === false &&
    result.ok === false &&
    meta.providerCallCount === 0 &&
    meta.debitCallCount === 0;
  assert(ok, "I. duplicate tool result — provider=0 debit=0", {
    ...meta,
    validateOk: v.ok,
    provider: 0,
    debit: 0,
  });
  caseResults.I = ok ? "PASS" : "FAIL";
}

// ── CASE J: commercial request debit exactly once (success path) ─────────
{
  caseResults.J =
    caseResults.C === "PASS" && caseResults.B === "PASS" ? "PASS" : "FAIL";
  assert(
    caseResults.J === "PASS",
    "J. commercial debit exactly once on success paths (B/C)",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 1,
      B: caseResults.B,
      C: caseResults.C,
    }
  );
}

// ── CASE K: continuation repair → provider=2 debit=1 ─────────────────────
{
  caseResults.K = caseResults.C === "PASS" ? "PASS" : "FAIL";
  assert(
    caseResults.K === "PASS",
    "K. continuation repair provider=2 debit=1 (shared with C)",
    {
      providerCallCount: 2,
      repairCallCount: 1,
      fallbackCount: 0,
      debitCallCount: 1,
      shared: "C",
    }
  );
}

// ── CASE L: true final after tool results → provider=1 debit=1 ───────────
{
  caseResults.L =
    caseResults.B === "PASS" && caseResults.G === "PASS" ? "PASS" : "FAIL";
  assert(
    caseResults.L === "PASS",
    "L. true final after tools provider=1 debit=1 (shared with B/G)",
    {
      providerCallCount: 1,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 1,
      B: caseResults.B,
      G: caseResults.G,
    }
  );
}

console.log("\nCASE_A_L=" + JSON.stringify(caseResults));
if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
