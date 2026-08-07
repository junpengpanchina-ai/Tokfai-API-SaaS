/**
 * P1053 — Gemini real tool-resume wiring (additive adapter path).
 *
 * REAL executeChatCompletion + REAL P1051 adapter conversion.
 * MOCK provider / billing boundaries via p1018 harness.
 *
 *   npx tsx scripts/p1053-gemini-tool-resume-wiring.mts
 *
 * Marker: TOKFAI_P1053_GEMINI_REAL_TOOL_RESUME_WIRING_PASS
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
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  resolveNativeToolResumeAttempts,
  resolveToolResumeAttempts,
  TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  convertOpenAIMessagesForGeminiAdapterResume,
  isRegisteredGeminiAdapterToolResumeModel,
} = await import("../apps/dmit-api/src/lib/compat/providers/geminiAdapter.ts");
const { MODEL_ALIAS_CHAINS } = await import(
  "../apps/dmit-api/src/upstream/modelAliases.ts"
);
const {
  INVALID_TOOL_CALL_ID_CODE,
  DUPLICATE_TOOL_RESULT_CODE,
  MISSING_TOOL_RESULT_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1053_GEMINI_REAL_TOOL_RESUME_WIRING_PASS";
const FAIL = "TOKFAI_P1053_GEMINI_REAL_TOOL_RESUME_WIRING_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion + REAL Gemini adapter + MOCK provider/billing";

let failed = 0;
const caseResults: Record<string, string> = {};

function pass(id: string, meta?: Record<string, unknown>) {
  caseResults[id] = "PASS";
  console.log(`PASS  ${id}`);
  if (meta) console.log(JSON.stringify({ level: LEVEL, ...meta }, null, 2));
}
function fail(id: string, detail?: string) {
  failed += 1;
  caseResults[id] = "FAIL";
  console.error(`FAIL  ${id}${detail ? ` — ${detail}` : ""}`);
}
function assert(id: string, cond: boolean, meta?: Record<string, unknown>) {
  if (cond) pass(id, meta);
  else fail(id, meta ? JSON.stringify(meta) : undefined);
}

function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}

function outboundHasRawToolRole(): boolean {
  for (const body of getCounts().outboundBodies) {
    for (const m of body.messages ?? []) {
      if (!m || typeof m !== "object") continue;
      const role = String((m as { role?: unknown }).role ?? "");
      if (role === "tool" || role === "function") return true;
      if (
        Array.isArray((m as { tool_calls?: unknown }).tool_calls) &&
        ((m as { tool_calls: unknown[] }).tool_calls?.length ?? 0) > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function outboundHasFunctionResponse(): boolean {
  for (const body of getCounts().outboundBodies) {
    for (const m of body.messages ?? []) {
      if (!m || typeof m !== "object") continue;
      const c = (m as { content?: unknown }).content;
      if (typeof c === "string" && c.includes("functionResponse")) return true;
    }
  }
  return false;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1053",
    clientStream: false,
  });
}

function tc(id: string, name: string, args: Record<string, unknown>) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function assistantTools(tool_calls: ReturnType<typeof tc>[]) {
  return { role: "assistant", content: null, tool_calls };
}

function toolMsg(tool_call_id: string, content: unknown) {
  return {
    role: "tool",
    tool_call_id,
    content: typeof content === "string" ? content : JSON.stringify(content),
  };
}

console.log("P1053 GEMINI REAL TOOL RESUME WIRING\n");

// A. GPT native resume — adapter conversion = 0
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "gpt native resume final",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "do it" },
        assistantTools([tc("call_gpt_a", "Read", { path: "a.ts" })]),
        toolMsg("call_gpt_a", { text: "file" }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1053_a"
  );
  const meta = billingSnapshot(result);
  assert(
    "A",
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "gpt native resume final" &&
      // GPT native path keeps OpenAI tool transcript (no Gemini adapter rewrite)
      getCounts().outboundBodies.some((b) =>
        (b.messages ?? []).some(
          (m) =>
            m &&
            typeof m === "object" &&
            (m as { role?: string }).role === "tool"
        )
      ),
    {
      ...meta,
      content: msg(result)?.content ?? null,
      adapterModel: isRegisteredGeminiAdapterToolResumeModel("gpt-5.5"),
    }
  );
}

// B. Gemini valid trailing tool result — resume accepted + converted
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("gemini round2 final text"),
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [
        { role: "user", content: "status?" },
        assistantTools([
          tc("call_tokfai_1", "get_tokfai_status", { detailed: true }),
        ]),
        toolMsg("call_tokfai_1", { ok: true, status: "up" }),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_tokfai_status",
            description: "Tokfai status",
            parameters: {
              type: "object",
              properties: { detailed: { type: "boolean" } },
            },
          },
        },
      ],
      tool_choice: "auto",
    },
    "req_p1053_b"
  );
  const meta = billingSnapshot(result);
  const unit = convertOpenAIMessagesForGeminiAdapterResume([
    { role: "user", content: "status?" },
    assistantTools([
      tc("call_tokfai_1", "get_tokfai_status", { detailed: true }),
    ]),
    toolMsg("call_tokfai_1", { ok: true, status: "up" }),
  ]);
  assert(
    "B",
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      meta.errorCode !== TOOL_ROUND_RESUME_UNAVAILABLE_CODE &&
      !outboundHasRawToolRole() &&
      outboundHasFunctionResponse() &&
      unit.converted === true &&
      isRegisteredGeminiAdapterToolResumeModel("gemini-3-pro") &&
      resolveToolResumeAttempts({ attempts: ["gemini-3-pro"] }).join(",") ===
        "gemini-3-pro" &&
      resolveNativeToolResumeAttempts({
        attempts: ["gemini-3-pro"],
      }).length === 0 &&
      msg(result)?.content === "gemini round2 final text",
    {
      ...meta,
      rawToolSent: outboundHasRawToolRole(),
      functionResponsePresent: outboundHasFunctionResponse(),
      unitConverted: unit.converted,
      content: msg(result)?.content ?? null,
    }
  );
}

// C. Gemini malformed transcript — P1033 reject, no fetch
{
  const cases: Array<{
    id: string;
    messages: unknown[];
    code: string;
  }> = [
    {
      id: "C_unmatched",
      code: INVALID_TOOL_CALL_ID_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_known", "Read", { path: "a.ts" })]),
        toolMsg("call_UNKNOWN", {}),
      ],
    },
    {
      id: "C_duplicate",
      code: DUPLICATE_TOOL_RESULT_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_dup", "Read", { path: "a.ts" })]),
        toolMsg("call_dup", { a: 1 }),
        toolMsg("call_dup", { a: 2 }),
      ],
    },
    {
      id: "C_missing",
      code: MISSING_TOOL_RESULT_CODE,
      messages: [
        { role: "user", content: "u" },
        assistantTools([
          tc("call_m1", "Read", { path: "a.ts" }),
          tc("call_m2", "Read", { path: "b.ts" }),
        ]),
        toolMsg("call_m1", { text: "only one" }),
      ],
    },
  ];

  let allOk = true;
  const details: Record<string, unknown> = {};
  for (const c of cases) {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({ kind: "completion", content: "no", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      ],
    });
    const result = await exec(
      {
        model: "gemini-3-pro",
        messages: c.messages,
        tools: AGENT_FILE_TOOLS,
      },
      `req_p1053_${c.id}`
    );
    const meta = billingSnapshot(result);
    const ok =
      result.ok === false &&
      meta.errorCode === c.code &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0;
    details[c.id] = { ok, ...meta };
    if (!ok) allOk = false;
  }
  assert("C", allOk, details);
}

// D. unsupported non-native without adapter → still unavailable
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    ],
  });
  // gemini-2.5-pro is catalog chat but NOT in native resume and NOT in
  // GEMINI_ADAPTER_TOOL_RESUME_MODELS — gate must still refuse.
  const result = await exec(
    {
      model: "gemini-2.5-pro",
      messages: [
        { role: "user", content: "u" },
        assistantTools([tc("call_d1", "Read", { path: "a.ts" })]),
        toolMsg("call_d1", { text: "t" }),
      ],
      // no tools[] — still a legal resume transcript for gate testing
    },
    "req_p1053_d"
  );
  const meta = billingSnapshot(result);
  assert(
    "D",
    result.ok === false &&
      meta.errorCode === TOOL_ROUND_RESUME_UNAVAILABLE_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0 &&
      !isRegisteredGeminiAdapterToolResumeModel("gemini-2.5-pro") &&
      resolveToolResumeAttempts({ attempts: ["gemini-2.5-pro"] }).length ===
        0 &&
      MODEL_ALIAS_CHAINS["auto-pro"].join(",") ===
        "gpt-5.5,gpt-5.4,gemini-3-pro",
    {
      ...meta,
      registered: isRegisteredGeminiAdapterToolResumeModel("gemini-2.5-pro"),
      autoPro: MODEL_ALIAS_CHAINS["auto-pro"],
    }
  );
}

// E. Gemini successful Round-2 — final text, debit once, no fake tool_call
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("all tools done — summary"),
        usage: {
          prompt_tokens: 40,
          completion_tokens: 12,
          total_tokens: 52,
        },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [
        { role: "user", content: "read then summarize" },
        assistantTools([tc("call_e1", "Read", { path: "x.ts" })]),
        toolMsg("call_e1", { text: "export const x = 1" }),
      ],
      tools: AGENT_FILE_TOOLS,
      tool_choice: "auto",
    },
    "req_p1053_e"
  );
  const meta = billingSnapshot(result);
  const message = msg(result);
  assert(
    "E",
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      typeof message?.content === "string" &&
      message.content.includes("summary") &&
      !Array.isArray(message?.tool_calls) &&
      !outboundHasRawToolRole(),
    {
      ...meta,
      content: message?.content ?? null,
      tool_calls: message?.tool_calls ?? null,
    }
  );
}

// F. Gemini provider failure — no successful debit
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "error",
        code: "upstream_error",
        message: "gemini upstream 500",
        upstreamStatus: 500,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [
        { role: "user", content: "x" },
        assistantTools([tc("call_f1", "Read", { path: "f.ts" })]),
        toolMsg("call_f1", { text: "body" }),
      ],
      tools: AGENT_FILE_TOOLS,
    },
    "req_p1053_f"
  );
  const meta = billingSnapshot(result);
  assert(
    "F",
    result.ok === false &&
      meta.providerCallCount >= 1 &&
      meta.debitCallCount === 0 &&
      meta.billing_status !== "charged",
    meta
  );
}

console.log("\nCASE_A_F=" + JSON.stringify(caseResults));
if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
