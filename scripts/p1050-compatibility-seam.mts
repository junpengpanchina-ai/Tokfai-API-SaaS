/**
 * P1050 — Additive compatibility seam regression.
 *
 * Imports REAL apps/dmit-api/src/lib/compat helpers only.
 * Does not mock/fake production normalization logic.
 * Does not exercise executeChatCompletion (Golden Path firewall).
 *
 *   npx tsx scripts/p1050-compatibility-seam.mts
 *
 * Marker: TOKFAI_P1050_ADDITIVE_COMPATIBILITY_SEAM_PASS
 */

import {
  canonicalAssistantFromOpenAiChoice,
  deterministicToolCallId,
  getProviderCapabilityProfile,
  normalizeGeminiStyleToolCall,
  normalizeOpenAiStyleToolCall,
  normalizeOpenAiStyleToolCalls,
  toCanonicalFinishReason,
} from "../apps/dmit-api/src/lib/compat/index.ts";

const PASS = "TOKFAI_P1050_ADDITIVE_COMPATIBILITY_SEAM_PASS";
const FAIL = "TOKFAI_P1050_ADDITIVE_COMPATIBILITY_SEAM_BLOCKED";

let failed = 0;
const caseResults: Record<string, string> = {};

function pass(id: string, detail?: Record<string, unknown>) {
  caseResults[id] = "PASS";
  console.log(`PASS  ${id}`);
  if (detail) console.log(JSON.stringify(detail, null, 2));
}
function fail(id: string, detail?: string) {
  failed += 1;
  caseResults[id] = "FAIL";
  console.error(`FAIL  ${id}${detail ? ` — ${detail}` : ""}`);
}
function assert(id: string, cond: boolean, detail?: Record<string, unknown>) {
  if (cond) pass(id, detail);
  else fail(id, detail ? JSON.stringify(detail) : undefined);
}

console.log("P1050 ADDITIVE COMPATIBILITY SEAM\n");

// A. OpenAI text → canonical stop
{
  const finish = toCanonicalFinishReason("stop");
  const result = canonicalAssistantFromOpenAiChoice({
    content: "hello",
    tool_calls: [],
    finishReasonCanonical: finish,
  });
  assert(
    "A",
    finish === "stop" &&
      result.text === "hello" &&
      result.toolCalls.length === 0 &&
      result.finishReason === "stop",
    { finish, text: result.text }
  );
}

// B. OpenAI single tool_call
{
  const one = normalizeOpenAiStyleToolCall({
    id: "call_abc",
    type: "function",
    function: {
      name: "Read",
      arguments: JSON.stringify({ path: "a.ts" }),
    },
  });
  assert(
    "B",
    one.ok === true &&
      one.ok &&
      one.toolCall.id === "call_abc" &&
      one.toolCall.name === "Read" &&
      one.toolCall.arguments.path === "a.ts",
    one.ok ? { toolCall: one.toolCall } : { one }
  );
}

// C. OpenAI multiple tool_calls — order preserved
{
  const multi = normalizeOpenAiStyleToolCalls([
    {
      id: "call_1",
      type: "function",
      function: { name: "Grep", arguments: '{"pattern":"x"}' },
    },
    {
      id: "call_2",
      type: "function",
      function: { name: "Read", arguments: '{"path":"y.ts"}' },
    },
  ]);
  assert(
    "C",
    multi.ok === true &&
      multi.ok &&
      multi.toolCalls.length === 2 &&
      multi.toolCalls[0]!.id === "call_1" &&
      multi.toolCalls[0]!.name === "Grep" &&
      multi.toolCalls[1]!.id === "call_2" &&
      multi.toolCalls[1]!.name === "Read",
    multi.ok ? { ids: multi.toolCalls.map((t) => t.id) } : { multi }
  );
}

// D. Gemini function call → canonical
{
  const g = normalizeGeminiStyleToolCall(
    { name: "Read", args: { path: "gemini.ts" } },
    { index: 0, requestScope: "req_d" }
  );
  assert(
    "D",
    g.ok === true &&
      g.ok &&
      g.toolCall.name === "Read" &&
      g.toolCall.arguments.path === "gemini.ts" &&
      typeof g.toolCall.id === "string" &&
      g.toolCall.id.startsWith("call_"),
    g.ok ? { toolCall: g.toolCall } : { g }
  );
}

// E. Gemini no-id → deterministic request-scoped id
{
  const a = normalizeGeminiStyleToolCall(
    { name: "Search", args: { q: "x" } },
    { index: 0, requestScope: "req_e" }
  );
  const b = normalizeGeminiStyleToolCall(
    { name: "Search", args: { q: "x" } },
    { index: 0, requestScope: "req_e" }
  );
  const c = normalizeGeminiStyleToolCall(
    { name: "Search", args: { q: "x" } },
    { index: 1, requestScope: "req_e" }
  );
  const expected = deterministicToolCallId({
    requestScope: "req_e",
    index: 0,
    name: "Search",
  });
  assert(
    "E",
    a.ok &&
      b.ok &&
      c.ok &&
      a.toolCall.id === expected &&
      a.toolCall.id === b.toolCall.id &&
      a.toolCall.id !== c.toolCall.id,
    {
      idA: a.ok ? a.toolCall.id : null,
      idC: c.ok ? c.toolCall.id : null,
      expected,
    }
  );
}

// F. malformed arguments → explicit failure (no invent)
{
  const bad = normalizeOpenAiStyleToolCall({
    id: "call_bad",
    type: "function",
    function: { name: "Write", arguments: "{not-json" },
  });
  const inventCheck = normalizeOpenAiStyleToolCall({
    id: "call_arr",
    type: "function",
    function: { name: "Write", arguments: "[1,2,3]" },
  });
  assert(
    "F",
    bad.ok === false &&
      bad.reason === "invalid_arguments_json" &&
      inventCheck.ok === false &&
      inventCheck.reason === "invalid_arguments_type",
    { bad, inventCheck }
  );
}

// G–L finish reasons
assert("G", toCanonicalFinishReason("stop") === "stop");
assert("H", toCanonicalFinishReason("tool_calls") === "tool_calls");
assert("I", toCanonicalFinishReason("STOP") === "stop");
assert("J", toCanonicalFinishReason("MAX_TOKENS") === "length");
assert("K", toCanonicalFinishReason("SAFETY") === "content_filter");
{
  let crashed = false;
  let mapped: string | null = null;
  try {
    mapped = toCanonicalFinishReason("TOTALLY_UNKNOWN_XYZ");
  } catch {
    crashed = true;
  }
  assert(
    "L",
    !crashed && mapped === "unknown",
    { mapped, crashed }
  );
}

// Capability registry smoke (descriptive only)
{
  const gpt = getProviderCapabilityProfile("grsai-primary");
  const unknown = getProviderCapabilityProfile("no-such-provider");
  assert(
    "CAP",
    gpt.supportsNativeTools === true &&
      gpt.protocolFamily === "openai_chat_completions" &&
      unknown.supportsNativeTools === false &&
      unknown.providerFamily === "unknown",
    { gpt: gpt.id, unknown: unknown.id }
  );
}

console.log("\nCASE_A_L=" + JSON.stringify(caseResults));
if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
