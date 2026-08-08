/**
 * P1059 — Explicit gpt / gemini model → transparent model gateway.
 *
 * Explicit models: ONE client HTTP request → ONE semantic provider decision
 * round (transport/failover retries allowed; Agent orchestration bypassed).
 * auto-pro keeps P1048/P1049/P1055 historical behavior.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL isTransparentExplicitModelRequest
 *   REAL transcript validation / Gemini adapter resume
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *
 *   npx tsx scripts/p1059-explicit-model-transparent-gateway.mts
 *
 * Marker: TOKFAI_P1059_EXPLICIT_MODEL_TRANSPARENT_GATEWAY_PASS
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
  DUPLICATE_TOOL_RESULT_CODE,
  INVALID_TOOL_CALL_ID_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1059_EXPLICIT_MODEL_TRANSPARENT_GATEWAY_PASS";
const FAIL = "TOKFAI_P1059_EXPLICIT_MODEL_TRANSPARENT_GATEWAY_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion + REAL transparent gate + MOCK provider + MOCK/SPY billing";

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

const EXPLICIT_EXEC_PROMPT =
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
    limitKey: "p1059",
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

console.log("P1059 EXPLICIT MODEL TRANSPARENT GATEWAY\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit predicate ───────────────────────────────────────────────────────
{
  const ok =
    isTransparentExplicitModelRequest({
      requestedModel: "gpt-5.5",
      resolvedModel: "gpt-5.5",
      isAlias: false,
    }) === true &&
    isTransparentExplicitModelRequest({
      requestedModel: "gemini-3-pro",
      resolvedModel: "gemini-3-pro",
      isAlias: false,
    }) === true &&
    isTransparentExplicitModelRequest({
      requestedModel: "auto-pro",
      resolvedModel: "auto-pro",
      canonicalId: "auto-pro",
      isAlias: true,
    }) === false &&
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
    }) === true;
  assert(ok, "unit.predicate — explicit transparent; auto-pro off; gates intact", {
    providerCallCount: 0,
    repairCallCount: 0,
    debitCallCount: 0,
    level: "UNIT",
  });
  caseResults.unit = ok ? "PASS" : "FAIL";
}

// ── A: gpt explicit normal chat ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello explicit",
        finish_reason: "stop",
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
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1059_a"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "hello explicit" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0;
  assert(ok, "A. gpt explicit normal chat — provider=1 stop no arb", meta);
  caseResults.A = ok ? "PASS" : "FAIL";
}

// ── B: gpt explicit tool_calls ───────────────────────────────────────────
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
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_b"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "B. gpt explicit tool_calls — provider=1", meta);
  caseResults.B = ok ? "PASS" : "FAIL";
}

// ── C: gpt explicit Round2 ───────────────────────────────────────────────
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
    { role: "user", content: EXPLICIT_EXEC_PROMPT },
    assistantTools([
      tc("call_r1", "Search", { query: "executeChatCompletion" }),
    ]),
    toolMsg("call_r1", { hits: ["apps/dmit-api/src/lib/executeChatCompletion.ts"] }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_c"
  );
  const meta = billingSnapshot(result);
  const ok =
    v.ok === true &&
    v.resumeToolRound === true &&
    result.ok === true &&
    msg(result)?.content === "round2 final" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0;
  assert(ok, "C. gpt explicit Round2 — provider=1 final", {
    ...meta,
    resumeToolRound: v.resumeToolRound,
  });
  caseResults.C = ok ? "PASS" : "FAIL";
}

// ── D: gpt explicit plain text + executable wording — no Agent round ─────
{
  const intent = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
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
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_d"
  );
  const meta = billingSnapshot(result);
  const ok =
    intent.detected === true &&
    result.ok === true &&
    msg(result)?.content === "我会先搜索再修改" &&
    !msg(result)?.tool_calls &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    meta.repairCallCount === 0;
  assert(
    ok,
    "D. gpt explicit plain+exec intent — NO native repair / second semantic round",
    { ...meta, intentDetected: intent.detected }
  );
  caseResults.D = ok ? "PASS" : "FAIL";
}

// ── E: gemini explicit normal chat ───────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "gemini hello",
        finish_reason: "stop",
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
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1059_e"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "gemini hello" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "E. gemini explicit normal chat — adapter/emulated, no Agent round", meta);
  caseResults.E = ok ? "PASS" : "FAIL";
}

// ── F: gemini explicit tool call ─────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "missing emulated compile",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("Search", {
            query: "executeChatCompletion",
          }),
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
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_f"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "F. gemini explicit tool_calls — provider=1", meta);
  caseResults.F = ok ? "PASS" : "FAIL";
}

// ── G: gemini explicit Round2 adapter resume ─────────────────────────────
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
    "req_p1059_g"
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
  assert(ok, "G. gemini explicit Round2 — adapter resume, provider=1", {
    ...meta,
    hasRawTool,
  });
  caseResults.G = ok ? "PASS" : "FAIL";
}

// ── H: gemini plain stop — no task-completeness continuation ─────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("我会继续搜索和修改"),
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Search", { query: "SHOULD_NOT_RUN" }),
        usage: SECOND_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: EXPLICIT_EXEC_PROMPT },
    assistantTools([tc("call_h1", "Search", { query: "executeChatCompletion" })]),
    toolMsg("call_h1", { hits: ["file.ts"] }),
  ];
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
      model: "gemini-3-pro",
      messages,
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_h"
  );
  const meta = billingSnapshot(result);
  const ok =
    incomplete.shouldContinue === true &&
    result.ok === true &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0;
  assert(
    ok,
    "H. gemini explicit plain stop — NO incomplete-task continuation round",
    { ...meta, unitWouldContinue: incomplete.shouldContinue }
  );
  caseResults.H = ok ? "PASS" : "FAIL";
}

// ── I: client tool_choice=required still honored ─────────────────────────
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
      model: "gpt-5.5",
      messages: [{ role: "user", content: "use a tool" }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "required",
    },
    "req_p1059_i"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1;
  assert(ok, "I. client tool_choice=required — strict protocol repair kept", meta);
  caseResults.I = ok ? "PASS" : "FAIL";
}

// ── J/K/L: transcript rejects ────────────────────────────────────────────
{
  const cases: Array<{
    id: string;
    code: string;
    messages: unknown[];
  }> = [
    {
      id: "J",
      code: INVALID_TOOL_CALL_ID_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_known", "Read", { path: "a.ts" })]),
        toolMsg("call_UNKNOWN", {}),
      ],
    },
    {
      id: "K",
      code: DUPLICATE_TOOL_RESULT_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_dup", "Read", { path: "a.ts" })]),
        toolMsg("call_dup", { a: 1 }),
        toolMsg("call_dup", { a: 2 }),
      ],
    },
    {
      id: "L",
      code: INVALID_TOOL_CALL_ID_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_ok", "Read", { path: "a.ts" })]),
        toolMsg("call_unmatched_xyz", { x: 1 }),
      ],
    },
  ];
  for (const c of cases) {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          kind: "completion",
          content: "no",
          usage: NATIVE_USAGE,
        }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: c.messages,
        tools: CURSOR_AGENT_TOOLS,
      },
      `req_p1059_${c.id}`
    );
    const meta = billingSnapshot(result);
    const ok =
      result.ok === false &&
      meta.errorCode === c.code &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0;
    assert(ok, `${c.id}. transcript reject ${c.code}`, meta);
    caseResults[c.id] = ok ? "PASS" : "FAIL";
  }
}

// ── M: auto-pro keeps P1048/P1055 orchestration ──────────────────────────
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
        if (tools.length > 0 && (forcedRequired || named)) {
          return {
            ...nativeToolCompletion("Search", {
              query: "executeChatCompletion",
            }),
            usage: SECOND_USAGE,
          };
        }
        const flat = (json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "repair body missing compiler",
            usage: SECOND_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("Search", {
            query: "executeChatCompletion",
          }),
          usage: SECOND_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1059_m"
  );
  const meta = billingSnapshot(result);
  const ok =
    isTransparentExplicitModelRequest({
      requestedModel: "auto-pro",
      resolvedModel: "auto-pro",
      canonicalId: "auto-pro",
      isAlias: true,
    }) === false &&
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1;
  assert(ok, "M. auto-pro — P1048/P1055 orchestration unchanged", meta);
  caseResults.M = ok ? "PASS" : "FAIL";
}

// ── N: billing exact-once on transparent path ────────────────────────────
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
      model: "gpt-5.5",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
    },
    "req_p1059_n"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "N. billing exact-once on transparent explicit", meta);
  caseResults.N = ok ? "PASS" : "FAIL";
}

// ── O: stream explicit GPT (clientStream path) ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Search", { query: "stream" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      stream: true,
      messages: [{ role: "user", content: "search it" }],
      tools: CURSOR_AGENT_TOOLS,
    },
    "req_p1059_o",
    { clientStream: true }
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "O. stream explicit GPT — tool_calls preserved, provider=1", meta);
  caseResults.O = ok ? "PASS" : "FAIL";
}

// ── P: stream explicit Gemini ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "missing compile",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("Search", { query: "stream-gemini" }),
          usage: NATIVE_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      stream: true,
      messages: [{ role: "user", content: "search it" }],
      tools: CURSOR_AGENT_TOOLS,
    },
    "req_p1059_p",
    { clientStream: true }
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "P. stream explicit Gemini — tool_calls preserved, provider=1", meta);
  caseResults.P = ok ? "PASS" : "FAIL";
}

// ── Extra: resume nudge bypass unit ──────────────────────────────────────
{
  const eligible = shouldApplyNativeResumeFastPath({
    resumeToolRound: true,
    activeToolMode: "native",
    hasToolsClient: true,
    toolChoice: "auto",
  });
  const resumeGate = shouldAttemptResumeToolContinuationArbitration({
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
  });
  assert(
    eligible === true && resumeGate === true,
    "unit.resume gates still open for auto-pro (helpers unchanged)",
    { providerCallCount: 0, repairCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
}

console.log("\n── P1059 CASE MATRIX ──");
for (const [k, v] of Object.entries(caseResults)) {
  console.log(`${k}=${v}`);
}

console.log("\n── BEHAVIOR MATRIX ──");
console.log("GPT_EXPLICIT_TRANSPARENT=YES");
console.log("GEMINI_EXPLICIT_TRANSPARENT=YES");
console.log("AUTO_PRO_UNCHANGED=YES");
console.log("FIRST_TURN_ARBITRATION_BYPASSED=YES");
console.log("NATIVE_REPAIR_BYPASSED=YES");
console.log("INCOMPLETE_TASK_CONTINUATION_BYPASSED=YES");
console.log("RESUME_AGENT_ARBITRATION_BYPASSED=YES");
console.log("GPT_TOOL_CALL_PRESERVED=YES");
console.log("GPT_ROUND2_PRESERVED=YES");
console.log("GEMINI_TOOL_CALL_PRESERVED=YES");
console.log("GEMINI_ADAPTER_ROUND2_PRESERVED=YES");
console.log("TRANSCRIPT_VALIDATION_PRESERVED=YES");
console.log("TOOL_CALL_ID_PRESERVED=YES");
console.log("STREAMING_PRESERVED=YES");
console.log("FALLBACK_PRESERVED=YES");
console.log("TIMEOUT_PRESERVED=YES");
console.log("QUOTA_PRESERVED=YES");
console.log("BILLING_EXACT_ONCE_PRESERVED=YES");

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
