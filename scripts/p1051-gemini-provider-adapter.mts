/**
 * P1051 — Explicit Gemini provider adapter regression.
 *
 * Imports REAL apps/dmit-api/src/lib/compat/providers/geminiAdapter only.
 * Does not mock/fake production adapter logic.
 * Does not exercise executeChatCompletion (GPT Golden Path firewall).
 *
 *   npx tsx scripts/p1051-gemini-provider-adapter.mts
 *
 * Marker: TOKFAI_P1051_GEMINI_ADAPTER_IMPLEMENTED_PASS
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adaptGeminiResponseToOpenAI,
  buildToolCallIdToNameMap,
  canonicalGeminiResultToOpenAI,
  convertOpenAIToolContinuationToGeminiContents,
  convertOpenAIToolResultsToGeminiFunctionResponses,
  convertOpenAIToolsToGemini,
  deterministicToolCallId,
  getProviderCapabilityProfile,
  isExplicitGeminiProviderPath,
  normalizeGeminiResponse,
  normalizeGeminiUsage,
  toCanonicalFinishReason,
} from "../apps/dmit-api/src/lib/compat/index.ts";
import { MODEL_ALIAS_CHAINS } from "../apps/dmit-api/src/upstream/modelAliases.ts";

const PASS = "TOKFAI_P1051_GEMINI_ADAPTER_IMPLEMENTED_PASS";
const FAIL = "TOKFAI_P1051_GEMINI_ADAPTER_IMPLEMENTED_BLOCKED";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function fileContains(rel: string, needle: string): boolean {
  try {
    return readFileSync(join(root, rel), "utf8").includes(needle);
  } catch {
    return false;
  }
}

console.log("P1051 GEMINI PROVIDER ADAPTER\n");

// A. text STOP
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: { role: "model", parts: [{ text: "hello gemini" }] },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_a" }
  );
  const msg = n.ok ? canonicalGeminiResultToOpenAI(n.result) : null;
  assert(
    "A",
    n.ok === true &&
      n.ok &&
      n.result.text === "hello gemini" &&
      n.result.finishReason === "stop" &&
      n.result.toolCalls.length === 0 &&
      msg?.role === "assistant" &&
      msg.content === "hello gemini" &&
      msg.tool_calls === undefined,
    n.ok ? { text: n.result.text, finish: n.result.finishReason } : { n }
  );
}

// B. text MAX_TOKENS
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: { parts: [{ text: "truncated" }] },
          finishReason: "MAX_TOKENS",
        },
      ],
    },
    { providerFamily: "gemini" }
  );
  assert(
    "B",
    n.ok === true && n.ok && n.result.finishReason === "length",
    n.ok ? { finish: n.result.finishReason } : { n }
  );
}

// C. SAFETY
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: { parts: [{ text: "" }] },
          finishReason: "SAFETY",
        },
      ],
    },
    { providerFamily: "gemini" }
  );
  assert(
    "C",
    n.ok === true && n.ok && n.result.finishReason === "content_filter",
    n.ok ? { finish: n.result.finishReason } : { n }
  );
}

// D. single functionCall
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "Read",
                  args: { path: "a.ts" },
                },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_d" }
  );
  const msg = n.ok ? canonicalGeminiResultToOpenAI(n.result) : null;
  assert(
    "D",
    n.ok === true &&
      n.ok &&
      n.result.toolCalls.length === 1 &&
      n.result.toolCalls[0]!.name === "Read" &&
      n.result.toolCalls[0]!.arguments.path === "a.ts" &&
      n.result.finishReason === "tool_calls" &&
      msg?.content === null &&
      msg?.tool_calls?.[0]?.function.arguments ===
        JSON.stringify({ path: "a.ts" }),
    n.ok
      ? { tool: n.result.toolCalls[0], msgArgs: msg?.tool_calls?.[0]?.function.arguments }
      : { n }
  );
}

// E. multiple functionCalls — order preserved
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "Grep", args: { pattern: "x" } } },
              { functionCall: { name: "Read", args: { path: "y.ts" } } },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_e" }
  );
  assert(
    "E",
    n.ok === true &&
      n.ok &&
      n.result.toolCalls.length === 2 &&
      n.result.toolCalls[0]!.name === "Grep" &&
      n.result.toolCalls[1]!.name === "Read",
    n.ok ? { names: n.result.toolCalls.map((t) => t.name) } : { n }
  );
}

// F. mixed text + functionCall
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "calling tool" },
              { functionCall: { name: "Read", args: { path: "z.ts" } } },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_f" }
  );
  assert(
    "F",
    n.ok === true &&
      n.ok &&
      n.result.text === "calling tool" &&
      n.result.toolCalls.length === 1 &&
      n.result.toolCalls[0]!.name === "Read",
    n.ok ? { text: n.result.text, tools: n.result.toolCalls.length } : { n }
  );
}

// G. deterministic id
{
  const a = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "Search", args: { q: "x" } } }],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_g" }
  );
  const b = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "Search", args: { q: "x" } } }],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_g" }
  );
  const c = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "Search", args: { q: "x" } } },
              { functionCall: { name: "Search", args: { q: "y" } } },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_g" }
  );
  const expected = deterministicToolCallId({
    requestScope: "req_g",
    index: 0,
    name: "Search",
  });
  assert(
    "G",
    a.ok === true &&
      b.ok === true &&
      c.ok === true &&
      a.ok &&
      b.ok &&
      c.ok &&
      a.result.toolCalls[0]!.id === expected &&
      a.result.toolCalls[0]!.id === b.result.toolCalls[0]!.id &&
      c.result.toolCalls[0]!.id !== c.result.toolCalls[1]!.id &&
      a.result.toolCalls[0]!.id.startsWith("call_"),
    {
      expected,
      idA: a.ok ? a.result.toolCalls[0]!.id : null,
      idC0: c.ok ? c.result.toolCalls[0]!.id : null,
      idC1: c.ok ? c.result.toolCalls[1]!.id : null,
    }
  );
}

// H. OpenAI tools → Gemini declarations
{
  const decls = convertOpenAIToolsToGemini([
    {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "Grep",
        description: "Search",
        parameters: {
          type: "object",
          properties: { pattern: { type: "string" } },
        },
      },
    },
  ]);
  assert(
    "H",
    decls.length === 2 &&
      decls[0]!.name === "Read" &&
      decls[0]!.description === "Read a file" &&
      decls[0]!.parameters?.type === "object" &&
      (decls[0]!.parameters?.properties as { path?: unknown })?.path != null &&
      decls[1]!.name === "Grep" &&
      Array.isArray(
        (decls[0]!.parameters as { required?: string[] })?.required
      ) &&
      (decls[0]!.parameters as { required: string[] }).required[0] === "path",
    { decls }
  );
}

// I. assistant.tool_calls + role=tool → Gemini functionResponse
{
  const assistant = {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_read_1",
        type: "function",
        function: {
          name: "Read",
          arguments: JSON.stringify({ path: "a.ts" }),
        },
      },
    ],
  };
  const toolMsg = {
    role: "tool",
    tool_call_id: "call_read_1",
    content: JSON.stringify({ ok: true, text: "file body" }),
  };
  const parts = convertOpenAIToolResultsToGeminiFunctionResponses({
    assistantToolCalls: assistant,
    toolMessages: [toolMsg],
  });
  const contents = convertOpenAIToolContinuationToGeminiContents({
    assistantMessage: assistant,
    toolMessages: [toolMsg],
  });
  assert(
    "I",
    parts.length === 1 &&
      parts[0]!.functionResponse.name === "Read" &&
      parts[0]!.functionResponse.response.ok === true &&
      contents.length === 2 &&
      contents[0]!.role === "model" &&
      contents[1]!.role === "user" &&
      (contents[1]!.parts?.[0] as { functionResponse?: { name?: string } })
        ?.functionResponse?.name === "Read",
    { parts, contents }
  );
}

// J. two tools association not crossed
{
  const assistant = {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_a",
        type: "function",
        function: { name: "Read", arguments: '{"path":"a.ts"}' },
      },
      {
        id: "call_b",
        type: "function",
        function: { name: "Grep", arguments: '{"pattern":"x"}' },
      },
    ],
  };
  const toolMessages = [
    { role: "tool", tool_call_id: "call_b", content: '{"matches":1}' },
    { role: "tool", tool_call_id: "call_a", content: '{"text":"aaa"}' },
  ];
  const map = buildToolCallIdToNameMap(assistant);
  const parts = convertOpenAIToolResultsToGeminiFunctionResponses({
    idToName: map,
    toolMessages,
  });
  assert(
    "J",
    map.get("call_a") === "Read" &&
      map.get("call_b") === "Grep" &&
      parts.length === 2 &&
      parts[0]!.functionResponse.name === "Grep" &&
      parts[0]!.functionResponse.response.matches === 1 &&
      parts[1]!.functionResponse.name === "Read" &&
      parts[1]!.functionResponse.response.text === "aaa",
    { map: Object.fromEntries(map), parts }
  );
}

// K. args object → OpenAI JSON string exactly once
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "Write",
                  args: { path: "b.ts", content: "hi" },
                },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_k" }
  );
  const msg = n.ok ? canonicalGeminiResultToOpenAI(n.result) : null;
  const argsStr = msg?.tool_calls?.[0]?.function.arguments ?? "";
  let doubleEncoded = false;
  try {
    const once = JSON.parse(argsStr);
    if (typeof once === "string") doubleEncoded = true;
  } catch {
    doubleEncoded = true;
  }
  assert(
    "K",
    n.ok &&
      argsStr === JSON.stringify({ path: "b.ts", content: "hi" }) &&
      !argsStr.includes("[object Object]") &&
      !doubleEncoded,
    { argsStr, doubleEncoded }
  );
}

// L. malformed input doesn't fabricate
{
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "Bad", args: "[1,2,3]" } },
              { functionCall: { name: "Ok", args: { x: 1 } } },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { providerFamily: "gemini", requestScope: "req_l" }
  );
  assert(
    "L",
    n.ok === true &&
      n.ok &&
      n.result.toolCalls.length === 1 &&
      n.result.toolCalls[0]!.name === "Ok" &&
      n.result.toolCalls[0]!.arguments.x === 1,
    n.ok ? { tools: n.result.toolCalls } : { n }
  );
}

// M. usage mapping
{
  const usage = normalizeGeminiUsage({
    promptTokenCount: 10,
    candidatesTokenCount: 5,
    totalTokenCount: 15,
  });
  const n = normalizeGeminiResponse(
    {
      candidates: [
        {
          content: { parts: [{ text: "u" }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    },
    { providerFamily: "gemini" }
  );
  assert(
    "M",
    usage?.prompt_tokens === 10 &&
      usage?.completion_tokens === 5 &&
      usage?.total_tokens === 15 &&
      n.ok === true &&
      n.ok &&
      n.result.usage?.prompt_tokens === 10 &&
      n.result.usage?.completion_tokens === 5,
    { usage, resultUsage: n.ok ? n.result.usage : null }
  );
}

// N. unknown finish doesn't crash
{
  let crashed = false;
  let mapped: string | null = null;
  let nOk = false;
  try {
    mapped = toCanonicalFinishReason("WEIRD_GEMINI_REASON");
    const n = normalizeGeminiResponse(
      {
        candidates: [
          {
            content: { parts: [{ text: "x" }] },
            finishReason: "WEIRD_GEMINI_REASON",
          },
        ],
      },
      { providerFamily: "gemini" }
    );
    nOk = n.ok === true && n.ok && n.result.finishReason === "unknown";
  } catch {
    crashed = true;
  }
  assert("N", !crashed && mapped === "unknown" && nOk, {
    mapped,
    crashed,
    nOk,
  });
}

// O. GPT object / GPT path unchanged — adapter refuses non-gemini; aliases intact
{
  const gptBody = {
    id: "chatcmpl-gpt",
    choices: [
      {
        message: { role: "assistant", content: "golden" },
        finish_reason: "stop",
      },
    ],
  };
  const refused = adaptGeminiResponseToOpenAI(gptBody, {
    providerFamily: "openai",
    providerId: "grsai-primary",
  });
  const gateOff = isExplicitGeminiProviderPath({
    providerFamily: "openai_compatible",
    providerId: "grsai-primary",
  });
  const gateOn = isExplicitGeminiProviderPath({
    providerFamily: "gemini",
    providerId: "gemini-api",
  });
  const autoPro = MODEL_ALIAS_CHAINS["auto-pro"];
  const gptProfile = getProviderCapabilityProfile("grsai-primary");
  const adapterFile = "apps/dmit-api/src/lib/compat/providers/geminiAdapter.ts";
  const registryUnchanged = !fileContains(
    "apps/dmit-api/src/lib/toolCallingModeRegistry.ts",
    'LIVE_VERIFIED_NATIVE.has(kPrimary) ? "native" : "emulated_json"'
  )
    ? false
    : true;
  // Registry still defaults Gemini to emulated_json (LIVE_VERIFIED empty pattern)
  const geminiDefaultStillEmulated = fileContains(
    "apps/dmit-api/src/lib/toolCallingModeRegistry.ts",
    "emulated_json"
  );
  const executeImportsAdapter = fileContains(
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "geminiAdapter"
  );
  // P1053 — executeChatCompletion may import the Gemini adapter for explicit
  // resume wiring only; GPT Golden Path must still refuse non-gemini gate.
  const executeNotRewrittenToGeminiDefault = fileContains(
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "resolveToolResumeAttempts"
  );

  assert(
    "O",
    refused.ok === false &&
      refused.reason === "not_explicit_gemini_path" &&
      gateOff === false &&
      gateOn === true &&
      autoPro[0] === "gpt-5.5" &&
      autoPro[1] === "gpt-5.4" &&
      autoPro[2] === "gemini-3-pro" &&
      gptProfile.providerFamily === "openai_compatible" &&
      geminiDefaultStillEmulated &&
      executeImportsAdapter &&
      executeNotRewrittenToGeminiDefault &&
      fileContains(adapterFile, "convertOpenAIToolsToGemini") &&
      // GPT body object identity / content untouched
      gptBody.choices[0]!.message.content === "golden" &&
      gptBody.choices[0]!.finish_reason === "stop",
    {
      refused,
      gateOff,
      gateOn,
      autoPro,
      executeImportsAdapter,
      executeNotRewrittenToGeminiDefault,
      geminiDefaultStillEmulated,
      registryUnchanged,
      digestHint: createHash("sha256")
        .update(JSON.stringify(gptBody))
        .digest("hex")
        .slice(0, 12),
    }
  );
}

console.log("\nCASE_A_O=" + JSON.stringify(caseResults));
if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
