/**
 * P1036 — Cursor Round-2+ multi-tool continuation (P1047 single-pass).
 *
 * P1047 CLOSED resume continuation arbitration: on a legal role=tool resume,
 * valid native text or next tool_calls are FINAL (provider=1, arbitration=0).
 * Novel next-tool success paths use native tool_calls directly. Transcript-
 * level anti-replay 400s (duplicate / unmatched / missing) remain.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL Cursor transcript validator + signature anti-replay
 *   REAL SSE mapper
 *   REAL billable usage aggregation
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1036-cursor-round2-multi-tool-continuation.mts
 *
 * Marker: TOKFAI_P1036_CURSOR_ROUND2_MULTI_TOOL_CONTINUATION_PASS
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
  loadRespondEarlySse,
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const { respondChatCompletionEarlySse } = await loadRespondEarlySse();
const {
  shouldAttemptAutoToolIntentArbitration,
  shouldAttemptResumeToolContinuationArbitration,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  extractCompletedToolSignatures,
  toolCallSignature,
  DUPLICATE_TOOL_RESULT_CODE,
  INVALID_TOOL_CALL_ID_CODE,
  MISSING_TOOL_RESULT_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1036_CURSOR_ROUND2_MULTI_TOOL_CONTINUATION_PASS";
const FAIL = "TOKFAI_P1036_CURSOR_ROUND2_MULTI_TOOL_CONTINUATION_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL transcript/signature anti-replay + REAL SSE + REAL billable aggregation + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
};

let failed = 0;
const classifications: Array<{ id: string; ok: boolean; note: string }> = [];

function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(JSON.stringify({ level: meta.level ?? LEVEL, ...meta }, null, 2));
  classifications.push({ id: label, ok: true, note: "PASS" });
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  classifications.push({ id: label, ok: false, note: detail ?? "FAIL" });
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
function toolName(result: any): string | null {
  return msg(result)?.tool_calls?.[0]?.function?.name ?? null;
}
function toolArgs(result: any): Record<string, unknown> | null {
  const raw = msg(result)?.tool_calls?.[0]?.function?.arguments;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
function toolId(result: any): string | null {
  return msg(result)?.tool_calls?.[0]?.id ?? null;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1036",
    clientStream: false,
  });
}

function mockContext() {
  return {
    header() {},
    json(body: unknown, status?: number) {
      return new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
    req: { header: () => undefined },
    get: () => undefined,
    set() {},
  } as any;
}

async function readSse(res: Response) {
  const text = await res.text();
  const events: unknown[] = [];
  for (const block of text.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const raw = line.slice(6);
    if (raw === "[DONE]") {
      events.push("[DONE]");
      continue;
    }
    try {
      events.push(JSON.parse(raw));
    } catch {
      events.push(raw);
    }
  }
  return events;
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

function debitTokens() {
  const e = getCounts().lastDebitEntry;
  return {
    prompt_tokens: Number(e?.prompt_tokens ?? 0),
    completion_tokens: Number(e?.completion_tokens ?? 0),
    credits_charged: Number(e?.credits_charged ?? 0),
  };
}

console.log("P1036 CURSOR ROUND-2 MULTI-TOOL (P1047 SINGLE-PASS)\n");

// ── Unit gates ───────────────────────────────────────────────────────────
{
  assert(
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
    }) === false,
    "unit.P1028 first-turn AUTO still disabled on resumeToolRound",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT",
    }
  );
  assert(
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
    "unit.P1036 continuation gate closed (P1047)",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT",
    }
  );
  const sigA = toolCallSignature("Read", { path: "a.ts" });
  const sigB = toolCallSignature("Read", { path: "b.ts" });
  const sigAAgain = toolCallSignature("Read", { path: "a.ts" });
  assert(
    sigA !== sigB && sigA === sigAAgain,
    "unit.same tool different args → distinct signatures; same args equal",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      sigA,
      sigB,
    }
  );
}

// ── A. Round-1 native Read A ─────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Read", { path: "a.ts" }, { id: "call_r1_a" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "read a then b" }],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_a"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      toolName(result) === "Read" &&
      toolArgs(result)?.path === "a.ts" &&
      msg(result)?.content === null &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "A. Round-1 native Read A — provider=1 arbitration=0 debit=1",
    meta
  );
}

// ── B. Round-2: native directly returns Read B ───────────────────────────
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
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read a then b" },
        assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
        toolMsg("call_r1_a", { text: "contents of a" }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_b"
  );
  const meta = billingSnapshot(result);
  const idB = toolId(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      toolName(result) === "Read" &&
      toolArgs(result)?.path === "b.ts" &&
      toolArgs(result)?.path !== "a.ts" &&
      msg(result)?.content === null &&
      choice(result)?.finish_reason === "tool_calls" &&
      typeof idB === "string" &&
      idB !== "call_r1_a" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens,
    "B. Round-2 native Read B — provider=1 arb=0 debit=1 native-only",
    { ...meta, idB, debitTokens: tok }
  );
}

// ── C. Round-3: native final plain text ──────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "both files summarized",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read a then b" },
        assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
        toolMsg("call_r1_a", { text: "a" }),
        assistantTools([tc("call_r2_b", "Read", { path: "b.ts" })]),
        toolMsg("call_r2_b", { text: "b" }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_c"
  );
  const meta = billingSnapshot(result);
  const content = msg(result)?.content;
  assert(
    result.ok === true &&
      !msg(result)?.tool_calls &&
      content === "both files summarized" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "C. Round-3 native final text — arb=0 debit=1",
    { ...meta, content }
  );
}

// ── D. resume native plain text FINAL (arb replay path closed) ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native wants to stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "done?" },
        assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
        toolMsg("call_r1_a", { text: "a" }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_d"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "native wants to stop" &&
      !msg(result)?.tool_calls &&
      toolId(result) == null &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "D. resume native plain text FINAL — arb=0 (replay anti-replay is transcript-level)",
    meta
  );
}

// ── E. same Read tool, different path — native tool_calls ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "other.ts" },
          { id: "call_e_other" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read more" },
        assistantTools([tc("call_e1", "Read", { path: "a.ts" })]),
        toolMsg("call_e1", "a"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_e"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      toolName(result) === "Read" &&
      toolArgs(result)?.path === "other.ts" &&
      toolId(result) !== "call_e1" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "E. same Read tool, different path — native tool_calls; arb=0",
    meta
  );
}

// ── F. Read → Write → final ──────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Write",
          { path: "out.ts", contents: "x" },
          { id: "call_f_write" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r2 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read then write" },
        assistantTools([tc("call_f_read", "Read", { path: "in.ts" })]),
        toolMsg("call_f_read", "in"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_f2"
  );
  const idWrite = toolId(r2);
  const meta2 = billingSnapshot(r2);
  assert(
    r2.ok === true &&
      toolName(r2) === "Write" &&
      typeof idWrite === "string" &&
      idWrite !== "call_f_read" &&
      (meta2.arbitrationCallCount ?? 0) === 0 &&
      meta2.providerCallCount === 1,
    "F. Read → Write native — distinct ids; arb=0",
    { ...meta2, idWrite }
  );

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "write complete",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r3 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read then write" },
        assistantTools([tc("call_f_read", "Read", { path: "in.ts" })]),
        toolMsg("call_f_read", "in"),
        assistantTools([
          tc("call_f_write", "Write", { path: "out.ts", contents: "x" }),
        ]),
        toolMsg("call_f_write", { ok: true }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_f3"
  );
  const meta3 = billingSnapshot(r3);
  assert(
    r3.ok === true &&
      msg(r3)?.content === "write complete" &&
      !msg(r3)?.tool_calls &&
      (meta3.arbitrationCallCount ?? 0) === 0,
    "F. Write → final native text; arb=0",
    meta3
  );
}

// ── G. duplicate tool result ─────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "no", usage: NATIVE_USAGE }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "d" },
        assistantTools([tc("call_dup", "Read", { path: "d" })]),
        toolMsg("call_dup", "1"),
        toolMsg("call_dup", "2"),
      ],
      tools: AGENT_FILE_TOOLS,
    },
    "req_p1036_g"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === DUPLICATE_TOOL_RESULT_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "G. duplicate tool result → 400 provider=0 debit=0",
    meta
  );
}

// ── H. unmatched tool_call_id ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "no", usage: NATIVE_USAGE }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_real", "Read", { path: "a" })]),
        toolMsg("call_bogus", "x"),
      ],
      tools: AGENT_FILE_TOOLS,
    },
    "req_p1036_h"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === INVALID_TOOL_CALL_ID_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "H. unmatched tool_call_id → 400 provider=0 debit=0",
    meta
  );
}

// ── I. missing tool result ───────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "no", usage: NATIVE_USAGE }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "m" },
        assistantTools([
          tc("call_m1", "Read", { path: "a" }),
          tc("call_m2", "Read", { path: "b" }),
        ]),
        toolMsg("call_m1", "only one"),
      ],
      tools: AGENT_FILE_TOOLS,
    },
    "req_p1036_i"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === MISSING_TOOL_RESULT_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "I. missing tool result → 400 provider=0 debit=0",
    meta
  );
}

// ── J. resume native plain text FINAL ────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native placeholder",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "j" },
        assistantTools([tc("call_j", "Read", { path: "j" })]),
        toolMsg("call_j", "j"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_j"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "native placeholder" &&
      !msg(result)?.tool_calls &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "J. resume native plain text FINAL — no forged tools; arb=0",
    meta
  );
}

// ── K. resume native plain text FINAL (no arb invalid-JSON path) ─────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "keep this native text",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "k" },
        assistantTools([tc("call_k", "Read", { path: "k" })]),
        toolMsg("call_k", "k"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_k"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "keep this native text" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "K. resume native plain text FINAL — arb=0 debit=1",
    meta
  );
}

// ── L. resume native plain text FINAL (no arb timeout path) ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
    },
    scripts: [
      () => ({
        kind: "completion",
        content: "native before timeout",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "l" },
        assistantTools([tc("call_l", "Read", { path: "l" })]),
        toolMsg("call_l", "l"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_l"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "native before timeout" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "L. resume native plain text FINAL — arb=0; no budget resurrection",
    meta
  );
}

// ── M. SSE second tool call — native ─────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "sse-b.ts" },
          { id: "call_sse_b" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1036_m",
    body: {
      model: "gpt-5.5",
      stream: true,
      messages: [
        { role: "user", content: "sse" },
        assistantTools([tc("call_sse_a", "Read", { path: "sse-a.ts" })]),
        toolMsg("call_sse_a", "a"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    } as any,
    limitKey: "p1036-m",
    idempotencyKey: null,
  });
  const events = await readSse(res);
  const doneEvents = events.filter((e) => e === "[DONE]").length;
  const finish = events.find(
    (e) =>
      e &&
      typeof e === "object" &&
      (e as any)?.choices?.[0]?.finish_reason === "tool_calls"
  );
  const hasDeltaTool = events.some(
    (e) =>
      e &&
      typeof e === "object" &&
      JSON.stringify(e).includes("sse-b.ts")
  );
  const argsAreString = events.some((e) => {
    if (!e || typeof e !== "object") return false;
    const delta = (e as any)?.choices?.[0]?.delta;
    const tcs = delta?.tool_calls;
    if (!Array.isArray(tcs)) return false;
    return tcs.some(
      (t: any) =>
        t?.function && typeof t.function.arguments === "string"
    );
  });
  const meta = {
    providerCallCount: getCounts().providerCallCount,
    repairCallCount: getCounts().repairCallCount,
    arbitrationCallCount: getCounts().arbitrationCallCount,
    fallbackCount: getCounts().fallbackCount,
    debitCallCount: getCounts().debitCallCount,
    httpStatus: res.status,
  };
  assert(
    res.status === 200 &&
      hasDeltaTool &&
      argsAreString &&
      !!finish &&
      doneEvents === 1 &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "M. SSE second tool_call native — delta.tool_calls + args string + [DONE]×1; arb=0",
    { ...meta, doneEvents, hasDeltaTool, argsAreString }
  );
}

// ── N. non-stream second tool call — native ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "n-b.ts" },
          { id: "call_n_b" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "n" },
        assistantTools([tc("call_n_a", "Read", { path: "n-a.ts" })]),
        toolMsg("call_n_a", "a"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_n"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      m?.content === null &&
      Array.isArray(m?.tool_calls) &&
      m.tool_calls.length === 1 &&
      m.tool_calls[0]?.function?.name === "Read" &&
      typeof m.tool_calls[0]?.function?.arguments === "string" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "N. non-stream second tool native — content=null + legal tool_calls; arb=0",
    meta
  );
}

// ── O. usage single-pass native debit ────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "o-b.ts" },
          { id: "call_o_b" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "o" },
        assistantTools([tc("call_o_a", "Read", { path: "o-a.ts" })]),
        toolMsg("call_o_a", "a"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_o"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      tok.completion_tokens === NATIVE_USAGE.completion_tokens &&
      tok.credits_charged > 0,
    "O. usage single-pass — native tokens; debitCallCount=1; arb=0",
    { ...meta, debitTokens: tok }
  );
}

// ── P. three continuous tools Read A→B→C→final (native each round) ───────
{
  // Round-2: A done → B
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "p-b.ts" },
          { id: "call_p_b" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r2 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "A B C" },
        assistantTools([tc("call_p_a", "Read", { path: "p-a.ts" })]),
        toolMsg("call_p_a", "a"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_p2"
  );
  const idB = toolId(r2);
  const meta2 = billingSnapshot(r2);

  // Round-3: A+B done → C
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion(
          "Read",
          { path: "p-c.ts" },
          { id: "call_p_c" }
        ),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r3 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "A B C" },
        assistantTools([tc("call_p_a", "Read", { path: "p-a.ts" })]),
        toolMsg("call_p_a", "a"),
        assistantTools([tc("call_p_b", "Read", { path: "p-b.ts" })]),
        toolMsg("call_p_b", "b"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_p3"
  );
  const idC = toolId(r3);
  const meta3 = billingSnapshot(r3);

  // Round-4: final
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "all three done",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r4 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "A B C" },
        assistantTools([tc("call_p_a", "Read", { path: "p-a.ts" })]),
        toolMsg("call_p_a", "a"),
        assistantTools([tc("call_p_b", "Read", { path: "p-b.ts" })]),
        toolMsg("call_p_b", "b"),
        assistantTools([tc("call_p_c", "Read", { path: "p-c.ts" })]),
        toolMsg("call_p_c", "c"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1036_p4"
  );
  const meta4 = billingSnapshot(r4);

  const completed = extractCompletedToolSignatures([
    { role: "user", content: "A B C" },
    assistantTools([tc("call_p_a", "Read", { path: "p-a.ts" })]),
    toolMsg("call_p_a", "a"),
    assistantTools([tc("call_p_b", "Read", { path: "p-b.ts" })]),
    toolMsg("call_p_b", "b"),
    assistantTools([tc("call_p_c", "Read", { path: "p-c.ts" })]),
    toolMsg("call_p_c", "c"),
  ]);

  assert(
    r2.ok === true &&
      toolArgs(r2)?.path === "p-b.ts" &&
      (meta2.arbitrationCallCount ?? 0) === 0 &&
      meta2.providerCallCount === 1 &&
      r3.ok === true &&
      toolArgs(r3)?.path === "p-c.ts" &&
      (meta3.arbitrationCallCount ?? 0) === 0 &&
      meta3.providerCallCount === 1 &&
      idB !== "call_p_a" &&
      idC !== idB &&
      idC !== "call_p_a" &&
      r4.ok === true &&
      msg(r4)?.content === "all three done" &&
      !msg(r4)?.tool_calls &&
      (meta4.arbitrationCallCount ?? 0) === 0 &&
      meta4.providerCallCount === 1 &&
      completed.size === 3,
    "P. Read A→B→C→final native each round — distinct ids; arb=0; no loop",
    {
      ...meta4,
      idB,
      idC,
      completedCount: completed.size,
      r2ok: r2.ok,
      r3ok: r3.ok,
      meta2,
      meta3,
    }
  );
}

// ── Matrix summary ───────────────────────────────────────────────────────
console.log("\n── provider / arbitration / debit scene matrix ──");
console.log(
  JSON.stringify(
    {
      A_round1_native: { provider: 1, arbitration: 0, debit: 1 },
      B_round2_native_tool: { provider: 1, arbitration: 0, debit: 1 },
      C_round3_final: { provider: 1, arbitration: 0, debit: 1 },
      D_resume_text: { provider: 1, arbitration: 0, debit: 1 },
      E_native_other_path: { provider: 1, arbitration: 0 },
      F_native_write: { provider: 1, arbitration: 0 },
      G_dup: { provider: 0, arbitration: 0, debit: 0 },
      H_unmatched: { provider: 0, arbitration: 0, debit: 0 },
      I_missing: { provider: 0, arbitration: 0, debit: 0 },
      J_resume_text: { provider: 1, arbitration: 0 },
      K_resume_text: { provider: 1, arbitration: 0, debit: 1 },
      L_resume_text: { provider: 1, arbitration: 0, debit: 1 },
      M_sse_native: { provider: 1, arbitration: 0, debit: 1 },
      N_native_tool: { provider: 1, arbitration: 0 },
      O_native_usage: { provider: 1, arbitration: 0, debit: 1 },
      P_abc_native: { provider: 1, arbitration: 0 },
    },
    null,
    2
  )
);

console.log("\n── classification ──");
for (const row of classifications) {
  console.log(`${row.ok ? "OK" : "NG"}  ${row.id}`);
}

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}

console.log(`\n${PASS}`);
process.exit(0);
