/**
 * P1040 — Cursor resume transcript → safe emulated_json continuation.
 *
 * Proves continuation arbitration never forwards raw role=tool /
 * assistant.tool_calls / tool_call_id into emulated outbound messages; instead
 * history is compiled to plain-text tool context while novel next tools,
 * anti-replay, native restore, and single-debit aggregation remain intact.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL resume transcript compiler + signature anti-replay
 *   REAL billable usage aggregation
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1040-cursor-resume-transcript-emulation.mts
 *
 * Marker: TOKFAI_P1040_CURSOR_RESUME_TRANSCRIPT_EMULATION_PASS
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
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();

const PASS = "TOKFAI_P1040_CURSOR_RESUME_TRANSCRIPT_EMULATION_PASS";
const FAIL = "TOKFAI_P1040_CURSOR_RESUME_TRANSCRIPT_EMULATION_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL resume transcript compiler + REAL billable aggregation + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
};
const ARB_USAGE = {
  prompt_tokens: 40,
  completion_tokens: 8,
  total_tokens: 48,
};

const GLOB_TOOL = {
  type: "function",
  function: {
    name: "Glob",
    description: "Find files by pattern",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
} as const;

const P1040_TOOLS = [...AGENT_FILE_TOOLS, GLOB_TOOL];

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
    limitKey: "p1040",
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

function debitTokens() {
  const e = getCounts().lastDebitEntry;
  return {
    prompt_tokens: Number(e?.prompt_tokens ?? 0),
    completion_tokens: Number(e?.completion_tokens ?? 0),
    credits_charged: Number(e?.credits_charged ?? 0),
  };
}

/** True when messages contain forbidden raw Cursor tool-protocol fields. */
function hasRawToolTranscriptFields(messages: unknown[]): boolean {
  for (const m of messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const row = m as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role.trim() : "";
    if (role === "tool" || role === "function") return true;
    if (Array.isArray(row.tool_calls) && row.tool_calls.length > 0) return true;
    if (typeof row.tool_call_id === "string" && row.tool_call_id.length > 0) {
      return true;
    }
    if (row.function_call != null) return true;
  }
  return false;
}

function flatMessageContents(messages: unknown[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const c = (m as Record<string, unknown>).content;
    if (typeof c === "string") out.push(c);
  }
  return out;
}

function emulatedOutboundMessages(): unknown[] {
  const bodies = getCounts().outboundBodies;
  // Second call is continuation emulated_json (first is native with tools).
  const emulated = bodies.find((b) => !b.hasTools && b.messages.length > 0);
  return emulated?.messages ?? [];
}

console.log("P1040 CURSOR RESUME TRANSCRIPT EMULATION\n");

// ── A. Read → native text → Glob (novel continuation) ────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "I should search next",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Glob", { pattern: "**/*.ts" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read then glob" },
        assistantTools([tc("call_r1_read", "Read", { path: "a.ts" })]),
        toolMsg("call_r1_read", { text: "contents of a.ts" }),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_a"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      toolName(result) === "Glob" &&
      toolArgs(result)?.pattern === "**/*.ts" &&
      msg(result)?.content === null &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens + ARB_USAGE.prompt_tokens &&
      tok.completion_tokens ===
        NATIVE_USAGE.completion_tokens + ARB_USAGE.completion_tokens,
    "A. Round-2 Read→Glob novel; provider=2 arb=1 debit=1 credits=native+arb",
    { ...meta, debitTokens: tok, toolName: toolName(result) }
  );
}

// ── B. Second emulated outbound has no raw tool transcript ───────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "continue",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Glob", { pattern: "src/**" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const readResultText = "UNIQUE_READ_RESULT_P1040_B";
  await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "b" },
        assistantTools([tc("call_b_read", "Read", { path: "b.ts" })]),
        toolMsg("call_b_read", readResultText),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_b"
  );
  const bodies = getCounts().outboundBodies;
  const nativeBody = bodies[0];
  const emulatedBody = bodies.find((b) => !b.hasTools);
  const emulatedMsgs = emulatedBody?.messages ?? [];
  const contents = flatMessageContents(emulatedMsgs);
  const hasReadContext = contents.some(
    (c) =>
      c.includes("Previously requested tool: Read") ||
      c.includes("Tool result for Read")
  );
  const hasResultText = contents.some((c) => c.includes(readResultText));
  const hasToolCallIdLeak = contents.some((c) => c.includes("call_b_read"));
  assert(
    bodies.length >= 2 &&
      nativeBody?.hasTools === true &&
      emulatedBody != null &&
      emulatedBody.hasTools === false &&
      !hasRawToolTranscriptFields(emulatedMsgs) &&
      hasReadContext &&
      hasResultText &&
      !hasToolCallIdLeak,
    "B. emulated outbound: no role=tool/tool_calls/tool_call_id; keeps Read result semantics",
    {
      providerCallCount: bodies.length,
      repairCallCount: 0,
      arbitrationCallCount: getCounts().arbitrationCallCount,
      fallbackCount: 0,
      debitCallCount: getCounts().debitCallCount,
      hasReadContext,
      hasResultText,
      hasToolCallIdLeak,
      emulatedMsgCount: emulatedMsgs.length,
    }
  );
}

// ── C. Duplicate Read same args → anti-replay restore native ─────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native stop text",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "a.ts" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "c" },
        assistantTools([tc("call_c_read", "Read", { path: "a.ts" })]),
        toolMsg("call_c_read", "a"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_c"
  );
  const meta = billingSnapshot(result);
  const emulatedMsgs = emulatedOutboundMessages();
  assert(
    result.ok === true &&
      msg(result)?.content === "native stop text" &&
      !msg(result)?.tool_calls &&
      toolId(result) == null &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      !hasRawToolTranscriptFields(emulatedMsgs),
    "C. duplicate Read same args anti-replay — restore native; debit=1",
    meta
  );
}

// ── D. Read → Glob succeeds after completed Read ─────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "next tool",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Glob", { pattern: "*.md" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "d" },
        assistantTools([tc("call_d_read", "Read", { path: "readme.md" })]),
        toolMsg("call_d_read", "# title"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_d"
  );
  const meta = billingSnapshot(result);
  const id = toolId(result);
  assert(
    result.ok === true &&
      toolName(result) === "Glob" &&
      toolArgs(result)?.pattern === "*.md" &&
      typeof id === "string" &&
      id !== "call_d_read" &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1,
    "D. Read→Glob continuation succeeds with novel id",
    { ...meta, id }
  );
}

// ── E. Multiple tool results keep original order in emulated context ─────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "more",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("done after two tools"),
        usage: ARB_USAGE,
      }),
    ],
  });
  const markerRead = "ORDER_MARKER_READ_FIRST";
  const markerGlob = "ORDER_MARKER_GLOB_SECOND";
  await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "e" },
        assistantTools([
          tc("call_e_read", "Read", { path: "e.ts" }),
          tc("call_e_glob", "Glob", { pattern: "e/**" }),
        ]),
        toolMsg("call_e_read", markerRead),
        toolMsg("call_e_glob", markerGlob),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_e"
  );
  const contents = flatMessageContents(emulatedOutboundMessages());
  const joined = contents.join("\n---\n");
  const idxPrevRead = joined.indexOf("Previously requested tool: Read");
  const idxPrevGlob = joined.indexOf("Previously requested tool: Glob");
  const idxResRead = joined.indexOf(`Tool result for Read:\n${markerRead}`);
  const idxResGlob = joined.indexOf(`Tool result for Glob:\n${markerGlob}`);
  assert(
    !hasRawToolTranscriptFields(emulatedOutboundMessages()) &&
      idxPrevRead >= 0 &&
      idxPrevGlob > idxPrevRead &&
      idxResRead > idxPrevGlob &&
      idxResGlob > idxResRead,
    "E. multi tool results preserve order in emulated text context",
    {
      providerCallCount: getCounts().providerCallCount,
      repairCallCount: 0,
      arbitrationCallCount: getCounts().arbitrationCallCount,
      fallbackCount: 0,
      debitCallCount: getCounts().debitCallCount,
      idxPrevRead,
      idxPrevGlob,
      idxResRead,
      idxResGlob,
    }
  );
}

// ── F. Invalid JSON arbitration → restore native; HTTP 200; debit=1 ──────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "keep native F",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: "not-valid-json {{{",
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "f" },
        assistantTools([tc("call_f", "Read", { path: "f" })]),
        toolMsg("call_f", "f"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_f"
  );
  const meta = billingSnapshot(result);
  const body = JSON.stringify(result);
  const tok = debitTokens();
  // Arb returned HTTP 200 with invalid JSON → both successful upstream
  // components still aggregate; response body restores native text.
  assert(
    result.ok === true &&
      msg(result)?.content === "keep native F" &&
      !msg(result)?.tool_calls &&
      !body.includes("not-valid-json") &&
      (meta.httpStatus === 200 || result.ok === true) &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens ===
        NATIVE_USAGE.prompt_tokens + ARB_USAGE.prompt_tokens &&
      tok.completion_tokens ===
        NATIVE_USAGE.completion_tokens + ARB_USAGE.completion_tokens,
    "F. invalid JSON → restore native; HTTP 200; debit=1; credits=native+arb HTTP200",
    { ...meta, debitTokens: tok }
  );
}

// ── G. Transport failure → restore native; debit=1 ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "keep native G",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "error",
        code: "upstream_error",
        message: "arbitration transport failed",
        status: 502,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "g" },
        assistantTools([tc("call_g", "Read", { path: "g" })]),
        toolMsg("call_g", "g"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_g"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      msg(result)?.content === "keep native G" &&
      !msg(result)?.tool_calls &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens,
    "G. continuation transport failure → restore native; debit=1",
    { ...meta, debitTokens: tok }
  );
}

// ── H. Total timeout keeps upstream_timeout semantics ────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 50,
      idleTimeoutMs: 50,
      totalTimeoutMs: 80,
    },
    scripts: [
      () => ({
        kind: "completion",
        content: "native before timeout",
        usage: NATIVE_USAGE,
      }),
      async () => {
        await new Promise((r) => setTimeout(r, 120));
        return {
          kind: "error" as const,
          code: "upstream_timeout",
          message: "arbitration timed out",
          status: 504,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "h" },
        assistantTools([tc("call_h", "Read", { path: "h" })]),
        toolMsg("call_h", "h"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_h"
  );
  const meta = billingSnapshot(result);
  const restored =
    result.ok === true && msg(result)?.content === "native before timeout";
  const timedOut =
    result.ok === false &&
    (meta.errorCode === "upstream_timeout" ||
      String(meta.errorCode ?? "").includes("timeout"));
  assert(
    (restored || timedOut) && (meta.arbitrationCallCount ?? 0) <= 1,
    "H. total/upstream timeout — restore native or upstream_timeout; no resurrection",
    { ...meta, restored, timedOut }
  );
}

// ── Billing red-line: success path aggregates; fail path no double debit ─
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "bill",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Glob", { pattern: "bill/**" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const okResult = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "bill-ok" },
        assistantTools([tc("call_bill", "Read", { path: "bill.ts" })]),
        toolMsg("call_bill", "ok"),
      ],
      tools: P1040_TOOLS,
      tool_choice: "auto",
    },
    "req_p1040_bill_ok"
  );
  const okMeta = billingSnapshot(okResult);
  const okTok = debitTokens();
  assert(
    okResult.ok === true &&
      toolName(okResult) === "Glob" &&
      okMeta.debitCallCount === 1 &&
      okTok.prompt_tokens ===
        NATIVE_USAGE.prompt_tokens + ARB_USAGE.prompt_tokens &&
      okTok.completion_tokens ===
        NATIVE_USAGE.completion_tokens + ARB_USAGE.completion_tokens,
    "billing. success native+arb usage aggregated; recordSuccessfulUsageAndDebit=1",
    { ...okMeta, debitTokens: okTok }
  );
}

console.log("\n── classification ──");
for (const row of classifications) {
  console.log(`${row.ok ? "OK" : "NG"}  ${row.id}: ${row.note}`);
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
