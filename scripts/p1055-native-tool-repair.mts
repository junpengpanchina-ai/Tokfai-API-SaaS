/**
 * P1055 — Native tool repair before emulated_json fallback.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL shouldAttemptNativeToolRepair / selectNativeRepairTool
 *   REAL P1048 intent detection + gates
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *
 *   npx tsx scripts/p1055-native-tool-repair.mts
 *
 * Marker: TOKFAI_P1055_NATIVE_TOOL_REPAIR_PASS
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
  shouldAttemptAutoToolIntentArbitration,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  shouldAttemptNativeToolRepair,
  selectNativeRepairTool,
} = await import("../apps/dmit-api/src/lib/nativeToolRepair.ts");
const { detectExplicitToolExecutionIntent } = await import(
  "../apps/dmit-api/src/lib/toolIntentCompiler.ts"
);
const { validateCursorToolTranscript } = await import(
  "../apps/dmit-api/src/lib/cursorToolProtocol.ts"
);

const PASS = "TOKFAI_P1055_NATIVE_TOOL_REPAIR_PASS";
const FAIL = "TOKFAI_P1055_NATIVE_TOOL_REPAIR_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion + REAL nativeToolRepair + MOCK provider + MOCK/SPY billing";

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
    limitKey: "p1055",
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

function isNativeRepairOutbound(json: Record<string, unknown>): boolean {
  const tools = Array.isArray(json.tools) ? json.tools : [];
  const choice = json.tool_choice;
  if (tools.length === 0) return false;
  if (choice === "required") return true;
  if (
    choice &&
    typeof choice === "object" &&
    (choice as { function?: { name?: string } }).function?.name
  ) {
    return true;
  }
  return false;
}

console.log("P1055 NATIVE TOOL REPAIR\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Unit gates ───────────────────────────────────────────────────────────
{
  const execIntent = detectExplicitToolExecutionIntent({
    messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
  });
  const selection = selectNativeRepairTool({
    messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
    tools: CURSOR_AGENT_TOOLS,
    matchedToolNames: execIntent.matchedToolNames,
    providerId: "grsai-primary",
  });
  const base = {
    hasTools: true,
    supportsToolsRequested: true,
    effectiveToolChoice: "auto" as unknown,
    activeToolMode: "native" as const,
    providerSupportsNativeTools: true,
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    explicitToolExecutionIntent: true,
    nativeToolRepairAttempted: false,
    resumeToolRound: false,
    freshRemainingTotalMs: 60_000,
    clientToolChoiceIsAutoOrMissing: true,
  };
  assert(
    execIntent.detected === true &&
      selection?.selectedCapability === "search" &&
      selection?.selectedToolName === "Search" &&
      shouldAttemptNativeToolRepair(base) === true &&
      shouldAttemptNativeToolRepair({
        ...base,
        nativeToolRepairAttempted: true,
      }) === false &&
      shouldAttemptNativeToolRepair({
        ...base,
        resumeToolRound: true,
      }) === false &&
      shouldAttemptNativeToolRepair({
        ...base,
        clientToolChoiceIsAutoOrMissing: false,
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
      }) === true,
    "unit.gates + search-first selection",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      selected: selection,
    }
  );
}

// ── A: ordinary chat, no tools ───────────────────────────────────────────
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
        content: "SHOULD_NOT_RUN",
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1055_a"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "A. ordinary chat — provider=1 repair=0", meta);
  caseResults.A = ok ? "PASS" : "FAIL";
}

// ── B: tools present, informational — no force ───────────────────────────
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
        ...nativeToolCompletion("Search", { query: "SHOULD_NOT_RUN" }),
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
    "req_p1055_b"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "这是函数说明" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "B. informational + tools — no native repair", meta);
  caseResults.B = ok ? "PASS" : "FAIL";
}

// ── C: explicit intent + native tool_calls — no repair ───────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Search", { query: "executeChatCompletion" }),
        usage: NATIVE_USAGE,
      }),
      () => ({
        ...nativeToolCompletion("Read", { path: "SHOULD_NOT_RUN.ts" }),
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
    "req_p1055_c"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.tool_calls?.[0]?.function?.name === "Search" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "C. native tool_calls already — provider=1", meta);
  caseResults.C = ok ? "PASS" : "FAIL";
}

// ── D: explicit intent + plain text → native repair tool_calls ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "我先确认隔离目录里已有内容，再开始…",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        if (!isNativeRepairOutbound(ctx.json ?? {})) {
          return {
            kind: "completion",
            content: "expected native repair outbound",
            usage: REPAIR_USAGE,
          };
        }
        return {
          ...nativeToolCompletion("Search", {
            query: "executeChatCompletion",
          }),
          usage: REPAIR_USAGE,
        };
      },
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
    },
    "req_p1055_d"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  const ok =
    result.ok === true &&
    Array.isArray(m?.tool_calls) &&
    m.tool_calls.length >= 1 &&
    m.tool_calls[0]?.function?.name === "Search" &&
    m.content == null &&
    meta.providerCallCount === 2 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0;
  assert(ok, "D. native repair succeeds — provider=2 debit=1", {
    ...meta,
    toolName: m?.tool_calls?.[0]?.function?.name,
    contentIsNull: m?.content == null,
  });
  caseResults.D = ok ? "PASS" : "FAIL";
}

// ── E: native repair still plain text → one shot then emulated ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain first",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        if (!isNativeRepairOutbound(ctx.json ?? {})) {
          return {
            kind: "completion",
            content: "not native repair",
            usage: REPAIR_USAGE,
          };
        }
        return {
          kind: "completion",
          content: "still plain after native repair",
          finish_reason: "stop",
          usage: REPAIR_USAGE,
        };
      },
      (ctx) => {
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (!flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: "emulated missing",
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
      () => ({
        kind: "completion",
        content: "LOOP",
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
    "req_p1055_e"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    msg(result).tool_calls[0]?.function?.name === "Search" &&
    meta.providerCallCount === 3 &&
    meta.debitCallCount === 1 &&
    // P1048 force-required compile uses REPAIR_MARKER (counted as repair).
    ((meta.arbitrationCallCount ?? 0) >= 1 || meta.repairCallCount >= 1);
  assert(ok, "E. native repair once then emulated — provider=3", meta);
  caseResults.E = ok ? "PASS" : "FAIL";
}

// ── F: Round-2 resume — no first-turn native repair ──────────────────────
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
        ...nativeToolCompletion("Search", { query: "SHOULD_NOT_RUN" }),
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
    "req_p1055_f"
  );
  const meta = billingSnapshot(result);
  const ok =
    v.ok === true &&
    result.ok === true &&
    msg(result)?.content === "done after tools" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "F. resume round — no P1055 first-turn repair", {
    ...meta,
    transcriptOk: v.ok,
  });
  caseResults.F = ok ? "PASS" : "FAIL";
}

// ── G: Gemini emulated path unchanged (no native repair) ─────────────────
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
            content: "gemini path missing emulated compile",
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
        ...nativeToolCompletion("Search", { query: "SHOULD_NOT_RUN" }),
        usage: REPAIR_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: EXPLICIT_EXEC_PROMPT }],
      tools: CURSOR_AGENT_TOOLS,
      tool_choice: "auto",
    },
    "req_p1055_g"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1;
  assert(ok, "G. Gemini emulated — no native repair loop", meta);
  caseResults.G = ok ? "PASS" : "FAIL";
}

// ── H: invalid transcript — provider=0 debit=0 ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "SHOULD_NOT_RUN",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = [
    { role: "user", content: EXPLICIT_EXEC_PROMPT },
    assistantTools([tc("call_bad", "Search", { query: "x" })]),
    toolMsg("call_OTHER", { ok: false }),
  ];
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: CURSOR_AGENT_TOOLS,
    },
    "req_p1055_h"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === false &&
    meta.providerCallCount === 0 &&
    meta.debitCallCount === 0;
  assert(ok, "H. invalid transcript — provider=0 debit=0", meta);
  caseResults.H = ok ? "PASS" : "FAIL";
}

// ── I: explicit named tool_choice — not overridden by P1055 ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain with named choice",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        // Strict emulated repair (not P1055 native-intent path).
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: makeToolCallIntent("Read", { path: "forced.ts" }),
            usage: REPAIR_USAGE,
          };
        }
        return {
          ...nativeToolCompletion("Read", { path: "forced.ts" }),
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
      tool_choice: { type: "function", function: { name: "Read" } },
    },
    "req_p1055_i"
  );
  const meta = billingSnapshot(result);
  const name = msg(result)?.tool_calls?.[0]?.function?.name;
  const ok =
    result.ok === true &&
    name === "Read" &&
    meta.debitCallCount === 1;
  assert(ok, "I. named tool_choice not covered by P1055", {
    ...meta,
    toolName: name,
  });
  caseResults.I = ok ? "PASS" : "FAIL";
}

// ── J: tool_choice=required — not lowered to auto ────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain under required",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      (ctx) => {
        const flat = (ctx.json.messages ?? [])
          .map((m: any) => String(m?.content ?? ""))
          .join("\n");
        if (flat.includes("Available tools")) {
          return {
            kind: "completion",
            content: makeToolCallIntent("Terminal", { command: "npm test" }),
            usage: REPAIR_USAGE,
          };
        }
        return {
          ...nativeToolCompletion("Terminal", { command: "npm test" }),
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
      tool_choice: "required",
    },
    "req_p1055_j"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    Array.isArray(msg(result)?.tool_calls) &&
    meta.debitCallCount === 1;
  assert(ok, "J. required semantics preserved", meta);
  caseResults.J = ok ? "PASS" : "FAIL";
}

console.log("\nCASE_SUMMARY", JSON.stringify(caseResults));
if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
