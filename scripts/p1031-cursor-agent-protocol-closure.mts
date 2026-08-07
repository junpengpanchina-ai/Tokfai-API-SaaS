/**
 * P1031 — Cursor Agent protocol closure (local, non-LIVE).
 *
 * Proves OpenAI-compatible tool_calls wire shape for stream + non-stream,
 * tool_choice null/missing ≡ auto, role=tool round-trip IDs, and P1030
 * commercial aggregation still holds.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL chat completion mapper
 *   REAL SSE mapper
 *   REAL tool intent compiler/parser
 *   MOCK PROVIDER
 *   MOCK/SPY billing RPC
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1031-cursor-agent-protocol-closure.mts
 *
 * Marker: TOKFAI_P1031_READY_FOR_CURSOR_LIVE_FILE_CANARY
 * (LIVE Cursor file E2E is a separate deployed canary — see runbook.)
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
const { respondChatCompletionEarlySse } = await loadRespondEarlySse();
const { chatCompletionToSseBody, chatCompletionSseBodyAfterRole } =
  await import("../apps/dmit-api/src/lib/chatCompletionSse.ts");
const { effectiveToolChoice } = await import(
  "../apps/dmit-api/src/lib/toolCallCapability.ts"
);
const { analyzeToolRoundTrip } = await import(
  "../apps/dmit-api/src/lib/cursorToolProtocol.ts"
);
const {
  createUpstreamToolCallIdNormalizer,
  isUpstreamSafeToolCallId,
  UPSTREAM_TOOL_CALL_ID_MAX_LEN,
} = await import("../apps/dmit-api/src/lib/upstreamToolCallId.ts");

const PASS = "TOKFAI_P1031_READY_FOR_CURSOR_LIVE_FILE_CANARY";
const FAIL = "TOKFAI_P1031_CURSOR_PROTOCOL_BLOCKED";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL SSE mapper + REAL compiler/parser + MOCK PROVIDER + MOCK/SPY billing (非 LIVE Cursor)";

const NATIVE_USAGE = {
  prompt_tokens: 101,
  completion_tokens: 7,
  total_tokens: 108,
};
const ARB_USAGE = {
  prompt_tokens: 13,
  completion_tokens: 3,
  total_tokens: 16,
};

const LONG_ID_86 =
  "call_cursor_tool_" + "x".repeat(86 - "call_cursor_tool_".length);

let failed = 0;
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
function choice(result: any) {
  return result?.response?.choices?.[0] ?? null;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1031",
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
  return { text, events };
}

function collectToolArgByIndex(events: unknown[]) {
  const args = new Map<number, string>();
  const ids = new Map<number, string>();
  const names = new Map<number, string>();
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const tcs = (e as any)?.choices?.[0]?.delta?.tool_calls;
    if (!Array.isArray(tcs)) continue;
    for (const tc of tcs) {
      const idx = typeof tc.index === "number" ? tc.index : 0;
      if (typeof tc.id === "string") {
        if (ids.has(idx) && ids.get(idx) !== tc.id) {
          return { ok: false as const, reason: "duplicate_id_conflict" };
        }
        ids.set(idx, tc.id);
      }
      const fn = tc.function ?? {};
      if (typeof fn.name === "string" && fn.name.length > 0) {
        names.set(idx, fn.name);
      }
      if (typeof fn.arguments === "string") {
        args.set(idx, (args.get(idx) ?? "") + fn.arguments);
      } else if (fn.arguments != null && typeof fn.arguments === "object") {
        return { ok: false as const, reason: "arguments_object_in_sse" };
      }
    }
  }
  return { ok: true as const, args, ids, names };
}

console.log("P1031 CURSOR AGENT PROTOCOL CLOSURE\n");
console.log(`Authenticity: ${LEVEL}\n`);

// ── A. stream=false single tool ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "SF" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_a"
  );
  const m = msg(result);
  const tc = m?.tool_calls?.[0];
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      result.response?.object === "chat.completion" &&
      m?.role === "assistant" &&
      m?.content === null &&
      Array.isArray(m?.tool_calls) &&
      m.tool_calls.length === 1 &&
      typeof tc?.id === "string" &&
      tc.id.length > 0 &&
      tc.id.length <= 64 &&
      /^[A-Za-z0-9_-]+$/.test(tc.id) &&
      tc.type === "function" &&
      tc.function?.name === "get_weather" &&
      typeof tc.function?.arguments === "string" &&
      JSON.parse(tc.function.arguments).city === "SF" &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.debitCallCount === 1,
    "A. stream=false single tool — OpenAI wire shape",
    { ...meta, tool_id: tc?.id, finish: choice(result)?.finish_reason }
  );
}

// ── B. stream=true single tool ───────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Stream" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1031_b",
    body: {
      model: "auto-pro",
      stream: true,
      messages: [{ role: "user", content: "stream" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    } as any,
    limitKey: "p1031-b",
    idempotencyKey: null,
  });
  const { text, events } = await readSse(res);
  const collected = collectToolArgByIndex(events);
  const finish = events.find(
    (e) =>
      e &&
      typeof e === "object" &&
      (e as any)?.choices?.[0]?.finish_reason === "tool_calls"
  );
  const roleOnly = events.some(
    (e) =>
      e &&
      typeof e === "object" &&
      (e as any)?.choices?.[0]?.delta?.role === "assistant" &&
      (e as any)?.choices?.[0]?.delta?.content === undefined
  );
  const contentDeltaWithTools = events.some((e) => {
    if (!e || typeof e !== "object") return false;
    const d = (e as any)?.choices?.[0]?.delta;
    return (
      d &&
      typeof d.content === "string" &&
      d.content.length > 0 &&
      Array.isArray(d.tool_calls)
    );
  });
  let argsOk = false;
  if (collected.ok) {
    try {
      argsOk = JSON.parse(collected.args.get(0) ?? "").city === "Stream";
    } catch {
      argsOk = false;
    }
  }
  assert(
    res.status === 200 &&
      collected.ok &&
      collected.ids.has(0) &&
      collected.names.get(0) === "get_weather" &&
      argsOk &&
      !!finish &&
      events.includes("[DONE]") &&
      roleOnly &&
      !contentDeltaWithTools &&
      !text.includes("You are a strict JSON Tool Intent") &&
      getCounts().debitCallCount === 1,
    "B. stream=true single tool — delta.tool_calls + [DONE]",
    {
      providerCallCount: getCounts().providerCallCount,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: getCounts().debitCallCount,
      args: collected.ok ? collected.args.get(0) : null,
      roleOnly,
    }
  );
}

// ── C. stream=true multi tool (native single-pass; P1047) ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion" as const,
        content: null,
        tool_calls: [
          ...makeNativeToolCalls("get_weather", { city: "Shanghai" }, "call_w"),
          ...makeNativeToolCalls("get_time", { tz: "Asia/Shanghai" }, "call_t"),
        ],
        finish_reason: "tool_calls",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1031_c",
    body: {
      model: "gpt-5.5",
      stream: true,
      messages: [{ role: "user", content: "multi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
    } as any,
    limitKey: "p1031-c",
    idempotencyKey: null,
  });
  const { events } = await readSse(res);
  const collected = collectToolArgByIndex(events);
  let a0 = false;
  let a1 = false;
  if (collected.ok) {
    try {
      a0 = JSON.parse(collected.args.get(0) ?? "").city === "Shanghai";
      a1 = JSON.parse(collected.args.get(1) ?? "").tz === "Asia/Shanghai";
    } catch {
      a0 = false;
    }
  }
  const ids = collected.ok
    ? [...collected.ids.values()]
    : ([] as string[]);
  assert(
    res.status === 200 &&
      collected.ok &&
      collected.ok &&
      collected.ids.has(0) &&
      collected.ids.has(1) &&
      ids[0] !== ids[1] &&
      a0 &&
      a1 &&
      events.includes("[DONE]") &&
      getCounts().providerCallCount === 1 &&
      (getCounts().arbitrationCallCount ?? 0) === 0,
    "C. stream=true multi tool — indexes independent, args not crossed",
    {
      providerCallCount: getCounts().providerCallCount,
      repairCallCount: getCounts().repairCallCount,
      arbitrationCallCount: getCounts().arbitrationCallCount,
      fallbackCount: 0,
      debitCallCount: getCounts().debitCallCount,
      ids,
    }
  );
}

// ── D. native tool_calls — no envelope leak, unified mappers (P1047) ─────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Emu" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "emu" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_d"
  );
  const sse = chatCompletionToSseBody(result.response as any);
  assert(
    result.ok === true &&
      msg(result)?.content === null &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      !JSON.stringify(result.response).includes('"type":"tool_call"') &&
      !sse.includes("You are a strict JSON Tool Intent") &&
      sse.includes("tool_calls") &&
      sse.includes("[DONE]") &&
      billingSnapshot(result).providerCallCount === 1 &&
      (billingSnapshot(result).arbitrationCallCount ?? 0) === 0,
    "D. native tool_calls — unified nonstream + SSE mappers, no envelope leak",
    { ...billingSnapshot(result) }
  );
}

// ── E. assistant_text (native auto plain text FINAL; P1047) ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello text",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_e"
  );
  assert(
    result.ok === true &&
      msg(result)?.content === "hello text" &&
      !Array.isArray(msg(result)?.tool_calls) &&
      choice(result)?.finish_reason === "stop" &&
      billingSnapshot(result).providerCallCount === 1 &&
      (billingSnapshot(result).arbitrationCallCount ?? 0) === 0,
    "E. assistant_text — content, no tool_calls, finish=stop",
    { ...billingSnapshot(result) }
  );
}

// ── F/G. tool_choice null / missing ≡ auto ───────────────────────────────
{
  assert(
    effectiveToolChoice({ tools: WEATHER_TOOLS, tool_choice: null }) ===
      "auto" &&
      effectiveToolChoice({ tools: WEATHER_TOOLS }) === "auto" &&
      effectiveToolChoice({
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      }) === "required",
    "F/G. tool_choice null/missing ≡ auto; not required",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT effectiveToolChoice",
    }
  );

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Null" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "null choice" }],
      tools: WEATHER_TOOLS,
      tool_choice: null as any,
    },
    "req_p1031_f"
  );
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      Array.isArray(msg(result)?.tool_calls) &&
      out?.hasTools === true &&
      (out.tool_choice === undefined ||
        out.tool_choice === null ||
        out.tool_choice === "auto"),
    "F. tool_choice=null keeps tools (not stripped)",
    { ...billingSnapshot(result), outbound_tool_choice: out?.tool_choice }
  );

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Missing" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const resultG = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "missing choice" }],
      tools: WEATHER_TOOLS,
    },
    "req_p1031_g"
  );
  assert(
    resultG.ok === true && Array.isArray(msg(resultG)?.tool_calls),
    "G. tool_choice missing ≡ auto — tools work on auto-pro",
    { ...billingSnapshot(resultG) }
  );
}

// ── H. role=tool second round ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "R1" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const r1 = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "r1" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1031_h1"
  );
  const id = msg(r1)?.tool_calls?.[0]?.id;
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "final after tool",
        usage: NATIVE_USAGE,
      }),
    ],
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
    "req_p1031_h2"
  );
  assert(
    r1.ok === true &&
      typeof id === "string" &&
      r2.ok === true &&
      msg(r2)?.content === "final after tool" &&
      billingSnapshot(r2).debitCallCount === 1,
    "H. role=tool second round — mapped id accepted; final assistant",
    { ...billingSnapshot(r2), tool_call_id: id }
  );
}

// ── I. long call_id ──────────────────────────────────────────────────────
{
  const normalize = createUpstreamToolCallIdNormalizer();
  const mapped = normalize(LONG_ID_86);
  assert(
    LONG_ID_86.length === 86 &&
      isUpstreamSafeToolCallId(mapped) &&
      mapped.length <= UPSTREAM_TOOL_CALL_ID_MAX_LEN,
    "I. long call_id maps to <=64 ASCII",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      mappedLen: mapped.length,
      level: "UNIT",
    }
  );
}

// ── J. unmatched tool_call_id → 4xx not_billable ─────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_known_abc",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"city\":\"X\"}",
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_DOES_NOT_MATCH",
          content: "{}",
        },
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_j"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      (meta.errorCode === "invalid_tool_call_id" ||
        typeof meta.errorCode === "string") &&
      getCounts().providerCallCount === 0,
    "J. unmatched tool_call_id — 4xx not_billable debit=0",
    { ...meta }
  );
}

// ── K. malformed arguments (schema) — not sent to Cursor as success ──────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "keep",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: 99 as any }),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "bad args" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_k"
  );
  // AUTO arbitration: schema fail → safe fallback to native text (not tool_calls)
  assert(
    result.ok === true &&
      msg(result)?.content === "keep" &&
      !Array.isArray(msg(result)?.tool_calls),
    "K. malformed args — not emitted as tool_calls to Cursor (safe fallback)",
    { ...billingSnapshot(result) }
  );
}

// ── L. content + tool_calls mix → content forced null ────────────────────
{
  const mixed = {
    id: "chatcmpl_mix",
    object: "chat.completion",
    created: 1,
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "I will create the file",
          tool_calls: [
            {
              id: "call_mix",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"city\":\"Mix\"}",
              },
            },
          ],
        },
        finish_reason: "stop",
      },
    ],
  };
  const { normalizeToolCallsOnChatCompletion } = await import(
    "../apps/dmit-api/src/lib/toolCallCapability.ts"
  );
  const normalized = normalizeToolCallsOnChatCompletion(mixed as any);
  const m = (normalized.choices as any)[0].message;
  const afterRole = chatCompletionSseBodyAfterRole(normalized as any);
  assert(
    m.content === null &&
      (normalized.choices as any)[0].finish_reason === "tool_calls" &&
      !afterRole.includes('"content":"I will create') &&
      afterRole.includes("tool_calls"),
    "L. content+tool_calls mix — content null; SSE skips prose",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT normalize + SSE",
    }
  );
}

// ── M. no tools — ordinary chat ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1031_m"
  );
  assert(
    result.ok === true &&
      msg(result)?.content === "hello" &&
      billingSnapshot(result).debitCallCount === 1,
    "M. no tools — ordinary chat unaffected",
    { ...billingSnapshot(result) }
  );
}

// ── N. P1041 exact-once debit (native single-pass; P1047 closed dual-arb) ─
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Bill" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "bill" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1031_n"
  );
  const debit = getCounts().lastDebitEntry;
  assert(
    result.ok === true &&
      getCounts().debitCallCount === 1 &&
      (getCounts().arbitrationCallCount ?? 0) === 0 &&
      Number(debit?.prompt_tokens) === NATIVE_USAGE.prompt_tokens &&
      Number(debit?.completion_tokens) === NATIVE_USAGE.completion_tokens &&
      Number(debit?.total_tokens) === NATIVE_USAGE.total_tokens,
    "N. exact-once debit preserved (native-only; no auto arb merge) debit=1",
    {
      ...billingSnapshot(result),
      debit_tokens: {
        p: debit?.prompt_tokens,
        c: debit?.completion_tokens,
        t: debit?.total_tokens,
      },
    }
  );
}

// Unit: unmatched analyzer
{
  const a = analyzeToolRoundTrip([
    { role: "user", content: "x" },
    {
      role: "assistant",
      tool_calls: [{ id: "call_a", type: "function", function: { name: "t", arguments: "{}" } }],
    },
    { role: "tool", tool_call_id: "call_a", content: "{}" },
  ]);
  const b = analyzeToolRoundTrip([
    {
      role: "assistant",
      tool_calls: [{ id: "call_a", type: "function", function: { name: "t", arguments: "{}" } }],
    },
    { role: "tool", tool_call_id: "call_b", content: "{}" },
  ]);
  assert(
    a.unmatchedToolCallIdCount === 0 && b.unmatchedToolCallIdCount === 1,
    "analyzer: matched vs unmatched tool_call_id",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT analyzeToolRoundTrip",
    }
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
console.log(
  "NOTE: LIVE Cursor file E2E is NOT claimed. Deploy then follow scripts/p1031-cursor-live-file-e2e-runbook.md"
);
