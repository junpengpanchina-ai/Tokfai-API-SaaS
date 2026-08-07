/**
 * P1040 — Cursor resume transcript → safe emulated_json compiler (unit) +
 * single-pass native resume (P1047).
 *
 * P1047 closed auto/missing continuation arbitration: valid native text or
 * tool_calls on resume is FINAL (provider=1 arb=0). Emulated resume transcript
 * sanitization remains covered via compileEmulatedResumeTranscript /
 * transformResumeTranscriptMessages unit tests (no live second-pass arb).
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY (native single-pass resume)
 *   REAL resume transcript compiler helpers (unit)
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
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  transformResumeTranscriptMessages,
  compileEmulatedResumeTranscript,
} = await import("../apps/dmit-api/src/lib/toolIntentCompiler.ts");
const {
  extractCompletedToolSignatures,
  extractHistoricalToolCallIds,
  filterNovelToolCallsOnCompletion,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1040_CURSOR_RESUME_TRANSCRIPT_EMULATION_PASS";
const FAIL = "TOKFAI_P1040_CURSOR_RESUME_TRANSCRIPT_EMULATION_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL resume transcript compiler + REAL billable aggregation + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  total_tokens: 110,
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

console.log("P1040 CURSOR RESUME TRANSCRIPT EMULATION\n");

// ── Unit: transformResumeTranscriptMessages sanitizes tool protocol ──────
{
  const readResultText = "UNIQUE_READ_RESULT_P1040_B";
  const input = [
    { role: "user", content: "b" },
    assistantTools([tc("call_b_read", "Read", { path: "b.ts" })]),
    toolMsg("call_b_read", readResultText),
  ];
  const inputBefore = JSON.stringify(input);
  const transformed = transformResumeTranscriptMessages(input);
  const contents = flatMessageContents(transformed);
  const hasReadContext = contents.some(
    (c) =>
      c.includes("Previously requested tool: Read") ||
      c.includes("Tool result for Read")
  );
  const hasResultText = contents.some((c) => c.includes(readResultText));
  const hasToolCallIdLeak = contents.some((c) => c.includes("call_b_read"));
  assert(
    JSON.stringify(input) === inputBefore &&
      !hasRawToolTranscriptFields(transformed) &&
      hasReadContext &&
      hasResultText &&
      !hasToolCallIdLeak,
    "unit.B transformResumeTranscriptMessages: no role=tool/tool_calls/tool_call_id; keeps Read result semantics",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      hasReadContext,
      hasResultText,
      hasToolCallIdLeak,
      transformedMsgCount: transformed.length,
      level: "UNIT transformResumeTranscriptMessages",
    }
  );
}

// ── Unit: compileEmulatedResumeTranscript preserves multi-tool order ─────
{
  const markerRead = "ORDER_MARKER_READ_FIRST";
  const markerGlob = "ORDER_MARKER_GLOB_SECOND";
  const messages = [
    { role: "user", content: "e" },
    assistantTools([
      tc("call_e_read", "Read", { path: "e.ts" }),
      tc("call_e_glob", "Glob", { pattern: "e/**" }),
    ]),
    toolMsg("call_e_read", markerRead),
    toolMsg("call_e_glob", markerGlob),
  ];
  const messagesBefore = JSON.stringify(messages);
  const compiled = compileEmulatedResumeTranscript(
    { model: "gpt-5.5", messages },
    { model: "gpt-5.5", messages, tools: P1040_TOOLS, tool_choice: "auto" }
  );
  const compiledMsgs = Array.isArray(compiled.messages)
    ? (compiled.messages as unknown[])
    : [];
  const contents = flatMessageContents(compiledMsgs);
  const joined = contents.join("\n---\n");
  const idxPrevRead = joined.indexOf("Previously requested tool: Read");
  const idxPrevGlob = joined.indexOf("Previously requested tool: Glob");
  const idxResRead = joined.indexOf(`Tool result for Read:\n${markerRead}`);
  const idxResGlob = joined.indexOf(`Tool result for Glob:\n${markerGlob}`);
  assert(
    JSON.stringify(messages) === messagesBefore &&
      compiled.tools === undefined &&
      !hasRawToolTranscriptFields(compiledMsgs) &&
      idxPrevRead >= 0 &&
      idxPrevGlob > idxPrevRead &&
      idxResRead > idxPrevGlob &&
      idxResGlob > idxResRead,
    "unit.E compileEmulatedResumeTranscript: multi tool results preserve order; no raw tool fields",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      idxPrevRead,
      idxPrevGlob,
      idxResRead,
      idxResGlob,
      level: "UNIT compileEmulatedResumeTranscript",
    }
  );
}

// ── Unit: anti-replay drops duplicate Read same args ─────────────────────
{
  const history = [
    { role: "user", content: "c" },
    assistantTools([tc("call_c_read", "Read", { path: "a.ts" })]),
    toolMsg("call_c_read", "a"),
  ];
  const completedSignatures = extractCompletedToolSignatures(history);
  const historicalIds = extractHistoricalToolCallIds(history);
  const filtered = filterNovelToolCallsOnCompletion(
    {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_replay",
                type: "function",
                function: {
                  name: "Read",
                  arguments: JSON.stringify({ path: "a.ts" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
    { completedSignatures, historicalIds }
  );
  assert(
    filtered === null,
    "unit.C duplicate Read same args anti-replay — filterNovelToolCallsOnCompletion returns null",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      completedSignatures: [...completedSignatures],
      level: "UNIT filterNovelToolCallsOnCompletion",
    }
  );
}

// ── A. Read → native Glob (single-pass; P1047 no continuation arb) ───────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Glob", { pattern: "**/*.ts" }, { id: "call_a_glob" }),
        usage: NATIVE_USAGE,
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
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      tok.completion_tokens === NATIVE_USAGE.completion_tokens,
    "A. Round-2 Read→Glob novel; provider=1 arb=0 debit=1 credits=native",
    { ...meta, debitTokens: tok, toolName: toolName(result) }
  );
}

// ── D. Read → Glob succeeds after completed Read (single-pass) ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Glob", { pattern: "*.md" }, { id: "call_d_glob" }),
        usage: NATIVE_USAGE,
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
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1,
    "D. Read→Glob native single-pass succeeds with novel id",
    { ...meta, id }
  );
}

// ── F. Native plain text is FINAL under auto (no arb second pass) ────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "keep native F",
        usage: NATIVE_USAGE,
      }),
      // Must never be consumed under P1047 auto resume.
      () => ({
        kind: "completion",
        content: "not-valid-json {{{",
        usage: NATIVE_USAGE,
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
  assert(
    result.ok === true &&
      msg(result)?.content === "keep native F" &&
      !msg(result)?.tool_calls &&
      !body.includes("not-valid-json") &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      tok.completion_tokens === NATIVE_USAGE.completion_tokens,
    "F. native plain text FINAL; provider=1 arb=0 debit=1; no second pass",
    { ...meta, debitTokens: tok }
  );
}

// ── G. Native text FINAL — unused error script never runs ────────────────
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
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens,
    "G. native text FINAL under auto; unused transport-error script; debit=1",
    { ...meta, debitTokens: tok }
  );
}

// ── H. Total timeout — single native pass; arb never starts ──────────────
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
  assert(
    restored &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "H. native text FINAL under auto; arb never starts; no resurrection",
    { ...meta, restored }
  );
}

// ── Billing red-line: single-pass native success; debit=1 ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Glob", { pattern: "bill/**" }, { id: "call_bill_glob" }),
        usage: NATIVE_USAGE,
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
      okMeta.providerCallCount === 1 &&
      (okMeta.arbitrationCallCount ?? 0) === 0 &&
      okMeta.debitCallCount === 1 &&
      okTok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      okTok.completion_tokens === NATIVE_USAGE.completion_tokens,
    "billing. success native single-pass; recordSuccessfulUsageAndDebit=1",
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
