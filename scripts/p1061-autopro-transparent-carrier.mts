/**
 * P1061 — auto-pro transparent Carrier Model.
 *
 * CURSOR OWNS AGENT ORCHESTRATION.
 * TOKFAI OWNS MODEL ROUTING / PROTOCOL / PROVIDER / BILLING.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL isAutoProTransparentCarrier
 *   REAL transcript validation / Gemini adapter resume
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *
 *   npx tsx scripts/p1061-autopro-transparent-carrier.mts
 *
 * Marker: TOKFAI_P1061_AUTOPRO_TRANSPARENT_CARRIER_PASS
 */

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
const { isAutoProTransparentCarrier } = await import(
  "../apps/dmit-api/src/lib/autoProTransparentCarrier.ts"
);
const { isTransparentExplicitModelRequest } = await import(
  "../apps/dmit-api/src/lib/transparentExplicitModelGateway.ts"
);
const {
  shouldAttemptAutoToolIntentArbitration,
  shouldAttemptResumeToolContinuationArbitration,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const { shouldAttemptNativeToolRepair } = await import(
  "../apps/dmit-api/src/lib/nativeToolRepair.ts"
);
const {
  detectExplicitToolExecutionIntent,
  shouldContinueIncompleteToolTask,
} = await import("../apps/dmit-api/src/lib/toolIntentCompiler.ts");
const {
  validateCursorToolTranscript,
  shouldApplyNativeResumeFastPath,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1061_AUTOPRO_TRANSPARENT_CARRIER_PASS";
const FAIL = "TOKFAI_P1061_AUTOPRO_TRANSPARENT_CARRIER_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion + REAL auto-pro carrier + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
};
const SECOND_USAGE = {
  prompt_tokens: 40,
  completion_tokens: 8,
  total_tokens: 48,
};

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

const EXEC_PROMPT =
  "搜索 executeChatCompletion，读取文件并修改它，然后运行测试";

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

async function exec(
  body: Record<string, unknown>,
  requestId: string,
  opts?: { clientStream?: boolean }
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1061",
    clientStream: opts?.clientStream === true,
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

console.log("P1061 AUTOPRO TRANSPARENT CARRIER\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit predicate ───────────────────────────────────────────────────────
{
  const carrierOn = isAutoProTransparentCarrier({ requestedModel: "auto-pro" });
  const carrierOffGpt = isAutoProTransparentCarrier({
    requestedModel: "gpt-5.5",
  });
  const carrierOffFast = isAutoProTransparentCarrier({
    requestedModel: "auto-fast",
  });
  const notExplicit = isTransparentExplicitModelRequest({
    requestedModel: "auto-pro",
    resolvedModel: "auto-pro",
    canonicalId: "auto-pro",
    isAlias: true,
  });
  const helpersOpen =
    shouldAttemptAutoToolIntentArbitration({
      hasTools: true,
      supportsToolsRequested: true,
      effectiveToolChoice: "auto",
      activeToolMode: "native",
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      autoIntentArbitrationAttempted: false,
      freshRemainingTotalMs: 60_000,
      toolIntentDetected: true,
    }) === true &&
    shouldAttemptNativeToolRepair({
      hasTools: true,
      supportsToolsRequested: true,
      effectiveToolChoice: "auto",
      activeToolMode: "native",
      providerSupportsNativeTools: true,
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      explicitToolExecutionIntent: true,
      nativeToolRepairAttempted: false,
      resumeToolRound: false,
      freshRemainingTotalMs: 60_000,
      clientToolChoiceIsAutoOrMissing: true,
    }) === true &&
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
    }) === true &&
    shouldApplyNativeResumeFastPath({
      resumeToolRound: true,
      activeToolMode: "native",
      hasToolsClient: true,
      toolChoice: "auto",
    }) === true;
  const ok =
    carrierOn === true &&
    carrierOffGpt === false &&
    carrierOffFast === false &&
    notExplicit === false &&
    helpersOpen === true;
  assert(ok, "unit.predicate — carrier only for auto-pro; helpers intact", {
    providerCallCount: 0,
    repairCallCount: 0,
    debitCallCount: 0,
    fallbackCount: 0,
    level: "UNIT",
    carrierOn,
    carrierOffGpt,
    carrierOffFast,
    notExplicit,
  });
  caseResults.unit = ok ? "PASS" : "FAIL";
}

// ── A: plain text + tools + auto — NO second provider / arbitration ─────
{
  const intent = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: EXEC_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
  });
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "我会先搜索再修改",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        ...nativeToolCompletion("Search", { query: "SHOULD_NOT_RUN" }),
        usage: SECOND_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_a"
  );
  const meta = billingSnapshot(result);
  const ok =
    intent.detected === true &&
    result.ok === true &&
    msg(result)?.content === "我会先搜索再修改" &&
    !msg(result)?.tool_calls &&
    meta.providerCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.repairCallCount === 0 &&
    meta.debitCallCount === 1;
  assert(
    ok,
    "A. auto-pro plain text — provider=1 arbitration=0 repair=0",
    { ...meta, intentDetected: intent.detected }
  );
  caseResults.A = ok ? "PASS" : "FAIL";
}

// ── B: provider tool_calls preserved ─────────────────────────────────────
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
        content: "SHOULD_NOT_RUN",
        usage: SECOND_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_b"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    typeof msg(result).tool_calls[0]?.id === "string" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "B. auto-pro tool_calls — provider=1 preserved", meta);
  caseResults.B = ok ? "PASS" : "FAIL";
}

// ── C: Round2 assistant.tool_calls + tool result ─────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "round2 final",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        ...nativeToolCompletion("Read", { path: "SHOULD_NOT_RUN.ts" }),
        usage: SECOND_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: EXEC_PROMPT },
    assistantTools([
      tc("call_r1", "Search", { query: "executeChatCompletion" }),
    ]),
    toolMsg("call_r1", {
      hits: ["apps/dmit-api/src/lib/executeChatCompletion.ts"],
    }),
  ];
  const v = validateCursorToolTranscript(messages);
  const incomplete = shouldContinueIncompleteToolTask({
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
    messages,
    tools: CURSOR_AGENT_TOOLS,
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_c"
  );
  const meta = billingSnapshot(result);
  const outbound = getCounts().outboundBodies[0];
  const hasToolResult = (outbound?.messages ?? []).some(
    (m: any) =>
      m &&
      typeof m === "object" &&
      m.role === "tool" &&
      m.tool_call_id === "call_r1"
  );
  const ok =
    v.ok === true &&
    v.resumeToolRound === true &&
    incomplete.shouldContinue === true &&
    result.ok === true &&
    msg(result)?.content === "round2 final" &&
    hasToolResult &&
    meta.providerCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "C. Round2 — provider=1 tool_call_id preserved, no arb", {
    ...meta,
    resumeToolRound: v.resumeToolRound,
    unitWouldContinue: incomplete.shouldContinue,
    hasToolResult,
  });
  caseResults.C = ok ? "PASS" : "FAIL";
}

// ── D: client tool_choice=required still strict ──────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain despite required",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "expected strict emulated repair",
            usage: SECOND_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("Search", { query: "required" }),
          usage: SECOND_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "use a tool" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "required",
    },
    "req_p1061_d"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1;
  assert(ok, "D. client tool_choice=required — protocol repair kept", meta);
  caseResults.D = ok ? "PASS" : "FAIL";
}

// ── E: client named tool_choice still strict ─────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain despite named",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        const choice = ctx.json.tool_choice;
        const named =
          choice &&
          typeof choice === "object" &&
          (choice as { function?: { name?: string } }).function?.name;
        // GRSAI may adapt object tool_choice; accept named or emulated repair.
        if (named === "Read" || ctx.hasCompiler) {
          return {
            ...nativeToolCompletion("Read", { path: "named.ts" }),
            usage: SECOND_USAGE,
          };
        }
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: makeToolCallIntent("Read", { path: "named.ts" }),
            usage: SECOND_USAGE,
          };
        }
        return {
          kind: "completion",
          content: "expected named force",
          usage: SECOND_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "read the file" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "Read" },
      },
    },
    "req_p1061_e"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Read" &&
    meta.providerCallCount >= 1 &&
    meta.debitCallCount === 1;
  assert(ok, "E. client named tool_choice — specified function required", meta);
  caseResults.E = ok ? "PASS" : "FAIL";
}

// ── F: provider transport failure — fallback allowed ─────────────────────
{
  resetScenario({
    providers: defaultProviders([
      "grsai-primary",
      "openai-compatible-secondary",
    ]),
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
      model: "auto-pro",
      messages: [{ role: "user", content: "hi" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_f"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "fallback ok" &&
    meta.providerCallCount >= 2 &&
    meta.fallbackCount >= 1 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.debitCallCount === 1;
  assert(ok, "F. transport failure — fallback attempt allowed; debit=1", meta);
  caseResults.F = ok ? "PASS" : "FAIL";
}

// ── G: GPT explicit golden path unchanged ────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "gpt golden",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        ...nativeToolCompletion("Search", { query: "SHOULD_NOT_RUN" }),
        usage: SECOND_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_g"
  );
  const meta = billingSnapshot(result);
  const ok =
    isAutoProTransparentCarrier({ requestedModel: "gpt-5.5" }) === false &&
    isTransparentExplicitModelRequest({
      requestedModel: "gpt-5.5",
      resolvedModel: "gpt-5.5",
      isAlias: false,
    }) === true &&
    result.ok === true &&
    msg(result)?.content === "gpt golden" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "G. GPT explicit golden — unchanged transparent path", meta);
  caseResults.G = ok ? "PASS" : "FAIL";
}

// ── H: Gemini P1053 roundtrip unchanged ──────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        const msgs = Array.isArray(ctx.json.messages) ? ctx.json.messages : [];
        const hasRawTool = msgs.some(
          (m: any) => m && typeof m === "object" && m.role === "tool"
        );
        if (hasRawTool) {
          return {
            kind: "completion",
            content: "raw role=tool leaked",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeAssistantTextIntent("gemini round2 final"),
          usage: NATIVE_USAGE,
        };
      },
      () => ({
        kind: "completion",
        content: "SHOULD_NOT_RUN",
        usage: SECOND_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: "status?" },
    assistantTools([tc("call_g1", "Search", { query: "x" })]),
    toolMsg("call_g1", { hits: [] }),
  ];
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_h"
  );
  const meta = billingSnapshot(result);
  const outbound = getCounts().outboundBodies[0];
  const hasRawTool = (outbound?.messages ?? []).some(
    (m: any) => m && typeof m === "object" && m.role === "tool"
  );
  const ok =
    result.ok === true &&
    !hasRawTool &&
    typeof msg(result)?.content === "string" &&
    String(msg(result)?.content).includes("gemini round2 final") &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "H. Gemini P1053 roundtrip — adapter resume unchanged", {
    ...meta,
    hasRawTool,
  });
  caseResults.H = ok ? "PASS" : "FAIL";
}

// ── I: auto-pro billing exact once ───────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "bill once",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_i"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "I. auto-pro billing exact-once", meta);
  caseResults.I = ok ? "PASS" : "FAIL";
}

// ── J: streaming unchanged ───────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Search", { query: "stream" }),
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: "SHOULD_NOT_RUN",
        usage: SECOND_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      stream: true,
      messages: [{ role: "user", content: "search it" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1061_j",
    { clientStream: true }
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "J. streaming auto-pro — tool_calls preserved, provider=1", meta);
  caseResults.J = ok ? "PASS" : "FAIL";
}

console.log("\n── P1061 CASE MATRIX ──");
for (const [k, v] of Object.entries(caseResults)) {
  console.log(`${k}=${v}`);
}

console.log("\n── BEHAVIOR MATRIX ──");
console.log("AUTOPRO_TRANSPARENT_CARRIER=YES");
console.log("CURSOR_AGENT_ORCHESTRATION_INSIDE_TOKFAI=NO");
console.log("PLAIN_TEXT_SECOND_PROVIDER_FETCH=NO");
console.log("TOKFAI_INFERRED_TOOL_CHOICE=NO");
console.log("CLIENT_REQUIRED_TOOL_CHOICE_PRESERVED=YES");
console.log("CLIENT_NAMED_TOOL_CHOICE_PRESERVED=YES");
console.log("ROUND1_TOOL_CALL_PRESERVED=YES");
console.log("ROUND2_TOOL_RESULT_PRESERVED=YES");
console.log("GPT_GOLDEN_PATH_CHANGED=NO");
console.log("GEMINI_P1053_CHANGED=NO");
console.log("BILLING_CHANGED=NO");

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
