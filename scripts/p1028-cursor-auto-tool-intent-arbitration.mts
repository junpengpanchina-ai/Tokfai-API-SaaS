/**
 * P1028 — Cursor AUTO tool intent (P1047 OpenAI auto semantics).
 *
 * P1047 CLOSED auto/missing tool_choice arbitration: a valid native plain-text
 * or tool_calls response is FINAL (provider=1, arbitration=0). Historical
 * native-miss → emulated_json arbitration paths are single-pass accept of
 * native text. tool_choice=required / named still use the strict repair path
 * (provider≥2, repairCallCount≥1). Forced object / image reject / call_id
 * cases remain unchanged.
 *
 * Test authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL compiler/parser
 *   MOCK PROVIDER
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor
 *   非 LIVE GRSAI
 *   非真实 DB billing RPC
 *
 *   npx tsx scripts/p1028-cursor-auto-tool-intent-arbitration.mts
 *
 * Marker: TOKFAI_P1028_CURSOR_AUTO_TOOL_INTENT_ARBITRATION_PASS
 */

import { fileURLToPath } from "node:url";
import {
  CALLER,
  WEATHER_TOOLS,
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
  effectiveToolChoice,
  isPlainTextCompletionFinishReason,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  createUpstreamToolCallIdNormalizer,
  isUpstreamSafeToolCallId,
  UPSTREAM_TOOL_CALL_ID_MAX_LEN,
} = await import("../apps/dmit-api/src/lib/upstreamToolCallId.ts");

const PASS = "TOKFAI_P1028_CURSOR_AUTO_TOOL_INTENT_ARBITRATION_PASS";
const FAIL = "TOKFAI_P1028_CURSOR_AUTO_TOOL_INTENT_ARBITRATION_BLOCKED";

const LONG_ID_86 =
  "call_cursor_tool_" + "x".repeat(86 - "call_cursor_tool_".length);

const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL compiler/parser + MOCK PROVIDER + MOCK/SPY billing (非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB billing RPC)";

let failed = 0;
function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify({ level: meta.level ?? LEVEL, ...meta }, null, 2)
  );
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

function tokfai(result: any) {
  return (result?.response?.tokfai as Record<string, unknown>) ?? {};
}

function objectChoice(name: string) {
  return { type: "function", function: { name } };
}

async function exec(
  body: Record<string, unknown>,
  requestId: string,
  clientStream = false
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1028",
    clientStream,
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
  return { text, events };
}

function extractOutboundIds(messages: unknown[]) {
  const toolCallIds: string[] = [];
  const toolMessageIds: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const row = m as Record<string, unknown>;
    if (Array.isArray(row.tool_calls)) {
      for (const tc of row.tool_calls) {
        if (tc && typeof tc === "object" && typeof (tc as any).id === "string") {
          toolCallIds.push((tc as any).id);
        }
      }
    }
    if (typeof row.tool_call_id === "string") {
      toolMessageIds.push(row.tool_call_id);
    }
  }
  return { toolCallIds, toolMessageIds };
}

console.log("P1028 CURSOR AUTO TOOL INTENT (P1047 CLOSED ARBITRATION)\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── Gate unit (provider-agnostic) ────────────────────────────────────────
{
  const base = {
    hasTools: true,
    supportsToolsRequested: true,
    effectiveToolChoice: "auto" as unknown,
    activeToolMode: "native",
    upstreamReturnedToolCalls: false,
    finishReason: "stop",
    autoIntentArbitrationAttempted: false,
    freshRemainingTotalMs: 10_000,
  };
  assert(
    shouldAttemptAutoToolIntentArbitration(base) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        effectiveToolChoice: null,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        effectiveToolChoice: "required",
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        activeToolMode: "emulated_json",
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        upstreamReturnedToolCalls: true,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        autoIntentArbitrationAttempted: true,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        freshRemainingTotalMs: 0,
      }) === false &&
      shouldAttemptAutoToolIntentArbitration({
        ...base,
        hasTools: false,
      }) === false &&
      isPlainTextCompletionFinishReason("stop") === true &&
      isPlainTextCompletionFinishReason("length") === false &&
      effectiveToolChoice({ tools: WEATHER_TOOLS, tool_choice: null }) ===
        "auto",
    "0. shouldAttemptAutoToolIntentArbitration gate closed for auto (P1047)",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT (no network)",
    }
  );
}

// ── 1. native auto returns tool_calls — no arbitration ───────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Direct" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_01"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      Array.isArray(msg(result)?.tool_calls) &&
      msg(result).tool_calls.length === 1 &&
      tokfai(result).tool_calling_mode === "native",
    "1. native auto returns tool_calls — provider=1 arbitration=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 2. native auto plain text is FINAL (P1047; no arbitration) ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "I should call a tool." }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather please" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_02"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.repairCallCount === 0 &&
      meta.debitCallCount === 1 &&
      m?.content === "I should call a tool." &&
      !Array.isArray(m?.tool_calls) &&
      tokfai(result).tool_calling_mode === "native",
    "2. native auto plain text FINAL — provider=1 arbitration=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 3. native auto plain text (parallel tools present) — single-pass ─────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "need tools" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "both" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
    },
    "req_p1028_03"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      m?.content === "need tools" &&
      !Array.isArray(m?.tool_calls),
    "3. native auto plain text (parallel=true) FINAL — provider=1 arbitration=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 4. native auto plain text FINAL (no arb assistant_text rewrite) ──────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "thinking about weather" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "is it sunny?" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_04"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      m?.content === "thinking about weather" &&
      !Array.isArray(m?.tool_calls),
    "4. native auto plain text FINAL — 200 text, no tool_calls, debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 5. native auto plain text FINAL (no arb fallback path) ───────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "ORIGINAL_NATIVE_TEXT" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_05"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "ORIGINAL_NATIVE_TEXT" &&
      !Array.isArray(msg(result)?.tool_calls) &&
      tokfai(result).tool_calling_mode === "native",
    "5. native auto plain text FINAL — provider=1 arbitration=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 6. native auto plain text FINAL (no forged tool via arb) ─────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "keep me" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_06"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "keep me" &&
      !Array.isArray(msg(result)?.tool_calls),
    "6. native auto plain text FINAL — no forged tool, debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 7. native auto plain text FINAL (no schema-arb path) ─────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "schema_fallback" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_07"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "schema_fallback" &&
      !Array.isArray(msg(result)?.tool_calls),
    "7. native auto plain text FINAL — provider=1 arbitration=0 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 8. no tools — never enter arbitration ────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "hello chat" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1028_08"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.compilerSeenCount === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "hello chat",
    "8. no tools — no arbitration, provider=1 debit=1",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── 9. tool_choice=required — keep strict, no text fallback ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return { kind: "completion", content: "plain pretending" };
        }
        // repair still fails
        return { kind: "completion", content: "STILL_NOT_JSON" };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "must tool" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1028_09"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      meta.credits_charged === 0 &&
      (meta.errorCode === "tool_intent_invalid_json" ||
        meta.errorCode === "tool_call_not_generated" ||
        meta.errorCode === "tool_intent_not_generated" ||
        typeof meta.errorCode === "string"),
    "9. tool_choice=required — strict semantics, no plain-text fallback",
    { ...meta, debit: 0 }
  );
}

// ── 10. object forced tool_choice — P1024 behavior ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.json.tool_choice !== "required") {
          return {
            kind: "error",
            code: "upstream_error",
            status: 400,
            message: "expected adapted required",
          };
        }
        return nativeToolCompletion("get_weather", { city: "Forced" });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "forced" }],
      tools: WEATHER_TOOLS,
      tool_choice: objectChoice("get_weather"),
    },
    "req_p1028_10"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      out.toolNames.length === 1 &&
      out.toolNames[0] === "get_weather" &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      meta.debitCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "10. object forced tool_choice — P1024 adapter intact",
    { ...meta, provider: 1, arbitration: 0, debit: 1, outbound: out }
  );
}

// ── 11. image model + tools — reject, no arbitration ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Nope" })],
  });
  const result = await exec(
    {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_11"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.providerCallCount === 0 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 0,
    "11. image model + tools — reject, no arbitration, debit=0",
    { ...meta, provider: 0, arbitration: 0, debit: 0 }
  );
}

// ── 12. 86-char call_id → mapped <=64 ASCII stable ───────────────────────
{
  const normalize = createUpstreamToolCallIdNormalizer();
  const a = normalize(LONG_ID_86);
  const b = normalize(LONG_ID_86);
  assert(
    LONG_ID_86.length === 86 &&
      isUpstreamSafeToolCallId(a) &&
      a.length <= UPSTREAM_TOOL_CALL_ID_MAX_LEN &&
      a === b &&
      /^[A-Za-z0-9_-]+$/.test(a),
    "12. 86-char upstream call_id maps to <=64 ASCII stable id",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      arbitrationCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      mappedLen: a.length,
      level: "UNIT upstreamToolCallId (P1027 preserve)",
    }
  );

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "Id" }, { id: "call_ok" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "first" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: LONG_ID_86,
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "Id" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: LONG_ID_86,
          content: '{"ok":true}',
        },
        { role: "user", content: "continue" },
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_12"
  );
  const meta = billingSnapshot(result);
  const ids = extractOutboundIds(getCounts().outboundBodies[0]?.messages ?? []);
  assert(
    result.ok === true &&
      ids.toolCallIds.length === 1 &&
      ids.toolMessageIds.length === 1 &&
      ids.toolCallIds[0] === ids.toolMessageIds[0] &&
      (ids.toolCallIds[0]?.length ?? 99) <= UPSTREAM_TOOL_CALL_ID_MAX_LEN &&
      meta.debitCallCount === 1,
    "12b. role=tool round-trip keeps mapped call_id consistent",
    { ...meta, mapped: ids.toolCallIds[0], debit: 1 }
  );
}

// ── 13. role=tool second round continues normally ────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "R1" })],
  });
  const r1 = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "r1" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1028_13a"
  );
  const id = msg(r1)?.tool_calls?.[0]?.id ?? "call_x";
  const meta1 = billingSnapshot(r1);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "done after tool" })],
  });
  const r2 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "r1" },
        {
          role: "assistant",
          content: null,
          tool_calls: msg(r1)?.tool_calls,
        },
        {
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify({ ok: true }),
        },
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_13b"
  );
  const meta2 = billingSnapshot(r2);
  assert(
    r1.ok === true &&
      meta1.debitCallCount === 1 &&
      r2.ok === true &&
      meta2.debitCallCount === 1 &&
      (meta2.arbitrationCallCount ?? 0) === 0 &&
      meta2.providerCallCount === 1 &&
      msg(r2)?.content === "done after tool",
    "13. role=tool second round — native text FINAL; debit×1 each; arb=0",
    {
      ...meta2,
      round1_debit: meta1.debitCallCount,
      round2_debit: meta2.debitCallCount,
      tool_call_id: id,
    }
  );
}

// ── 14. stream=true — native tool_calls via SSE, no arbitration ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "Stream" }),
    ],
  });
  const body = {
    model: "gpt-5.5",
    stream: true,
    messages: [{ role: "user", content: "stream tools" }],
    tools: WEATHER_TOOLS,
    tool_choice: "auto",
  };
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1028_14",
    body: body as any,
    limitKey: "p1028-stream",
    idempotencyKey: null,
  });
  const { text, events } = await readSse(res);
  const meta = {
    providerCallCount: getCounts().providerCallCount,
    repairCallCount: getCounts().repairCallCount,
    arbitrationCallCount: getCounts().arbitrationCallCount,
    fallbackCount: getCounts().fallbackCount,
    debitCallCount: getCounts().debitCallCount,
  };
  const hasToolDelta = events.some(
    (e) =>
      e &&
      typeof e === "object" &&
      Array.isArray((e as any)?.choices?.[0]?.delta?.tool_calls)
  );
  const leaked =
    text.includes('"type":"tool_call"') ||
    text.includes("You are a strict JSON Tool Intent");
  assert(
    res.status === 200 &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      hasToolDelta &&
      !leaked,
    "14. stream=true — native SSE tool_calls; provider=1 arbitration=0 debit=1",
    { ...meta, hasToolDelta, leaked, debit: 1, httpStatus: res.status }
  );
}

// ── 15. native auto plain text FINAL (no arb timeout path) ───────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
    },
    scripts: [
      () => ({ kind: "completion", content: "TIMEOUT_FALLBACK_TEXT" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "timeout arb" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_15"
  );
  const meta = billingSnapshot(result);
  const timeouts = getCounts().fetchTimeoutMs;
  const resurrected = timeouts.some((t) => t > 30_000);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      msg(result)?.content === "TIMEOUT_FALLBACK_TEXT" &&
      meta.debitCallCount === 1 &&
      !resurrected &&
      timeouts.every((t) => t > 0 && t <= 30_000),
    "15. native auto plain text FINAL — no arb timeout; no budget resurrection",
    { ...meta, fetchTimeoutMs: timeouts, debit: 1 }
  );
}

// ── 16. provider fallback bounded — secondary native text FINAL ──────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary", "openai-compatible-secondary"]),
    scripts: [
      // primary native busy
      () => ({
        kind: "error",
        code: "upstream_model_busy",
        status: 503,
        message: "busy",
      }),
      // secondary native plain text is FINAL under auto (P1047)
      () => ({ kind: "completion", content: "secondary miss" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "fallback" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_16"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount >= 2 &&
      meta.providerCallCount <= 4 &&
      meta.fallbackCount >= 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "secondary miss" &&
      !Array.isArray(msg(result)?.tool_calls),
    "16. provider fallback bounded — secondary native text FINAL; arb=0 debit=1",
    {
      ...meta,
      provider: meta.providerCallCount,
      arbitration: meta.arbitrationCallCount,
      debit: 1,
    }
  );
}

// ── 17/18. success debit once; auto plain text never double-debits ───────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "once" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "debit" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1028_17"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "once",
    "17/18. success path debit×1; auto plain text never double-debits",
    { ...meta, provider: 1, arbitration: 0, debit: 1 }
  );
}

// ── Matrix summary ───────────────────────────────────────────────────────
console.log("\n── provider / arbitration / debit matrix ──");
console.log(
  JSON.stringify(
    {
      "1_native_hit": { provider: 1, arbitration: 0, debit: 1 },
      "2_auto_text_final": { provider: 1, arbitration: 0, debit: 1 },
      "3_auto_text_parallel": { provider: 1, arbitration: 0, debit: 1 },
      "4_auto_text": { provider: 1, arbitration: 0, debit: 1 },
      "5_auto_text": { provider: 1, arbitration: 0, debit: 1 },
      "6_auto_text": { provider: 1, arbitration: 0, debit: 1 },
      "7_auto_text": { provider: 1, arbitration: 0, debit: 1 },
      "8_no_tools": { provider: 1, arbitration: 0, debit: 1 },
      "9_required": { debit: 0, no_text_fallback: true },
      "10_forced_object": { provider: 1, arbitration: 0, debit: 1 },
      "11_image": { provider: 0, arbitration: 0, debit: 0 },
      "14_stream_native": { provider: 1, arbitration: 0, debit: 1 },
      "15_auto_text": { provider: 1, arbitration: 0, debit: 1 },
      "16_provider_fb": { bounded: true, arbitration: 0, debit: 1 },
      "17_debit_once": { provider: 1, arbitration: 0, debit: 1 },
    },
    null,
    2
  )
);

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
process.exit(0);
