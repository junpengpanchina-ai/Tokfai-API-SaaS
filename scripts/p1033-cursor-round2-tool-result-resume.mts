/**
 * P1033 — Cursor round-2+ tool-result resume protocol.
 *
 * Proves legal role=tool transcripts resume via native providers, never hit
 * Forced absorb / first-turn AUTO arbitration / raw emulated_json forwarding.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL Cursor transcript validator
 *   REAL SSE mapper
 *   REAL billable usage aggregation
 *   MOCK provider boundary
 *   MOCK/SPY billing boundary
 *   非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit
 *
 *   npx tsx scripts/p1033-cursor-round2-tool-result-resume.mts
 *
 * Marker: TOKFAI_P1033_CURSOR_ROUND2_TOOL_RESULT_RESUME_PASS
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
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
  type ProviderScript,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const { respondChatCompletionEarlySse } = await loadRespondEarlySse();
const {
  shouldAttemptAutoToolIntentArbitration,
  resolveNativeToolResumeAttempts,
  TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");
const {
  validateCursorToolTranscript,
  DUPLICATE_TOOL_RESULT_CODE,
  MISSING_ASSISTANT_TOOL_CALLS_CODE,
  INVALID_TOOL_MESSAGE_ORDER_CODE,
  INVALID_TOOL_CALL_ID_CODE,
} = await import("../apps/dmit-api/src/lib/cursorToolProtocol.ts");

const PASS = "TOKFAI_P1033_CURSOR_ROUND2_TOOL_RESULT_RESUME_PASS";
const FAIL = "TOKFAI_P1033_BLOCKED_FORCED_ABSORB";
const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL Cursor transcript validator + REAL SSE mapper + REAL billable usage aggregation + MOCK provider + MOCK/SPY billing (非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit)";

const NATIVE_USAGE = {
  prompt_tokens: 110,
  completion_tokens: 9,
  total_tokens: 119,
};

type SceneRow = {
  id: number;
  label: string;
  providerCallCount: number;
  debitCallCount: number;
  status: number | string;
};

const scenes: SceneRow[] = [];
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
    limitKey: "p1033",
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
  return events;
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

function recordScene(
  id: number,
  label: string,
  result: any,
  extra?: Partial<SceneRow>
) {
  const meta = billingSnapshot(result);
  scenes.push({
    id,
    label,
    providerCallCount: meta.providerCallCount,
    debitCallCount: meta.debitCallCount,
    status: extra?.status ?? meta.httpStatus ?? (result?.ok ? 200 : "fail"),
  });
}

function outboundHasRoleTool(): boolean {
  return getCounts().outboundBodies.some((b) =>
    b.messages.some(
      (m) =>
        m &&
        typeof m === "object" &&
        ((m as { role?: string }).role === "tool" ||
          (m as { role?: string }).role === "function")
    )
  );
}

function outboundHasEmulatedCompiler(): boolean {
  return getCounts().compilerSeenCount > 0;
}

function outboundHasToolsArray(): boolean {
  return getCounts().outboundBodies.some((b) => b.hasTools);
}

// ── Unit: resumeToolRound gate + native filter ───────────────────────────
{
  const v = validateCursorToolTranscript([
    { role: "user", content: "go" },
    assistantTools([tc("call_a", "get_weather", { city: "A" })]),
    toolMsg("call_a", { ok: true }),
  ]);
  assert(
    v.ok === true && v.resumeToolRound === true,
    "unit.resumeToolRound true for matched tool transcript",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT validateCursorToolTranscript",
    }
  );
  assert(
    shouldAttemptAutoToolIntentArbitration({
      hasTools: true,
      supportsToolsRequested: true,
      effectiveToolChoice: "auto",
      activeToolMode: "native",
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      autoIntentArbitrationAttempted: false,
      freshRemainingTotalMs: 60_000,
      resumeToolRound: true,
    }) === false,
    "unit.AUTO arbitration disabled on resumeToolRound",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT shouldAttemptAutoToolIntentArbitration",
    }
  );
  const nativeOnly = resolveNativeToolResumeAttempts({
    attempts: ["gpt-5.5", "gpt-5.4", "gemini-3-pro"],
  });
  assert(
    nativeOnly.join(",") === "gpt-5.5,gpt-5.4",
    "unit.native resume filter drops gemini-3-pro",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      nativeOnly,
      level: "UNIT resolveNativeToolResumeAttempts",
    }
  );
}

// ── 1. 3 tool_calls → 3 results → final text ─────────────────────────────
{
  const ids = ["call_r1_a", "call_r1_b", "call_r1_c"];
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "done after 3 tools",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "round1" },
        assistantTools([
          tc(ids[0]!, "Glob", { pattern: "*.mts" }),
          tc(ids[1]!, "Glob", { pattern: "*.ts" }),
          tc(ids[2]!, "Read", { path: "a.ts" }),
        ]),
        toolMsg(ids[0]!, { files: ["a.mts"] }),
        toolMsg(ids[1]!, { files: ["a.ts"] }),
        toolMsg(ids[2]!, { text: "ok" }),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_01"
  );
  const meta = billingSnapshot(result);
  const ok =
    result.ok === true &&
    msg(result)?.content === "done after 3 tools" &&
    meta.providerCallCount === 1 &&
    meta.debitCallCount === 1 &&
    (meta.arbitrationCallCount ?? 0) === 0 &&
    outboundHasRoleTool() &&
    outboundHasToolsArray() &&
    !outboundHasEmulatedCompiler();
  assert(ok, "1. 3 tool_calls → 3 results → final text", meta);
  recordScene(1, "3→3→text", result);
}

// ── 2. 3 results → 2 new tool_calls ──────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: null,
        tool_calls: [
          ...makeNativeToolCalls("get_weather", { city: "S2a" }, "call_r2_a"),
          ...makeNativeToolCalls("get_time", { tz: "UTC" }, "call_r2_b"),
        ],
        finish_reason: "tool_calls",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "r2" },
        assistantTools([
          tc("call_p_a", "Glob", { pattern: "*" }),
          tc("call_p_b", "Glob", { pattern: "**" }),
          tc("call_p_c", "Read", { path: "x" }),
        ]),
        toolMsg("call_p_a", {}),
        toolMsg("call_p_b", {}),
        toolMsg("call_p_c", {}),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_02"
  );
  const meta = billingSnapshot(result);
  const tcs = msg(result)?.tool_calls ?? [];
  assert(
    result.ok === true &&
      choice(result)?.finish_reason === "tool_calls" &&
      tcs.length === 2 &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    "2. 3 results → 2 new tool_calls",
    { ...meta, toolCallCount: tcs.length }
  );
  recordScene(2, "3→2 new tool_calls", result);
}

// ── 3. Round3: 2 results → final text ────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "round3 final",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "r3" },
        assistantTools([
          tc("call_p_a", "Glob", { pattern: "*" }),
          tc("call_p_b", "Read", { path: "x" }),
        ]),
        toolMsg("call_p_a", {}),
        toolMsg("call_p_b", {}),
        assistantTools([
          tc("call_r2_a", "get_weather", { city: "S" }),
          tc("call_r2_b", "get_time", { tz: "UTC" }),
        ]),
        toolMsg("call_r2_a", { temp: 1 }),
        toolMsg("call_r2_b", { t: "now" }),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_03"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "round3 final" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "3. Round3 2 results → final text",
    meta
  );
  recordScene(3, "round3 final", result);
}

// ── 4. 25 historical tool results, all matched ───────────────────────────
{
  const histCalls: Record<string, unknown>[] = [];
  const histTools: Record<string, unknown>[] = [];
  for (let i = 0; i < 25; i++) {
    const id = `call_hist_${i}`;
    histCalls.push(tc(id, "Glob", { i }));
    histTools.push(toolMsg(id, { i }));
  }
  // OpenAI allows multiple assistant tool_call batches; keep one big batch.
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "after 25 tools",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [
        { role: "user", content: "big" },
        assistantTools(histCalls),
        ...histTools,
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_04"
  );
  const meta = billingSnapshot(result);
  const attempted =
    getCounts().outboundBodies[0] &&
    typeof (getCounts().outboundBodies[0] as any) !== "undefined";
  assert(
    result.ok === true &&
      msg(result)?.content === "after 25 tools" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      !outboundHasEmulatedCompiler() &&
      attempted,
    "4. 25 matched tool results continue",
    { ...meta, toolMessageCount: 25 }
  );
  recordScene(4, "25 tools resume", result);
}

// ── 5. 35 messages + 20 tool messages ────────────────────────────────────
{
  const messages: Record<string, unknown>[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "u0" },
  ];
  for (let batch = 0; batch < 4; batch++) {
    const calls: Record<string, unknown>[] = [];
    const tools: Record<string, unknown>[] = [];
    for (let j = 0; j < 5; j++) {
      const id = `call_b${batch}_${j}`;
      calls.push(tc(id, "Read", { path: `${batch}-${j}` }));
      tools.push(toolMsg(id, { ok: true }));
    }
    messages.push(assistantTools(calls));
    messages.push(...tools);
    messages.push({ role: "user", content: `continue-${batch}` });
  }
  // 2 + 4*(1+5+1) = 2+28 = 30; add filler to reach 35
  messages.push({ role: "user", content: "f1" });
  messages.push({ role: "assistant", content: "a1" });
  messages.push({ role: "user", content: "f2" });
  messages.push({ role: "assistant", content: "a2" });
  messages.push({ role: "user", content: "final ask" });
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "35msg ok",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages,
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_05"
  );
  const meta = billingSnapshot(result);
  const toolCount = messages.filter((m) => m.role === "tool").length;
  assert(
    result.ok === true &&
      messages.length === 35 &&
      toolCount === 20 &&
      msg(result)?.content === "35msg ok" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "5. 35 messages + 20 tool messages continue",
    { ...meta, messageCount: messages.length, toolCount }
  );
  recordScene(5, "35msg/20tools", result);
}

// ── 6–8. tool_choice missing / null / auto ───────────────────────────────
for (const [sceneId, choice, label] of [
  [6, undefined, "missing"],
  [7, null, "null"],
  [8, "auto", "auto"],
] as const) {
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: `choice ${label}`,
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const body: Record<string, unknown> = {
    model: "gpt-5.5",
    messages: [
      { role: "user", content: "c" },
      assistantTools([tc("call_c1", "get_weather", { city: "C" })]),
      toolMsg("call_c1", {}),
    ],
    tools: WEATHER_TOOLS,
  };
  if (choice !== undefined) body.tool_choice = choice;
  const result = await exec(body, `req_p1033_0${sceneId}`);
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === `choice ${label}` &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0,
    `${sceneId}. tool_choice=${label} resume`,
    meta
  );
  recordScene(sceneId, `tool_choice ${label}`, result);
}

// ── 9. object forced tool_choice on round 2 ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "forced" }, {
          id: "call_forced_out",
        }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "force" },
        assistantTools([tc("call_f0", "get_time", { tz: "UTC" })]),
        toolMsg("call_f0", {}),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "get_weather" },
      },
    },
    "req_p1033_09"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      !outboundHasEmulatedCompiler(),
    "9. object forced tool_choice round-2",
    meta
  );
  recordScene(9, "object tool_choice r2", result);
}

// ── 10. resume does not trigger AUTO first-turn arbitration ──────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain after tools — must not arbitrate",
        usage: NATIVE_USAGE,
      }),
      // If arbitration wrongly runs, this would be consumed.
      () => ({
        kind: "completion",
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [
            { name: "get_weather", arguments: { city: "ARB" } },
          ],
        }),
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "arb" },
        assistantTools([tc("call_arb", "Glob", { pattern: "*" })]),
        toolMsg("call_arb", { files: [] }),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_10"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "plain after tools — must not arbitrate" &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      !outboundHasEmulatedCompiler(),
    "10. resume does not trigger AUTO first-turn arbitration",
    meta
  );
  recordScene(10, "no AUTO arb on resume", result);
}

// ── 11. native resume → ordinary text ────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "native text ok",
        finish_reason: "stop",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "t" },
        assistantTools([tc("call_t11", "Read", { path: "p" })]),
        toolMsg("call_t11", "file"),
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1033_11"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "native text ok" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "11. native resume returns ordinary text",
    meta
  );
  recordScene(11, "native text", result);
}

// ── 12. native resume → more tool_calls ──────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_time", { tz: "Asia/Shanghai" }, {
          id: "call_more",
        }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.4",
      messages: [
        { role: "user", content: "more" },
        assistantTools([tc("call_t12", "Glob", { pattern: "*.md" })]),
        toolMsg("call_t12", []),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_12"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      choice(result)?.finish_reason === "tool_calls" &&
      msg(result)?.tool_calls?.[0]?.id &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "12. native resume returns more tool_calls",
    meta
  );
  recordScene(12, "more tool_calls", result);
}

// ── 13. first native transport fail → second native success ──────────────
{
  let call = 0;
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      ((ctx) => {
        call += 1;
        if (ctx.attemptModel === "gpt-5.5" || call === 1) {
          return {
            kind: "error",
            status: 502,
            code: "upstream_error",
            message: "primary transport fail",
          };
        }
        return {
          kind: "completion",
          content: "fallback native ok",
          usage: NATIVE_USAGE,
        };
      }) as ProviderScript,
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [
        { role: "user", content: "fb" },
        assistantTools([tc("call_fb", "Read", { path: "z" })]),
        toolMsg("call_fb", "z"),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_13"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "fallback native ok" &&
      meta.providerCallCount >= 2 &&
      meta.debitCallCount === 1 &&
      !outboundHasEmulatedCompiler(),
    "13. native transport fail → second native success",
    { ...meta, call }
  );
  recordScene(13, "native fallback", result);
}

// ── 14. raw role=tool not sent to emulated provider ──────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should not run on gemini emulated",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [
        { role: "user", content: "emu" },
        assistantTools([tc("call_emu", "Glob", { pattern: "*" })]),
        toolMsg("call_emu", {}),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_14"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === TOOL_ROUND_RESUME_UNAVAILABLE_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "14. emulated provider does not receive raw role=tool",
    meta
  );
  recordScene(14, "no emulated raw tool", result, { status: 400 });
}

// ── 15. unmatched call_id ────────────────────────────────────────────────
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
        { role: "user", content: "u" },
        assistantTools([tc("call_known", "Glob", { pattern: "*" })]),
        toolMsg("call_UNKNOWN", {}),
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1033_15"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === INVALID_TOOL_CALL_ID_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "15. unmatched call_id → 400 provider=0 debit=0",
    meta
  );
  recordScene(15, "unmatched", result, { status: 400 });
}

// ── 16. duplicate result ─────────────────────────────────────────────────
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
        { role: "user", content: "d" },
        assistantTools([tc("call_dup", "Read", { path: "d" })]),
        toolMsg("call_dup", "1"),
        toolMsg("call_dup", "2"),
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1033_16"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === DUPLICATE_TOOL_RESULT_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "16. duplicate result → 400 provider=0 debit=0",
    meta
  );
  recordScene(16, "duplicate", result, { status: 400 });
}

// ── 17. missing historical assistant.tool_calls ──────────────────────────
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
        { role: "user", content: "m" },
        toolMsg("call_orphan", {}),
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1033_17"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === MISSING_ASSISTANT_TOOL_CALLS_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "17. missing historical assistant.tool_calls → 400",
    meta
  );
  recordScene(17, "missing assistant tool_calls", result, { status: 400 });
}

// ── 18. illegal message order ────────────────────────────────────────────
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
        { role: "user", content: "ord" },
        toolMsg("call_late", { early: true }),
        assistantTools([tc("call_late", "Glob", { pattern: "*" })]),
      ],
      tools: WEATHER_TOOLS,
    },
    "req_p1033_18"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.errorCode === INVALID_TOOL_MESSAGE_ORDER_CODE &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "18. illegal message order → 400",
    meta
  );
  recordScene(18, "illegal order", result, { status: 400 });
}

// ── 19. SSE tool_calls incremental + [DONE] ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: null,
        tool_calls: makeNativeToolCalls(
          "get_weather",
          { city: "SSE" },
          "call_sse_tc"
        ),
        finish_reason: "tool_calls",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1033_19",
    body: {
      model: "gpt-5.5",
      stream: true,
      messages: [
        { role: "user", content: "sse-tc" },
        assistantTools([tc("call_sse0", "Read", { path: "s" })]),
        toolMsg("call_sse0", "s"),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    } as any,
    limitKey: "p1033-19",
    idempotencyKey: null,
  });
  const events = await readSse(res);
  const doneEvents = events.filter((e) => e === "[DONE]").length;
  const finish = events.find(
    (e) =>
      e &&
      typeof e === "object" &&
      (e as any)?.choices?.[0]?.finish_reason === "tool_calls"
  );
  const hasDeltaTool = events.some(
    (e) =>
      e &&
      typeof e === "object" &&
      JSON.stringify(e).includes("call_sse_tc")
  );
  const meta = {
    providerCallCount: getCounts().providerCallCount,
    repairCallCount: getCounts().repairCallCount,
    arbitrationCallCount: getCounts().arbitrationCallCount,
    fallbackCount: getCounts().fallbackCount,
    debitCallCount: getCounts().debitCallCount,
    httpStatus: res.status,
  };
  assert(
    res.status === 200 &&
      hasDeltaTool &&
      !!finish &&
      doneEvents === 1 &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "19. SSE tool_calls incremental + [DONE]",
    { ...meta, doneEvents, hasDeltaTool }
  );
  scenes.push({
    id: 19,
    label: "SSE tool_calls",
    providerCallCount: meta.providerCallCount,
    debitCallCount: meta.debitCallCount,
    status: res.status,
  });
}

// ── 20. final text SSE ───────────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "sse final text",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1033_20",
    body: {
      model: "gpt-5.5",
      stream: true,
      messages: [
        { role: "user", content: "sse-txt" },
        assistantTools([tc("call_sse_t", "Glob", { pattern: "*" })]),
        toolMsg("call_sse_t", []),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    } as any,
    limitKey: "p1033-20",
    idempotencyKey: null,
  });
  const events = await readSse(res);
  const text = JSON.stringify(events);
  const doneEvents = events.filter((e) => e === "[DONE]").length;
  const meta = {
    providerCallCount: getCounts().providerCallCount,
    repairCallCount: getCounts().repairCallCount,
    arbitrationCallCount: getCounts().arbitrationCallCount,
    fallbackCount: getCounts().fallbackCount,
    debitCallCount: getCounts().debitCallCount,
    httpStatus: res.status,
  };
  assert(
    res.status === 200 &&
      text.includes("sse final text") &&
      text.includes('"finish_reason":"stop"') &&
      doneEvents === 1 &&
      !text.includes('"type":"tool_call"') &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1,
    "20. final text SSE",
    { ...meta, doneEvents }
  );
  scenes.push({
    id: 20,
    label: "SSE text",
    providerCallCount: meta.providerCallCount,
    debitCallCount: meta.debitCallCount,
    status: res.status,
  });
}

// ── 21. single request debitCallCount=1 ──────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "debit once",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "d1" },
        assistantTools([tc("call_d1", "Read", { path: "d" })]),
        toolMsg("call_d1", "x"),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_21"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      meta.providerCallCount === 1,
    "21. single request debitCallCount=1",
    meta
  );
  recordScene(21, "debit=1", result);
}

// ── 22. P1030 usage aggregation not broken (non-resume arb still aggregates)
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "first turn plain",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      }),
      () => ({
        kind: "completion",
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [
            { name: "get_weather", arguments: { city: "Agg" } },
          ],
        }),
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
        },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "first turn needs tools" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_22"
  );
  const meta = billingSnapshot(result);
  const usage = (result.response as any)?.usage;
  assert(
    result.ok === true &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      typeof usage?.total_tokens === "number" &&
      usage.total_tokens >= 25,
    "22. P1030 usage aggregation still works (first-turn arb)",
    { ...meta, usage }
  );
  recordScene(22, "P1030 aggregation", result);
}

// ── 23. no Forced absorb routing 400 on legal resume ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "no absorb",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [
        { role: "user", content: "absorb?" },
        assistantTools([
          tc("call_abs_a", "Glob", { pattern: "**/*" }),
          tc("call_abs_b", "Glob", { pattern: "src/**" }),
          tc("call_abs_c", "Read", { path: "pkg.json" }),
        ]),
        toolMsg("call_abs_a", { files: ["a"] }),
        toolMsg("call_abs_b", { files: ["b"] }),
        toolMsg("call_abs_c", { text: "{}" }),
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_23"
  );
  const meta = billingSnapshot(result);
  const msgText = JSON.stringify(result);
  assert(
    result.ok === true &&
      !msgText.includes("Forced absorb") &&
      meta.errorCode !== "invalid_request_error" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      !outboundHasEmulatedCompiler(),
    "23. legal resume never Forced absorb 400",
    meta
  );
  recordScene(23, "no forced absorb", result);
}

// ── 24. production-shaped large transcript (~25 tools / ~35 messages) ────
{
  const messages: Record<string, unknown>[] = [
    { role: "system", content: "You are a coding agent." },
    { role: "user", content: "Find tests, read them, run, then edit." },
  ];
  // Round1: 3 tools (Glob, Glob, Read) — already answered
  const r1 = [
    tc("call_prod_glob1", "Glob", { pattern: "**/*test*" }),
    tc("call_prod_glob2", "Glob", { pattern: "scripts/p103*.mts" }),
    tc("call_prod_read1", "Read", { path: "scripts/p1031-cursor-agent-protocol-closure.mts" }),
  ];
  messages.push(assistantTools(r1));
  for (const c of r1) messages.push(toolMsg(String(c.id), { ok: true }));

  // Historical prior rounds totaling ~22 more tool msgs → ~25
  for (let i = 0; i < 11; i++) {
    const a = `call_prod_h_${i}a`;
    const b = `call_prod_h_${i}b`;
    messages.push(
      assistantTools([
        tc(a, "Read", { path: `f${i}.ts` }),
        tc(b, "Glob", { pattern: `*${i}*` }),
      ])
    );
    messages.push(toolMsg(a, { n: i }));
    messages.push(toolMsg(b, { n: i }));
  }
  // Pad to ~35 messages
  while (messages.length < 35) {
    messages.push({ role: "user", content: `pad-${messages.length}` });
  }
  const toolN = messages.filter((m) => m.role === "tool").length;
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: null,
        tool_calls: makeNativeToolCalls(
          "get_weather",
          { city: "EditNext" },
          "call_prod_next_edit"
        ),
        finish_reason: "tool_calls",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages,
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1033_24"
  );
  const meta = billingSnapshot(result);
  const v = validateCursorToolTranscript(messages);
  assert(
    v.ok === true &&
      v.resumeToolRound === true &&
      toolN >= 20 &&
      messages.length >= 35 &&
      result.ok === true &&
      choice(result)?.finish_reason === "tool_calls" &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      !outboundHasEmulatedCompiler() &&
      outboundHasRoleTool() &&
      outboundHasToolsArray(),
    "24. production-shaped large transcript continues",
    {
      ...meta,
      messageCount: messages.length,
      toolMessageCount: toolN,
      resumeToolRound: v.resumeToolRound,
    }
  );
  recordScene(24, "prod-shaped transcript", result);
}

// ── Scene table ──────────────────────────────────────────────────────────
console.log("\n=== P1033 scene summary (providerCallCount / debitCallCount / status) ===");
for (const s of scenes) {
  console.log(
    `${String(s.id).padStart(2, "0")}. ${s.label} → provider=${s.providerCallCount} debit=${s.debitCallCount} status=${s.status}`
  );
}

if (failed > 0 || scenes.length < 24) {
  console.error(
    `\n${FAIL} (failed=${failed}, scenes=${scenes.length})`
  );
  process.exit(1);
}

console.log(`\n${PASS}`);
console.log(LEVEL);
