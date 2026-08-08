/**
 * P1046 — Cursor resumeToolRound must be trailing-tool-tail only.
 *
 * Proves historical role=tool transcripts do not set resumeToolRound when the
 * latest message is user/assistant; only a contiguous trailing tool-result
 * block mapped to the nearest preceding assistant.tool_calls does.
 *
 * Authenticity:
 *   REAL detectTrailingToolResume / validateCursorToolTranscript
 *   REAL executeChatCompletion ENTRY
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1046-cursor-resume-tail-detection.mts
 *
 * Marker: TOKFAI_P1046_CURSOR_RESUME_TAIL_DETECTION_PASS
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
  detectTrailingToolResume,
  validateCursorToolTranscript,
  DUPLICATE_TOOL_RESULT_CODE,
  INVALID_TOOL_CALL_ID_CODE,
  MISSING_TOOL_RESULT_CODE,
  NATIVE_RESUME_CONTINUATION_INSTRUCTION,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1046_CURSOR_RESUME_TAIL_DETECTION_PASS";
const FAIL = "TOKFAI_P1046_CURSOR_RESUME_TAIL_DETECTION_BLOCKED";
const LEVEL =
  "REAL detectTrailingToolResume + REAL validateCursorToolTranscript + REAL executeChatCompletion ENTRY + MOCK provider + MOCK/SPY billing";

const NATIVE_USAGE = {
  prompt_tokens: 90,
  completion_tokens: 8,
  total_tokens: 98,
};

let failed = 0;
const evidence: Record<string, unknown> = {};

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
    limitKey: "p1046",
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

function outboundHasFastPathInstruction(): boolean {
  const bodies = getCounts().outboundBodies;
  if (bodies.length === 0) return false;
  const needle = "Continue from the returned tool results.";
  return bodies.some((b) =>
    (b.messages ?? [])
      .map((m) => {
        if (!m || typeof m !== "object") return "";
        const c = (m as { content?: unknown }).content;
        return typeof c === "string" ? c : "";
      })
      .join("\n")
      .includes(needle)
  );
}

function historyTenToolRoundsThenUser(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "start agent" },
  ];
  for (let i = 0; i < 11; i++) {
    const id = `call_hist_${i}`;
    out.push(assistantTools([tc(id, "Read", { path: `f${i}.ts` })]));
    out.push(toolMsg(id, { text: `contents ${i}` }));
  }
  out.push({
    role: "user",
    content: "TOKFAI_CLEAN_THREAD_PROBE_20260807",
  });
  return out;
}

console.log("P1046 CURSOR RESUME TAIL DETECTION\n");

// ── Unit A: system + user => false ───────────────────────────────────────
{
  const messages = [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
  ];
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === false &&
      d.trailingToolMessageCount === 0 &&
      v.ok === true &&
      v.resumeToolRound === false,
    "A. system+user => resume=false",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.A = { detect: d, resumeToolRound: v.resumeToolRound };
}

// ── Unit B: trailing tool result => true ─────────────────────────────────
{
  const messages = [
    { role: "system", content: "sys" },
    assistantTools([tc("call_a", "Read", { path: "a.ts" })]),
    toolMsg("call_a", { text: "a" }),
  ];
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === true &&
      d.trailingToolMessageCount === 1 &&
      v.ok === true &&
      v.resumeToolRound === true,
    "B. trailing tool result => resume=true",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.B = { detect: d, resumeToolRound: v.resumeToolRound };
}

// ── Unit C: tool history + latest user => false ──────────────────────────
{
  const messages = [
    assistantTools([tc("call_a", "Read", { path: "a.ts" })]),
    toolMsg("call_a", { text: "a" }),
    { role: "user", content: "new question" },
  ];
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === false &&
      d.trailingToolMessageCount === 0 &&
      v.ok === true &&
      v.resumeToolRound === false &&
      v.analysis.toolMessageCount === 1,
    "C. history tool + latest user => resume=false (toolMessageCount still counted)",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      toolMessageCount: v.analysis.toolMessageCount,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.C = {
    detect: d,
    toolMessageCount: v.analysis.toolMessageCount,
    resumeToolRound: v.resumeToolRound,
  };
}

// ── Unit D: tool + assistant text + user => false ────────────────────────
{
  const messages = [
    assistantTools([tc("call_a", "Read", { path: "a.ts" })]),
    toolMsg("call_a", { text: "a" }),
    { role: "assistant", content: "done" },
    { role: "user", content: "next" },
  ];
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === false &&
      v.ok === true &&
      v.resumeToolRound === false,
    "D. completed round + assistant + user => resume=false",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.D = { detect: d, resumeToolRound: v.resumeToolRound };
}

// ── Unit E: 10+ historical rounds, latest user => false ──────────────────
{
  const messages = historyTenToolRoundsThenUser();
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === false &&
      d.trailingToolMessageCount === 0 &&
      v.ok === true &&
      v.resumeToolRound === false &&
      v.analysis.toolMessageCount >= 11,
    "E. 11 historical tool rounds + latest user => resume=false",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      toolMessageCount: v.analysis.toolMessageCount,
      messageCount: v.analysis.messageCount,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.E = {
    detect: d,
    toolMessageCount: v.analysis.toolMessageCount,
    resumeToolRound: v.resumeToolRound,
  };
}

// ── Unit F: parallel trailing tools => true ──────────────────────────────
{
  const messages = [
    assistantTools([
      tc("call_a", "Read", { path: "a.ts" }),
      tc("call_b", "Read", { path: "b.ts" }),
    ]),
    toolMsg("call_a", "a"),
    toolMsg("call_b", "b"),
  ];
  const d = detectTrailingToolResume(messages);
  const v = validateCursorToolTranscript(messages);
  assert(
    d.resumeToolRound === true &&
      d.trailingToolMessageCount === 2 &&
      v.ok === true &&
      v.resumeToolRound === true,
    "F. trailing tool A+B => resume=true",
    {
      providerCallCount: 0,
      debitCallCount: 0,
      level: "UNIT",
      detect: d,
      resumeToolRound: v.resumeToolRound,
    }
  );
  evidence.F = { detect: d, resumeToolRound: v.resumeToolRound };
}

// ── G. unmatched trailing tool_call_id — reject, no provider/debit ───────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "x" },
        assistantTools([tc("call_ok", "Read", { path: "a.ts" })]),
        toolMsg("call_missing_zzz", "nope"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1046_g"
  );
  const meta = billingSnapshot(result);
  const v = validateCursorToolTranscript([
    { role: "user", content: "x" },
    assistantTools([tc("call_ok", "Read", { path: "a.ts" })]),
    toolMsg("call_missing_zzz", "nope"),
  ]);
  assert(
    result.ok === false &&
      meta.errorCode === INVALID_TOOL_CALL_ID_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0 &&
      v.ok === false &&
      v.resumeToolRound === false,
    "G. unmatched trailing tool_call_id => reject provider=0 debit=0",
    meta
  );
  evidence.G = meta;
}

// ── H. duplicate trailing tool result — reject ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "x" },
        assistantTools([tc("call_dup", "Read", { path: "a.ts" })]),
        toolMsg("call_dup", "first"),
        toolMsg("call_dup", "second"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1046_h"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === DUPLICATE_TOOL_RESULT_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "H. duplicate tool result => reject provider=0 debit=0",
    meta
  );
  evidence.H = meta;
}

// also missing-result still rejects (P1033 safety retained)
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "x" },
        assistantTools([
          tc("call_m1", "Read", { path: "a" }),
          tc("call_m2", "Read", { path: "b" }),
        ]),
        toolMsg("call_m1", "only one"),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1046_h_missing"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === MISSING_TOOL_RESULT_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "H2. missing tool result => reject provider=0 debit=0",
    meta
  );
}

// ── I. true resume still takes native resume path ────────────────────────
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
    { role: "user", content: "read a then continue" },
    assistantTools([tc("call_r1_a", "Read", { path: "a.ts" })]),
    toolMsg("call_r1_a", { text: "contents of a" }),
  ];
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      // P1059 — resume continuation nudge retained on auto-pro only.
      model: "auto-pro",
      messages,
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1046_i"
  );
  const meta = billingSnapshot(result);
  assert(
    v.ok === true &&
      v.resumeToolRound === true &&
      result.ok === true &&
      msg(result)?.tool_calls?.[0]?.function?.name === "Read" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      outboundHasFastPathInstruction() === true &&
      NATIVE_RESUME_CONTINUATION_INSTRUCTION.includes(
        "Continue from the returned tool results."
      ),
    "I. true trailing resume — native fastpath; provider=1 arb=0 debit=1",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      fastPath: outboundHasFastPathInstruction(),
      toolName: msg(result)?.tool_calls?.[0]?.function?.name ?? null,
    }
  );
  evidence.I = {
    resumeToolRound: v.resumeToolRound,
    ...meta,
    fastPath: outboundHasFastPathInstruction(),
  };
}

// ── J. historical tools + latest user — no resume path ───────────────────
// P1047 closed first-turn P1028 AUTO: with tools+auto+plain text, expect
// provider=1 arb=0. Prove resume-specific artifacts are absent.
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "TOKFAI_CLEAN_THREAD_OK",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = historyTenToolRoundsThenUser();
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1046_j"
  );
  const meta = billingSnapshot(result);
  assert(
    v.ok === true &&
      v.resumeToolRound === false &&
      v.analysis.toolMessageCount >= 11 &&
      result.ok === true &&
      msg(result)?.content === "TOKFAI_CLEAN_THREAD_OK" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      outboundHasFastPathInstruction() === false,
    "J. history tools + latest user — resume=false; provider=1 arb=0 debit=1; no fastpath",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      toolMessageCount: v.analysis.toolMessageCount,
      fastPath: outboundHasFastPathInstruction(),
      content: msg(result)?.content ?? null,
    }
  );
  evidence.J = {
    resumeToolRound: v.resumeToolRound,
    toolMessageCount: v.analysis.toolMessageCount,
    ...meta,
    fastPath: outboundHasFastPathInstruction(),
  };
}

// ── J2. ordinary plain text (no tools) — provider=1 arb=0 debit=1 ────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "TOKFAI_CLEAN_THREAD_OK",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const messages = historyTenToolRoundsThenUser();
  const v = validateCursorToolTranscript(messages);
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
    },
    "req_p1046_j2"
  );
  const meta = billingSnapshot(result);
  assert(
    v.resumeToolRound === false &&
      result.ok === true &&
      msg(result)?.content === "TOKFAI_CLEAN_THREAD_OK" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      outboundHasFastPathInstruction() === false,
    "J2. ordinary text (history tools in messages, no tools[]) — provider=1 arb=0 debit=1",
    {
      ...meta,
      resumeToolRound: v.resumeToolRound,
      fastPath: outboundHasFastPathInstruction(),
    }
  );
  evidence.J2 = {
    resumeToolRound: v.resumeToolRound,
    ...meta,
    fastPath: outboundHasFastPathInstruction(),
  };
}

console.log("\n── P1046 evidence summary ──");
console.log(JSON.stringify(evidence, null, 2));

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
