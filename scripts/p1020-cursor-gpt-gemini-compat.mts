/**
 * P1020 — Cursor GPT / Gemini full compatibility matrix.
 *
 * REAL ROUTE ENTRY via executeChatCompletion (+ stream SSE path).
 * Mocks only Provider fetch / auth / DB-RPC debit boundaries.
 *
 *   npx tsx scripts/p1020-cursor-gpt-gemini-compat.mts
 *
 * Marker: TOKFAI_P1020_CURSOR_GPT_GEMINI_COMPATIBILITY_PASS
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
  makeAssistantTextIntent,
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
  resolveToolCallingMode,
  canNativeEmulatedRepair,
  __toolsCapableAttemptsTestSet,
} = await import("../apps/dmit-api/src/lib/toolCallCapability.ts");

const PASS = "TOKFAI_P1020_CURSOR_GPT_GEMINI_COMPATIBILITY_PASS";
const FAIL = "TOKFAI_P1020_CURSOR_GPT_GEMINI_COMPATIBILITY_FAIL";
const BLOCKED = "TOKFAI_P1020_BLOCKED";

let failed = 0;
const scenarioReport: Array<Record<string, unknown>> = [];

function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  const row = {
    level: meta.level ?? "REAL ROUTE ENTRY",
    ...meta,
  };
  scenarioReport.push({ label, ...row });
  console.log(JSON.stringify(row, null, 2));
}

function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  scenarioReport.push({ label, ok: false, detail });
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
    limitKey: "p1020",
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
  return { status: res.status, text, events };
}

function collectDeltas(events: unknown[]) {
  const contents: string[] = [];
  const toolCallChunks: unknown[] = [];
  let finish: string | null = null;
  for (const ev of events) {
    if (ev === "[DONE]") continue;
    if (!ev || typeof ev !== "object") continue;
    const choices = (ev as any).choices as any[] | undefined;
    const choice = choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      contents.push(delta.content);
    }
    if (delta.tool_calls) toolCallChunks.push(delta.tool_calls);
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      finish = choice.finish_reason;
    }
  }
  return { contents, toolCallChunks, finish };
}

const CURSOR_FILE_TOOLS = [
  {
    type: "function",
    function: {
      name: "Write",
      description: "Create or overwrite a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          contents: { type: "string" },
        },
        required: ["path", "contents"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Read",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
] as const;

console.log("P1020 CURSOR GPT/GEMINI COMPATIBILITY\n");

// ── STATIC: registry capability keys ─────────────────────────────────────
{
  const gptNative = resolveToolCallingMode("grsai-primary", "gpt-5.5");
  const gemEmulated = resolveToolCallingMode("grsai-primary", "gemini-3-pro");
  const aliasUnsupported = resolveToolCallingMode("grsai-primary", "auto-pro");
  const canRepair = canNativeEmulatedRepair("grsai-primary", "gpt-5.5");
  const hermes = resolveToolCallingMode("hermes-official", "gpt-5.5");
  assert(
    gptNative === "native" &&
      gemEmulated === "emulated_json" &&
      aliasUnsupported === "unsupported" &&
      canRepair === true &&
      hermes === "native",
    "S0. registry: gpt-5.5 native, gemini emulated, alias≠capability, hermes slot",
    {
      level: "STATIC SOURCE CHECK",
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      gptNative,
      gemEmulated,
      aliasUnsupported,
      canRepair,
      hermes,
    }
  );
}

// ── 1. gpt-5.5 native tool ───────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "NYC" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather nyc" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_01"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.compilerSeenCount === 0 &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "native" &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather",
    "1. gpt-5.5 native tool — provider×1 repair×0 debit×1",
    {
      ...meta,
      level: "REAL ROUTE ENTRY",
      mode: "native",
      provider: 1,
      repair: 0,
      debit: 1,
    }
  );
}

// ── 2. gpt-5.5 native no tool_calls → controlled emulated repair ─────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return { kind: "completion", content: "I should have called a tool." };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "RepairCity" }),
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "must tool after native miss" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_02"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "emulated_json" &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather",
    "2. gpt-5.5 native miss → emulated repair — provider×2 repair×1 debit×1",
    {
      ...meta,
      level: "REAL ROUTE ENTRY",
      mode: "native→emulated_repair",
      provider: 2,
      repair: 1,
      debit: 1,
    }
  );
}

// ── 3. gemini-3-pro emulated tool ────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) =>
        ctx.hasCompiler
          ? {
              kind: "completion",
              content: makeToolCallIntent("get_weather", { city: "GeminiCity" }),
            }
          : { kind: "completion", content: "LEAK?" },
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1020_03"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.compilerSeenCount >= 1 &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "emulated_json" &&
      m?.tool_calls?.[0]?.function?.name === "get_weather" &&
      !String(m?.content ?? "").includes('"type":"tool_call"'),
    "3. gemini-3-pro emulated tool — provider×1 debit×1 no content leak",
    {
      ...meta,
      level: "REAL ROUTE ENTRY",
      mode: "emulated_json",
      provider: 1,
      repair: 0,
      debit: 1,
    }
  );
}

// ── 4. gemini-3-pro required tool ────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_time", { tz: "UTC" }),
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "time" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_04"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_time" &&
      result.response.choices[0].finish_reason === "tool_calls",
    "4. gemini-3-pro required tool — debit×1",
    { ...meta, level: "REAL ROUTE ENTRY", provider: 1, repair: 0, debit: 1 }
  );
}

// ── 5. role=tool second round (native resume) ────────────────────────────
// P1033 — Round-1 may be gemini emulated; Round-2 with raw role=tool must
// route to a native tool-transcript provider (gpt-5.5). Emulated_json must
// not receive raw role=tool (Forced absorb / tool_round_resume_unavailable).
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Round1" }),
      }),
    ],
  });
  const r1 = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "w" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_05a"
  );
  const id = msg(r1)?.tool_calls?.[0]?.id ?? "call_x";
  const meta1 = billingSnapshot(r1);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "Final answer after tool",
        usage: {
          prompt_tokens: 40,
          completion_tokens: 6,
          total_tokens: 46,
        },
      }),
    ],
  });
  const r2 = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "w" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "Round1" }),
              },
            },
          ],
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
    "req_p1020_05b"
  );
  const meta2 = billingSnapshot(r2);
  assert(
    r1.ok === true &&
      meta1.debitCallCount === 1 &&
      r2.ok === true &&
      meta2.debitCallCount === 1 &&
      msg(r2)?.content === "Final answer after tool" &&
      // P1047 — Round-N continuation closed; plain-text resume is FINAL.
      (meta2.arbitrationCallCount ?? 0) === 0,
    "5. role=tool second round → final text, debit×1 each",
    {
      ...meta2,
      level: "REAL ROUTE ENTRY",
      round1_debit: meta1.debitCallCount,
      round2_debit: meta2.debitCallCount,
      provider: "1+1",
      repair: 0,
      debit: "1+1",
    }
  );
}

// ── 6. stream delta.tool_calls (gpt-5.5 native) ──────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Stream" })],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1020_06",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "s" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
      stream: false,
    } as any,
    limitKey: "p1020-stream",
    idempotencyKey: null,
  });
  const { events, status } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  assert(
    status === 200 &&
      d.toolCallChunks.length >= 1 &&
      d.finish === "tool_calls" &&
      c.debitCallCount === 1 &&
      !d.contents.join("").includes('"type":"tool_call"'),
    "6. stream delta.tool_calls — debit×1 no emulated leak",
    {
      level: "REAL ROUTE ENTRY",
      providerCallCount: c.providerCallCount,
      repairCallCount: c.repairCallCount,
      fallbackCount: c.fallbackCount,
      debitCallCount: c.debitCallCount,
      provider: 1,
      repair: 0,
      debit: 1,
      finish: d.finish,
    }
  );
}

// ── 7. Cursor file create / read simulation ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () =>
        nativeToolCompletion("Write", {
          path: "notes.txt",
          contents: "hello cursor",
        }),
    ],
  });
  const create = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "create notes.txt" }],
      tools: CURSOR_FILE_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_07a"
  );
  const createId = msg(create)?.tool_calls?.[0]?.id ?? "call_write";
  const metaC = billingSnapshot(create);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () =>
        nativeToolCompletion("Read", {
          path: "notes.txt",
        }),
    ],
  });
  const read = await exec(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "create notes.txt" },
        {
          role: "assistant",
          content: null,
          tool_calls: msg(create)?.tool_calls,
        },
        {
          role: "tool",
          tool_call_id: createId,
          content: JSON.stringify({ ok: true }),
        },
        { role: "user", content: "now read notes.txt" },
      ],
      tools: CURSOR_FILE_TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "Read" },
      },
    },
    "req_p1020_07b"
  );
  const metaR = billingSnapshot(read);
  const readArgs = msg(read)?.tool_calls?.[0]?.function?.arguments;
  assert(
    create.ok === true &&
      metaC.debitCallCount === 1 &&
      msg(create)?.tool_calls?.[0]?.function?.name === "Write" &&
      read.ok === true &&
      metaR.debitCallCount === 1 &&
      msg(read)?.tool_calls?.[0]?.function?.name === "Read" &&
      typeof readArgs === "string" &&
      JSON.parse(readArgs).path === "notes.txt",
    "7. Cursor file create/read simulation — debit×1 each",
    {
      ...metaR,
      level: "MOCK PROVIDER",
      create_debit: metaC.debitCallCount,
      read_debit: metaR.debitCallCount,
      provider: "1+1",
      repair: 0,
      debit: "1+1",
    }
  );
}

// ── 8. auto-pro per-attempt capability (native gpt then emulated gemini) ─
{
  // 8a — auto-pro hits gpt-5.5 native first
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.attemptModel === "gpt-5.5" && !ctx.hasCompiler) {
          return nativeToolCompletion("get_weather", { city: "AutoPro" });
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "AutoPro" }),
        };
      },
    ],
  });
  const rNative = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "auto-pro native" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_08a"
  );
  const metaN = billingSnapshot(rNative);

  // 8b — force fallback to gemini-3-pro emulated via busy on gpt attempts
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (
          ctx.attemptModel === "gpt-5.5" ||
          ctx.attemptModel === "gpt-5.4"
        ) {
          return {
            kind: "error",
            code: "upstream_model_busy",
            status: 503,
            message: "busy",
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "GemFallback" }),
          model: "gemini-3-pro",
        };
      },
    ],
  });
  const rGem = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "auto-pro gemini fallback" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_08b"
  );
  const metaG = billingSnapshot(rGem);
  assert(
    rNative.ok === true &&
      metaN.debitCallCount === 1 &&
      (rNative.response?.tokfai as any)?.tool_calling_mode === "native" &&
      rGem.ok === true &&
      metaG.debitCallCount === 1 &&
      (rGem.response?.tokfai as any)?.tool_calling_mode === "emulated_json" &&
      msg(rGem)?.tool_calls?.[0]?.function?.name === "get_weather",
    "8. auto-pro per-attempt capability — native then emulated, debit×1 each",
    {
      ...metaG,
      level: "REAL ROUTE ENTRY",
      native_mode: (rNative.response?.tokfai as any)?.tool_calling_mode,
      gem_mode: (rGem.response?.tokfai as any)?.tool_calling_mode,
      debit: "1+1",
    }
  );
}

// ── 9. no double debit (native success + repair success already covered) ─
{
  resetScenario({
    providers: defaultProviders([
      "grsai-primary",
      "openai-compatible-secondary",
    ]),
    scripts: [
      (ctx) => {
        if (ctx.providerId === "grsai-primary") {
          return {
            kind: "error",
            code: "upstream_model_busy",
            status: 503,
          };
        }
        return nativeToolCompletion("get_weather", { city: "Once" });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "fallback once" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_09"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.fallbackCount >= 1 &&
      meta.debitCallCount === 1,
    "9. provider fallback success — debit×1 only",
    {
      ...meta,
      level: "REAL ROUTE ENTRY",
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 1,
    }
  );
}

// ── 10. unsupported must not forge tool_calls ────────────────────────────
{
  __toolsCapableAttemptsTestSet(true);
  try {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => nativeToolCompletion("get_weather", { city: "Forged" }),
      ],
    });
    const result = await exec(
      {
        model: "auto-pro",
        messages: [{ role: "user", content: "unsupported" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1020_10"
    );
    const meta = billingSnapshot(result);
    assert(
      result.ok === false &&
        result.errorCode === "model_not_tool_capable" &&
        meta.providerCallCount === 0 &&
        meta.debitCallCount === 0 &&
        !msg(result)?.tool_calls,
      "10. unsupported — model_not_tool_capable, no forge, debit=0",
      {
        ...meta,
        level: "REAL ROUTE ENTRY",
        provider: 0,
        repair: 0,
        debit: 0,
      },
      JSON.stringify(result)
    );
  } finally {
    __toolsCapableAttemptsTestSet(null);
  }
}

// ── 11. gpt-5.5 strict must not fake plain text success ──────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "plain text pretending success",
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "strict no fake" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_11"
  );
  const meta = billingSnapshot(result);
  // native miss → emulated repair → still plain → fail not_billable
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      meta.providerCallCount <= 2 &&
      meta.billing_status === "not_billable",
    "11. gpt-5.5 strict plain text — not fake success, debit=0",
    {
      ...meta,
      level: "REAL ROUTE ENTRY",
      errorCode: (result as any).errorCode,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      debit: 0,
    },
    JSON.stringify(result)
  );
}

// ── 12. auto-fast / gpt-5-chat still tool-capable via concrete attempts ───
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        // auto-fast → gemini first (emulated)
        if (ctx.hasCompiler) {
          return {
            kind: "completion",
            content: makeToolCallIntent("get_weather", { city: "Fast" }),
          };
        }
        return nativeToolCompletion("get_weather", { city: "Chat" });
      },
    ],
  });
  const fast = await exec(
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "fast" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_12a"
  );
  const metaF = billingSnapshot(fast);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Chat" })],
  });
  const chat = await exec(
    {
      model: "gpt-5-chat",
      messages: [{ role: "user", content: "chat" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1020_12b"
  );
  const metaC = billingSnapshot(chat);
  assert(
    fast.ok === true &&
      metaF.debitCallCount === 1 &&
      chat.ok === true &&
      metaC.debitCallCount === 1,
    "12. auto-fast + gpt-5-chat preserved — debit×1 each",
    {
      ...metaC,
      level: "REAL ROUTE ENTRY",
      auto_fast_mode: (fast.response?.tokfai as any)?.tool_calling_mode,
      gpt_5_chat_mode: (chat.response?.tokfai as any)?.tool_calling_mode,
      debit: "1+1",
    }
  );
}

console.log("\n── Scenario debit summary ──");
for (const row of scenarioReport) {
  if (row.ok === false) continue;
  console.log(
    `- ${row.label}: provider=${row.provider ?? row.providerCallCount ?? "?"} repair=${row.repair ?? row.repairCallCount ?? "?"} debit=${row.debit ?? row.debitCallCount ?? "?"}`
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  console.error(BLOCKED);
  process.exit(1);
}
console.log(`\n${PASS}`);
