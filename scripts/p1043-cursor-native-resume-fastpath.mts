/**
 * P1043 — Cursor Native Resume Fast Path.
 *
 * Proves resumeToolRound native first-shot prefers immediate tool_calls
 * (via a request-scoped continuation instruction), skips continuation
 * arbitration when native already returns tool_calls, preserves P1036
 * fallback + P1041 exact-once billing, and never mutates clientBody.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL Cursor transcript / resume fast-path helpers
 *   REAL billable usage aggregation
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1043-cursor-native-resume-fastpath.mts
 *
 * Marker: TOKFAI_P1043_NATIVE_RESUME_FASTPATH_PASS
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
  makeNativeToolCalls,
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
  NATIVE_RESUME_CONTINUATION_INSTRUCTION,
  shouldApplyNativeResumeFastPath,
  applyNativeResumeFastPathInstruction,
  validateCursorToolTranscript,
  DUPLICATE_TOOL_RESULT_CODE,
  INVALID_TOOL_CALL_ID_CODE,
  MISSING_TOOL_RESULT_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1043_NATIVE_RESUME_FASTPATH_PASS";
const FAIL = "TOKFAI_P1043_NATIVE_RESUME_FASTPATH_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL resume fast-path + REAL billable aggregation + MOCK provider + MOCK/SPY billing";

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
function toolCallCount(result: any): number {
  const tcs = msg(result)?.tool_calls;
  return Array.isArray(tcs) ? tcs.length : 0;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1043",
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

function outboundHasFastPathInstruction(): boolean {
  const bodies = getCounts().outboundBodies;
  if (bodies.length === 0) return false;
  const native = bodies[0]!;
  const flat = (native.messages ?? [])
    .map((m) => {
      if (!m || typeof m !== "object") return "";
      const c = (m as { content?: unknown }).content;
      return typeof c === "string" ? c : "";
    })
    .join("\n");
  return flat.includes("Continue from the returned tool results.");
}

function hasRawToolTranscriptFields(messages: unknown[]): boolean {
  for (const raw of messages) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role : "";
    if (role === "tool" || role === "function") return true;
    if (role === "assistant" && Array.isArray(row.tool_calls)) return true;
    if (typeof row.tool_call_id === "string") return true;
  }
  return false;
}

function resumeMessages(): Record<string, unknown>[] {
  return [
    { role: "user", content: "read a then continue" },
    assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
    toolMsg("call_r1_a", { text: "contents of a" }),
  ];
}

console.log("P1043 CURSOR NATIVE RESUME FAST PATH\n");

// ── Unit gates ───────────────────────────────────────────────────────────
{
  assert(
    shouldApplyNativeResumeFastPath({
      resumeToolRound: true,
      activeToolMode: "native",
      hasToolsClient: true,
      toolChoice: "auto",
    }) === true,
    "unit.fastpath gate opens on legal resume + native + auto",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
  assert(
    shouldApplyNativeResumeFastPath({
      resumeToolRound: true,
      activeToolMode: "native",
      hasToolsClient: true,
      toolChoice: undefined,
    }) === true &&
      shouldApplyNativeResumeFastPath({
        resumeToolRound: true,
        activeToolMode: "native",
        hasToolsClient: true,
        toolChoice: null,
      }) === true,
    "unit.fastpath gate opens for missing/null tool_choice",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
  assert(
    shouldApplyNativeResumeFastPath({
      resumeToolRound: true,
      activeToolMode: "native",
      hasToolsClient: true,
      toolChoice: "required",
    }) === false &&
      shouldApplyNativeResumeFastPath({
        resumeToolRound: false,
        activeToolMode: "native",
        hasToolsClient: true,
        toolChoice: "auto",
      }) === false &&
      shouldApplyNativeResumeFastPath({
        resumeToolRound: true,
        activeToolMode: "emulated_json",
        hasToolsClient: true,
        toolChoice: "auto",
      }) === false,
    "unit.fastpath gate closed for required / non-resume / emulated",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );

  const originalMsgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "ok" },
  ];
  const body = { model: "gpt-5.5", messages: originalMsgs, tools: [] };
  const before = JSON.stringify(originalMsgs);
  const applied = applyNativeResumeFastPathInstruction(body);
  assert(
    applied.applied === true &&
      JSON.stringify(originalMsgs) === before &&
      JSON.stringify(body.messages) === before &&
      Array.isArray(applied.body.messages) &&
      (applied.body.messages as unknown[]).length === 3 &&
      String(
        (
          (applied.body.messages as unknown[])[2] as {
            content?: unknown;
          }
        )?.content ?? ""
      ).includes("Continue from the returned tool results.") &&
      applied.body.messages !== body.messages,
    "unit.apply copies only — clientBody/messages untouched",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
  assert(
    NATIVE_RESUME_CONTINUATION_INSTRUCTION.includes(
      "If the task is already complete, return the final answer."
    ),
    "unit.instruction allows final answer (no forced tools)",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
}

// ── A. Native first gun → Read tool_call; arb=0; debit=1 ─────────────────
{
  const messages = resumeMessages();
  const messagesBefore = JSON.stringify(messages);
  const body = {
    model: "gpt-5.5",
    messages,
    tools: AGENT_FILE_TOOLS,
    tool_choice: "auto" as const,
  };
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("Read", { path: "b.ts" }, { id: "call_r2_b" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(body, "req_p1043_a");
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      toolName(result) === "Read" &&
      toolArgs(result)?.path === "b.ts" &&
      msg(result)?.content === null &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      outboundHasFastPathInstruction() &&
      JSON.stringify(messages) === messagesBefore &&
      JSON.stringify(body.messages) === messagesBefore &&
      getCounts().outboundBodies[0]?.tool_choice === "auto",
    "A. legal resume — native Read; provider=1 arb=0 debit=1; clientBody untouched",
    {
      ...meta,
      debitTokens: tok,
      fastPath: outboundHasFastPathInstruction(),
      clientBodyMutated: JSON.stringify(messages) !== messagesBefore,
    }
  );
}

// ── B. Native multi tool_calls → provider=1 arb=0 ────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion" as const,
        content: null,
        finish_reason: "tool_calls",
        tool_calls: [
          ...makeNativeToolCalls("Read", { path: "x.ts" }, "call_multi_x"),
          ...makeNativeToolCalls("Read", { path: "y.ts" }, "call_multi_y"),
        ],
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_b"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      toolCallCount(result) === 2 &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      outboundHasFastPathInstruction(),
    "B. native multi tool_calls — provider=1 arb=0 debit=1",
    { ...meta, toolCallCount: toolCallCount(result) }
  );
}

// ── C. Native plain text → continuation arb → tool_calls ─────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "I should continue with the next file",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Read", { path: "b.ts" }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_c"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  const bodies = getCounts().outboundBodies;
  const emulatedMsgs = bodies[1]?.messages ?? [];
  assert(
    result.ok === true &&
      toolName(result) === "Read" &&
      toolArgs(result)?.path === "b.ts" &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens ===
        NATIVE_USAGE.prompt_tokens + ARB_USAGE.prompt_tokens &&
      tok.completion_tokens ===
        NATIVE_USAGE.completion_tokens + ARB_USAGE.completion_tokens &&
      outboundHasFastPathInstruction() &&
      !hasRawToolTranscriptFields(emulatedMsgs),
    "C. native text → continuation arb tool_calls; provider=2 arb=1 debit=1; P1040 sanitize",
    { ...meta, debitTokens: tok, emulatedRawTool: hasRawToolTranscriptFields(emulatedMsgs) }
  );
}

// ── D. Native plain text → arb assistant_text ────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native placeholder",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("final from continuation"),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_d"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "final from continuation" &&
      !msg(result)?.tool_calls &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1,
    "D. native text → arb assistant_text; debit=1; no forged tools",
    meta
  );
}

// ── E. arbitration invalid → restore Native; debit=1 ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "keep this native text",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: "not-json-at-all {{{",
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_e"
  );
  const meta = billingSnapshot(result);
  const body = JSON.stringify(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      msg(result)?.content === "keep this native text" &&
      !body.includes("not-json-at-all") &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens ===
        NATIVE_USAGE.prompt_tokens + ARB_USAGE.prompt_tokens,
    "E. arb invalid → restore native; debit=1 (aggregate native+arb HTTP 200)",
    { ...meta, debitTokens: tok }
  );
}

// ── F. arbitration transport failure → restore Native; debit=1 ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native before transport fail",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "error",
        code: "upstream_error",
        status: 502,
        message: "arbitration transport failed",
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_f"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      msg(result)?.content === "native before transport fail" &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens,
    "F. arb transport failure → restore native; debit=1",
    { ...meta, debitTokens: tok }
  );
}

// ── G. P1033 rejects illegal transcripts; provider=0 debit=0 ─────────────
{
  // duplicate
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
          { role: "user", content: "dup" },
          assistantTools([tc("call_dup", "Read", { path: "a" })]),
          toolMsg("call_dup", "a"),
          toolMsg("call_dup", "a-again"),
        ],
        tools: AGENT_FILE_TOOLS,
        tool_choice: "auto",
      },
      "req_p1043_g_dup"
    );
    const meta = billingSnapshot(result);
    assert(
      result.ok === false &&
        meta.errorCode === DUPLICATE_TOOL_RESULT_CODE &&
        meta.providerCallCount === 0 &&
        meta.debitCallCount === 0,
      "G1. duplicate tool result → 400 provider=0 debit=0",
      meta
    );
  }
  // unmatched
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
          { role: "user", content: "unmatched" },
          assistantTools([tc("call_ok", "Read", { path: "a" })]),
          toolMsg("call_missing", "x"),
        ],
        tools: AGENT_FILE_TOOLS,
        tool_choice: "auto",
      },
      "req_p1043_g_unmatched"
    );
    const meta = billingSnapshot(result);
    assert(
      result.ok === false &&
        meta.errorCode === INVALID_TOOL_CALL_ID_CODE &&
        meta.providerCallCount === 0 &&
        meta.debitCallCount === 0,
      "G2. unmatched tool_call_id → 400 provider=0 debit=0",
      meta
    );
  }
  // missing tool result
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
          { role: "user", content: "missing" },
          assistantTools([
            tc("call_m1", "Read", { path: "a" }),
            tc("call_m2", "Read", { path: "b" }),
          ]),
          toolMsg("call_m1", "only one"),
        ],
        tools: AGENT_FILE_TOOLS,
        tool_choice: "auto",
      },
      "req_p1043_g_missing"
    );
    const meta = billingSnapshot(result);
    assert(
      result.ok === false &&
        meta.errorCode === MISSING_TOOL_RESULT_CODE &&
        meta.providerCallCount === 0 &&
        meta.debitCallCount === 0,
      "G3. missing tool result → 400 provider=0 debit=0",
      meta
    );
  }
  const v = validateCursorToolTranscript([
    { role: "user", content: "x" },
    assistantTools([tc("call_ok", "Read", { path: "a" })]),
    toolMsg("call_ok", "a"),
  ]);
  assert(
    v.ok === true && v.resumeToolRound === true,
    "G4. legal transcript still validates resumeToolRound",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
}

// ── H. task complete — Native final text not forced into tools ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "both files summarized — done",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("both files summarized — done"),
        usage: ARB_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "read a then b then summarize" },
        assistantTools([tc("call_h_a", "Read", { path: "a.ts" })]),
        toolMsg("call_h_a", "a"),
        assistantTools([tc("call_h_b", "Read", { path: "b.ts" })]),
        toolMsg("call_h_b", "b"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_h"
  );
  const meta = billingSnapshot(result);
  const out0 = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      typeof msg(result)?.content === "string" &&
      String(msg(result)?.content).length > 0 &&
      !msg(result)?.tool_calls &&
      out0?.tool_choice === "auto" &&
      out0?.tool_choice !== "required" &&
      outboundHasFastPathInstruction() &&
      meta.debitCallCount === 1,
    "H. completed task — final text allowed; tool_choice not forced required",
    {
      ...meta,
      content: msg(result)?.content,
      tool_choice: out0?.tool_choice ?? null,
      fastPath: outboundHasFastPathInstruction(),
    }
  );
}

// ── I. timeout total budget must not increase ────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 55_000,
      idleTimeoutMs: 55_000,
      totalTimeoutMs: 60_000,
    },
    scripts: [
      () => ({
        ...nativeToolCompletion("Read", { path: "budget.ts" }, { id: "call_budget" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: resumeMessages(),
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_i"
  );
  const meta = billingSnapshot(result);
  const timeouts = getCounts().fetchTimeoutMs;
  const maxFetch = timeouts.length > 0 ? Math.max(...timeouts) : -1;
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      timeouts.length === 1 &&
      maxFetch > 0 &&
      maxFetch <= 55_000 &&
      maxFetch <= 60_000,
    "I. timeout budget unchanged — fetch capped by existing policy; no increase",
    {
      ...meta,
      fetchTimeoutMs: timeouts,
      maxFetch,
      policyUpstreamMs: 55_000,
      policyTotalMs: 60_000,
    }
  );

  // Production formula still matches pre-P1043 tool_call budget (source unit).
  // Harness mocks resolveUpstreamTimeoutPolicy — assert source constants instead.
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert(
    src.includes("toolCallMs: 420_000") &&
      src.includes('tier: "tool_call"') &&
      src.includes("totalTimeoutMs: Math.max(chatTotalMs, upstreamTimeoutMs + 10_000)") &&
      !src.includes("P1043") &&
      !src.includes("native_resume_fastpath"),
    "I2. upstreamTimeoutPolicy source unchanged (no budget rewrite)",
    { providerCallCount: 0, debitCallCount: 0, level: "UNIT" }
  );
}

// ── J. P1040 resume transcript sanitization regression ───────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "need next tool",
        usage: NATIVE_USAGE,
      }),
      () => ({
        kind: "completion",
        content: makeToolCallIntent("Write", {
          path: "out.ts",
          contents: "x",
        }),
        usage: ARB_USAGE,
      }),
    ],
  });
  const uniqueResult = "UNIQUE_P1043_J_TOOL_RESULT";
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "j" },
        assistantTools([tc("call_j_read", "Read", { path: "in.ts" })]),
        toolMsg("call_j_read", uniqueResult),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1043_j"
  );
  const meta = billingSnapshot(result);
  const bodies = getCounts().outboundBodies;
  const nativeMsgs = bodies[0]?.messages ?? [];
  const emulatedMsgs = bodies[1]?.messages ?? [];
  const nativeHasRoleTool = nativeMsgs.some((m) => {
    if (!m || typeof m !== "object") return false;
    return (m as { role?: unknown }).role === "tool";
  });
  const emulatedFlat = emulatedMsgs
    .map((m) => {
      if (!m || typeof m !== "object") return "";
      const c = (m as { content?: unknown }).content;
      return typeof c === "string" ? c : JSON.stringify(c ?? "");
    })
    .join("\n");
  assert(
    result.ok === true &&
      toolName(result) === "Write" &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      nativeHasRoleTool === true &&
      outboundHasFastPathInstruction() &&
      !hasRawToolTranscriptFields(emulatedMsgs) &&
      emulatedFlat.includes(uniqueResult) &&
      meta.debitCallCount === 1,
    "J. P1040 sanitize — native keeps role=tool; emulated has no raw tool fields",
    {
      ...meta,
      nativeHasRoleTool,
      emulatedRawTool: hasRawToolTranscriptFields(emulatedMsgs),
      emulatedHasResult: emulatedFlat.includes(uniqueResult),
    }
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
