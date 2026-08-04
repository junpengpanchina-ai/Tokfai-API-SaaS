/**
 * P1027 — Cursor tool gate + oversize call_id P1 fix.
 *
 * REAL EXECUTE ENTRY via executeChatCompletion (+ stream SSE).
 * Mocks only Provider fetch / auth / DB-RPC debit boundaries.
 *
 * Test type: REAL EXECUTE ENTRY + MOCK PROVIDER (not LIVE Cursor).
 *
 *   npx tsx scripts/p1027-cursor-tool-gate-callid.mts
 *
 * Marker: TOKFAI_P1027_CURSOR_TOOL_GATE_CALLID_P1_FIX_PASS
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
const {
  resolveToolCallingAttempts,
  requestHasNonEmptyTools,
  effectiveToolChoice,
  isStrictToolCallRequest,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  createUpstreamToolCallIdNormalizer,
  isUpstreamSafeToolCallId,
  UPSTREAM_TOOL_CALL_ID_MAX_LEN,
} = await import("../apps/dmit-api/src/lib/upstreamToolCallId.ts");

const PASS = "TOKFAI_P1027_CURSOR_TOOL_GATE_CALLID_P1_FIX_PASS";
const FAIL = "TOKFAI_P1027_CURSOR_TOOL_GATE_CALLID_BLOCKED";

const LONG_ID_86 =
  "call_cursor_tool_" + "x".repeat(86 - "call_cursor_tool_".length);
const LONG_ID_A =
  "call_cursor_a_" + "a".repeat(86 - "call_cursor_a_".length);
const LONG_ID_B =
  "call_cursor_b_" + "b".repeat(86 - "call_cursor_b_".length);
const SHORT_ID = "call_short_ok_01";

const scenarioCounts: Array<{
  label: string;
  provider: number;
  repair: number;
  debit: number;
}> = [];

let failed = 0;
function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify({ level: meta.level ?? "REAL EXECUTE ENTRY + MOCK PROVIDER", ...meta }, null, 2)
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
  if (cond) {
    pass(label, meta);
    scenarioCounts.push({
      label,
      provider: Number(meta.providerCallCount ?? meta.provider ?? 0),
      repair: Number(meta.repairCallCount ?? meta.repair ?? 0),
      debit: Number(meta.debitCallCount ?? meta.debit ?? 0),
    });
  } else {
    fail(label, detail ?? JSON.stringify(meta));
  }
}

function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}

function tokfai(result: any) {
  return (result?.response?.tokfai as Record<string, unknown>) ?? {};
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
    limitKey: "p1027",
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
  return { status: res.status, text, events };
}

function collectDeltas(events: unknown[]) {
  const toolCallChunks: unknown[] = [];
  let finish: string | null = null;
  for (const ev of events) {
    if (ev === "[DONE]") continue;
    if (!ev || typeof ev !== "object") continue;
    const choice = (ev as any).choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (delta.tool_calls) toolCallChunks.push(delta.tool_calls);
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      finish = choice.finish_reason;
    }
  }
  return { toolCallChunks, finish };
}

function extractOutboundIds(messages: unknown[]): {
  toolCallIds: string[];
  toolMessageIds: string[];
} {
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

console.log("P1027 CURSOR TOOL GATE + CALL_ID (REAL EXECUTE ENTRY + MOCK PROVIDER)\n");

// ── STATIC: semantics helpers ────────────────────────────────────────────
{
  const bodyMissing = {
    tools: WEATHER_TOOLS,
    messages: [{ role: "user", content: "x" }],
  };
  const bodyNull = { ...bodyMissing, tool_choice: null };
  const bodyAuto = { ...bodyMissing, tool_choice: "auto" };
  const aliasAttempts = resolveToolCallingAttempts({
    requestedModel: "gpt-5",
    attempts: ["gpt-5.5", "gpt-5.4"],
    allowGlobalFallback: false,
  });
  assert(
    requestHasNonEmptyTools(bodyMissing) === true &&
      effectiveToolChoice(bodyMissing) === "auto" &&
      effectiveToolChoice(bodyNull) === "auto" &&
      effectiveToolChoice(bodyAuto) === "auto" &&
      isStrictToolCallRequest(bodyMissing) === false &&
      isStrictToolCallRequest(bodyNull) === false &&
      aliasAttempts != null &&
      aliasAttempts.fallbackApplied === false &&
      LONG_ID_86.length === 86 &&
      !isUpstreamSafeToolCallId(LONG_ID_86),
    "S0. nonempty tools ⇒ requested; null/missing ≡ auto; alias fallbackApplied=false",
    {
      level: "STATIC SOURCE CHECK",
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      longIdLen: LONG_ID_86.length,
      aliasFallbackApplied: aliasAttempts?.fallbackApplied,
    }
  );
}

// ── A. Cursor: tools nonempty, tool_choice missing, stream=true ──────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "CursorStream" }),
    ],
  });
  const body = {
    model: "gpt-5",
    messages: [{ role: "user", content: "cursor stream tools" }],
    tools: WEATHER_TOOLS,
    stream: true,
    // tool_choice intentionally omitted
  };
  const result = await exec(body, "req_p1027_A", true);
  const meta = billingSnapshot(result);
  const t = tokfai(result);
  const out = getCounts().outboundBodies[0];

  // Separate SSE path through the same execute entry (early SSE gate).
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "CursorStreamSse" }),
    ],
  });
  const sseRes = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1027_A_sse",
    body: body as any,
    limitKey: "p1027-stream",
    idempotencyKey: null,
  });
  const { toolCallChunks, finish } = collectDeltas((await readSse(sseRes)).events);
  const sseMeta = getCounts();
  assert(
    result.ok === true &&
      out?.hasTools === true &&
      out.toolNames.includes("get_weather") &&
      (out.tool_choice === null || out.tool_choice === undefined) &&
      t.supports_tools_requested === true &&
      t.tools_fallback_applied === false &&
      t.tools_degraded_to_chat !== true &&
      meta.debitCallCount === 1 &&
      toolCallChunks.length > 0 &&
      finish === "tool_calls" &&
      sseMeta.debitCallCount === 1,
    "A. Cursor tools+missing choice+stream — keep tools, fallbackApplied=false, delta.tool_calls",
    {
      ...meta,
      level: "REAL EXECUTE ENTRY + MOCK PROVIDER",
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: meta.debitCallCount,
      outboundHasTools: out?.hasTools,
      tools_fallback_applied: t.tools_fallback_applied,
      supports_tools_requested: t.supports_tools_requested,
      toolCallChunks: toolCallChunks.length,
      finish,
      sseDebit: sseMeta.debitCallCount,
    }
  );
}

// ── B. tools nonempty, tool_choice=null ≡ auto ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "NullChoice" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "null choice" }],
      tools: WEATHER_TOOLS,
      tool_choice: null,
    },
    "req_p1027_B"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  const t = tokfai(result);
  assert(
    result.ok === true &&
      out?.hasTools === true &&
      (out.tool_choice === null || out.tool_choice === undefined) &&
      t.supports_tools_requested === true &&
      t.tools_fallback_applied === false &&
      meta.debitCallCount === 1,
    "B. tool_choice=null ≡ auto — tools kept, not stripped",
    {
      ...meta,
      provider: 1,
      repair: 0,
      debit: 1,
      outboundHasTools: out?.hasTools,
    }
  );
}

// ── C. tools + tool_choice=auto ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Auto" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "auto" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1027_C"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.hasTools === true &&
      out.tool_choice === "auto" &&
      meta.debitCallCount === 1,
    "C. tool_choice=auto — existing behavior preserved",
    { ...meta, provider: 1, repair: 0, debit: 1, outbound: out }
  );
}

// ── D. object forced function (P1024 no regression) ──────────────────────
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
            message: "expected required",
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
      tool_choice: { type: "function", function: { name: "get_weather" } },
    },
    "req_p1027_D"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      out.toolNames.length === 1 &&
      out.toolNames[0] === "get_weather" &&
      meta.debitCallCount === 1,
    "D. object forced tool_choice — P1024 adapter intact",
    { ...meta, provider: 1, repair: 0, debit: 1, outbound: out }
  );
}

// ── E. no tools ordinary chat ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "plain hi" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1027_E"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.hasTools === false &&
      out.toolNames.length === 0 &&
      tokfai(result).has_tools !== true &&
      meta.debitCallCount === 1,
    "E. no tools — outbound does not invent tools",
    { ...meta, provider: 1, repair: 0, debit: 1, outboundHasTools: out?.hasTools }
  );
}

// ── F. image model + tools → reject, debit=0 ─────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Nope" })],
  });
  const result = await exec(
    {
      model: "nano-banana",
      messages: [{ role: "user", content: "image+tools" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1027_F"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0 &&
      (result.errorCode === "image_model_not_for_chat" ||
        result.errorCode === "model_not_tool_capable" ||
        typeof result.errorCode === "string"),
    "F. image/unsupported + tools — reject, debit=0",
    {
      ...meta,
      provider: 0,
      repair: 0,
      debit: 0,
      errorCode: result.errorCode,
    }
  );
}

// ── G. 86-char call id — both sites equal, len<=64 ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "LongId" })],
  });
  const clientBody = {
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
              arguments: JSON.stringify({ city: "X" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: LONG_ID_86,
        content: JSON.stringify({ ok: true }),
      },
      { role: "user", content: "continue" },
    ],
    tools: WEATHER_TOOLS,
    tool_choice: "auto",
  };
  const clientBefore = JSON.stringify(clientBody.messages);
  const result = await exec(clientBody, "req_p1027_G");
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  const ids = extractOutboundIds(out?.messages ?? []);
  const a = ids.toolCallIds[0];
  const b = ids.toolMessageIds[0];
  assert(
    result.ok === true &&
      typeof a === "string" &&
      a === b &&
      a.length <= UPSTREAM_TOOL_CALL_ID_MAX_LEN &&
      a !== LONG_ID_86 &&
      JSON.stringify(clientBody.messages) === clientBefore &&
      meta.debitCallCount === 1,
    "G. 86-char call_id — outbound equal + len<=64; client body intact",
    {
      ...meta,
      provider: 1,
      repair: 0,
      debit: 1,
      outboundIdLen: a?.length,
      idsEqual: a === b,
      clientIntact: true,
    }
  );
}

// ── H. two distinct long ids → distinct normalized ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "ok" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "multi" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: LONG_ID_A,
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{}",
              },
            },
            {
              id: LONG_ID_B,
              type: "function",
              function: {
                name: "get_time",
                arguments: "{}",
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: LONG_ID_A,
          content: "{}",
        },
        {
          role: "tool",
          tool_call_id: LONG_ID_B,
          content: "{}",
        },
        { role: "user", content: "next" },
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1027_H"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  const ids = extractOutboundIds(out?.messages ?? []);
  const [n1, n2] = ids.toolCallIds;
  assert(
    result.ok === true &&
      typeof n1 === "string" &&
      typeof n2 === "string" &&
      n1 !== n2 &&
      n1 === ids.toolMessageIds[0] &&
      n2 === ids.toolMessageIds[1] &&
      n1.length <= 64 &&
      n2.length <= 64 &&
      meta.debitCallCount === 1,
    "H. two long ids — normalized distinct + mapped consistently",
    {
      ...meta,
      provider: 1,
      repair: 0,
      debit: 1,
      n1Len: n1?.length,
      n2Len: n2?.length,
      distinct: n1 !== n2,
    }
  );
}

// ── I. short legal id preserved ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "ok" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "short" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: SHORT_ID,
              type: "function",
              function: { name: "get_weather", arguments: "{}" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: SHORT_ID,
          content: "{}",
        },
        { role: "user", content: "go" },
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1027_I"
  );
  const meta = billingSnapshot(result);
  const ids = extractOutboundIds(getCounts().outboundBodies[0]?.messages ?? []);
  assert(
    result.ok === true &&
      ids.toolCallIds[0] === SHORT_ID &&
      ids.toolMessageIds[0] === SHORT_ID &&
      meta.debitCallCount === 1,
    "I. short legal call_id preserved as-is",
    { ...meta, provider: 1, repair: 0, debit: 1, id: SHORT_ID }
  );
}

// ── J. multi-turn assistant tool_calls + role=tool consistency ───────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_time", { tz: "UTC" }, { id: "call_new" }),
    ],
  });
  const id1 = LONG_ID_A;
  const id2 = LONG_ID_B;
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "t1" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: id1,
              type: "function",
              function: { name: "get_weather", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: id1, content: '{"c":1}' },
        { role: "user", content: "t2" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: id2,
              type: "function",
              function: { name: "get_time", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: id2, content: '{"t":1}' },
        { role: "user", content: "t3" },
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1027_J"
  );
  const meta = billingSnapshot(result);
  const ids = extractOutboundIds(getCounts().outboundBodies[0]?.messages ?? []);
  assert(
    result.ok === true &&
      ids.toolCallIds.length === 2 &&
      ids.toolMessageIds.length === 2 &&
      ids.toolCallIds[0] === ids.toolMessageIds[0] &&
      ids.toolCallIds[1] === ids.toolMessageIds[1] &&
      ids.toolCallIds[0] !== ids.toolCallIds[1] &&
      meta.debitCallCount === 1,
    "J. multi-turn tool refs stay consistent after normalize",
    {
      ...meta,
      provider: 1,
      repair: 0,
      debit: 1,
      pairs: [
        [ids.toolCallIds[0], ids.toolMessageIds[0]],
        [ids.toolCallIds[1], ids.toolMessageIds[1]],
      ],
    }
  );
}

// ── K. native tool success — provider×1 debit×1 ──────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "K" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "k" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1027_K"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.repairCallCount === 0 &&
      meta.debitCallCount === 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "native",
    "K. native tool success — provider×1 repair×0 debit×1",
    { ...meta, provider: 1, repair: 0, debit: 1 }
  );
}

// ── L. native miss → controlled emulated repair — debit×1 ────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return { kind: "completion", content: "should have used a tool" };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Repair" }),
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "repair" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1027_L"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 1,
    "L. native miss → emulated repair — provider×2 repair×1 debit×1",
    { ...meta, provider: 2, repair: 1, debit: 1 }
  );
}

// ── M. parse/repair failure — not_billable debit=0 ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return { kind: "completion", content: "no tools here" };
        }
        return { kind: "completion", content: "NOT_VALID_TOOL_INTENT{{{" };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "fail parse" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1027_M"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      meta.providerCallCount >= 1 &&
      (meta.billing_status === "not_billable" || result.ok === false),
    "M. parse/repair failure — not_billable, debit=0",
    {
      ...meta,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 0,
      errorCode: result.errorCode,
    }
  );
}

// ── Unit: normalizer collision / determinism (no raw id leak in API) ─────
{
  const n1 = createUpstreamToolCallIdNormalizer();
  const n2 = createUpstreamToolCallIdNormalizer();
  const a = n1(LONG_ID_A);
  const a2 = n1(LONG_ID_A);
  const b = n1(LONG_ID_B);
  const c = n2(LONG_ID_A);
  assert(
    a === a2 &&
      a !== b &&
      a === c &&
      a.length <= 64 &&
      isUpstreamSafeToolCallId(a) &&
      isUpstreamSafeToolCallId(b),
    "S1. normalizer deterministic + collision-safe + ASCII",
    {
      level: "STATIC UNIT",
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      aLen: a.length,
      bLen: b.length,
    }
  );
}

console.log("\n===== P1027 scenario provider/repair/debit =====");
for (const row of scenarioCounts) {
  console.log(
    `- ${row.label}: provider×${row.provider} repair×${row.repair} debit×${row.debit}`
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
