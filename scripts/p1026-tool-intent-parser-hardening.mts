/**
 * P1026 — Cursor real tool-intent parser hardening matrix.
 *
 * REAL COMPILER/PARSER + REAL executeChatCompletion ENTRY
 * MOCK PROVIDER + DEBIT SPY + STATIC SOURCE CHECK
 * No LIVE upstream / LIVE Cursor Agent / real billing RPC.
 *
 *   npx tsx scripts/p1026-tool-intent-parser-hardening.mts
 *
 * Marker: TOKFAI_P1026_CURSOR_REAL_TOOL_INTENT_PARSER_PASS
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALLER,
  WEATHER_TOOLS,
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
} from "./fixtures/p1018-tool-intent-harness.mts";
import {
  P1026_DEEP_NESTED_TOOL,
  P1026_WEATHER_TOOLS,
  buildCursorStyleTools,
  canonicalMultiToolCall,
  canonicalToolCall,
  openaiToolCallsObjectArgs,
  openaiToolCallsShape,
} from "./fixtures/p1026-cursor-tools.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "apps/dmit-api/src/lib");

const {
  parseToolIntentFromContent,
  extractToolIntentJsonCandidate,
  applyToolIntentToChatCompletion,
} = await import(join(LIB, "toolIntentParser.ts"));
const { compileEmulatedUpstreamBody, EMULATED_TOOL_INTENT_SYSTEM_PROMPT } =
  await import(join(LIB, "toolIntentCompiler.ts"));
const { validateAgainstJsonSchema } = await import(
  join(LIB, "toolIntentSchema.ts")
);

const { executeChatCompletion } = await loadExecuteChatCompletion();
const { respondChatCompletionEarlySse } = await loadRespondEarlySse();

const PASS = "TOKFAI_P1026_CURSOR_REAL_TOOL_INTENT_PARSER_PASS";
const BLOCKED = "TOKFAI_P1026_CURSOR_REAL_TOOL_INTENT_PARSER_BLOCKED";

type Level =
  | "REAL COMPILER/PARSER"
  | "REAL executeChatCompletion ENTRY"
  | "MOCK PROVIDER"
  | "DEBIT SPY"
  | "STATIC SOURCE CHECK";

const report: Array<Record<string, unknown>> = [];
let failed = 0;

function pass(
  id: string,
  levels: Level[],
  meta: Record<string, unknown> = {}
) {
  console.log(`PASS  ${id}`);
  report.push({ id, ok: true, levels, ...meta });
}

function fail(id: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${id}${detail ? ` — ${detail}` : ""}`);
  report.push({ id, ok: false, detail });
}

function check(
  id: string,
  levels: Level[],
  fn: () => void,
  meta: Record<string, unknown> = {}
) {
  try {
    fn();
    pass(id, levels, meta);
  } catch (err) {
    fail(id, String((err as Error)?.message ?? err));
  }
}

async function checkAsync(
  id: string,
  levels: Level[],
  fn: () => Promise<void>,
  meta: Record<string, unknown> = {}
) {
  try {
    await fn();
    pass(id, levels, { ...meta });
  } catch (err) {
    fail(id, String((err as Error)?.message ?? err));
  }
}

function codeOf(err: unknown): string | undefined {
  return (err as { code?: string })?.code;
}

function throwsCode(fn: () => unknown, code: string) {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `expected throw ${code}`);
  assert.equal(codeOf(caught), code);
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1026",
    clientStream: false,
  });
}

function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}

function httpOk(result: any): boolean {
  return result?.ok === true;
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

async function streamChat(
  body: Record<string, unknown>,
  requestId: string
): Promise<Response> {
  return respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId,
    body: { ...body, stream: false } as any,
    limitKey: "p1026-stream",
    idempotencyKey: null,
  });
}

async function readSse(res: Response) {
  const text = await res.text();
  const events: Array<Record<string, unknown>> = [];
  for (const block of text.split("\n\n")) {
    const line = block
      .split("\n")
      .find((l) => l.startsWith("data: "));
    if (!line) continue;
    const data = line.slice(6).trim();
    if (data === "[DONE]") {
      events.push({ done: true });
      continue;
    }
    try {
      events.push(JSON.parse(data));
    } catch {
      events.push({ raw: data });
    }
  }
  return { text, events, status: res.status };
}

function collectDeltas(events: Array<Record<string, unknown>>) {
  const toolCallChunks: unknown[] = [];
  const contents: string[] = [];
  let finish: string | null = null;
  let sawDone = false;
  let errorCode: string | null = null;
  for (const ev of events) {
    if (ev.done) sawDone = true;
    if (ev.error && typeof ev.error === "object") {
      errorCode = String((ev.error as { code?: string }).code ?? "");
    }
    const choices = ev.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    if (!choice) continue;
    if (typeof choice.finish_reason === "string") finish = choice.finish_reason;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (!delta) continue;
    if (typeof delta.content === "string") contents.push(delta.content);
    if (Array.isArray(delta.tool_calls)) {
      toolCallChunks.push(...delta.tool_calls);
    }
  }
  return { toolCallChunks, contents, finish, sawDone, errorCode };
}

console.log("P1026 — Cursor real tool-intent parser hardening\n");
console.log(
  "Honesty: REAL COMPILER/PARSER | REAL executeChatCompletion ENTRY | MOCK PROVIDER | DEBIT SPY | STATIC SOURCE CHECK\n"
);

const TOOLS = P1026_WEATHER_TOOLS as unknown as typeof WEATHER_TOOLS;

// ── 1. canonical single tool ─────────────────────────────────────────────
check("01_canonical_single", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: canonicalToolCall("get_weather", { city: "Shanghai" }),
    clientTools: TOOLS,
    toolChoice: "required",
  });
  assert.equal(intent.kind, "tool_call");
  if (intent.kind !== "tool_call") return;
  assert.equal(intent.toolCalls.length, 1);
  assert.equal(intent.toolCalls[0].function.name, "get_weather");
  assert.ok(intent.toolCalls[0].id.startsWith("call_"));
});

// ── 2. canonical multi tool ──────────────────────────────────────────────
check("02_canonical_multi", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: canonicalMultiToolCall([
      { name: "get_weather", arguments: { city: "Tokyo" } },
      { name: "get_time", arguments: { tz: "Asia/Tokyo" } },
    ]),
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  if (intent.kind !== "tool_call") return;
  assert.equal(intent.toolCalls.length, 2);
});

// ── 3. ```json fenced canonical ──────────────────────────────────────────
check("03_fenced_json_canonical", ["REAL COMPILER/PARSER"], () => {
  const body = canonicalToolCall("get_weather", { city: "Paris" });
  const intent = parseToolIntentFromContent({
    content: "```json\n" + body + "\n```",
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  const ex = extractToolIntentJsonCandidate("```json\n" + body + "\n```");
  assert.equal(ex.ok, true);
  if (ex.ok) assert.equal(ex.meta.wrapperClass, "fenced_json");
});

// ── 4. ordinary fenced canonical ─────────────────────────────────────────
check("04_fenced_plain_canonical", ["REAL COMPILER/PARSER"], () => {
  const body = canonicalToolCall("get_weather", { city: "Berlin" });
  const intent = parseToolIntentFromContent({
    content: "```\n" + body + "\n```",
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  const ex = extractToolIntentJsonCandidate("```\n" + body + "\n```");
  assert.equal(ex.ok, true);
  if (ex.ok) assert.equal(ex.meta.wrapperClass, "fenced");
});

// ── 5. prefix + unique JSON ──────────────────────────────────────────────
check("05_prefix_unique_json", ["REAL COMPILER/PARSER"], () => {
  const body = canonicalToolCall("get_weather", { city: "Oslo" });
  const intent = parseToolIntentFromContent({
    content: "Sure, calling the tool now:\n" + body,
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  const ex = extractToolIntentJsonCandidate("Sure:\n" + body);
  assert.equal(ex.ok, true);
  if (ex.ok) assert.equal(ex.meta.wrapperClass, "prefixed");
});

// ── 6. unique JSON + suffix ──────────────────────────────────────────────
check("06_suffix_unique_json", ["REAL COMPILER/PARSER"], () => {
  const body = canonicalToolCall("get_weather", { city: "Rome" });
  const intent = parseToolIntentFromContent({
    content: body + "\nDone.",
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  const ex = extractToolIntentJsonCandidate(body + "\nDone.");
  assert.equal(ex.ok, true);
  if (ex.ok) assert.equal(ex.meta.wrapperClass, "suffixed");
});

// ── 7. OpenAI tool_calls + arguments string ──────────────────────────────
check("07_openai_tool_calls_args_string", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: openaiToolCallsShape("get_weather", { city: "Madrid" }),
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  if (intent.kind !== "tool_call") return;
  assert.equal(intent.toolCalls[0].function.name, "get_weather");
  assert.equal(intent.toolCalls[0].function.arguments, '{"city":"Madrid"}');
});

// ── 8. OpenAI assistant message + tool_calls ─────────────────────────────
check("08_openai_assistant_message", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: openaiToolCallsShape("get_time", { tz: "UTC" }, { withRole: true }),
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
  if (intent.kind !== "tool_call") return;
  assert.equal(intent.toolCalls[0].function.name, "get_time");
});

// ── 9. arguments already object ──────────────────────────────────────────
check("09_openai_args_object", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: openaiToolCallsObjectArgs("get_weather", { city: "Lisbon" }),
    clientTools: TOOLS,
  });
  assert.equal(intent.kind, "tool_call");
});

// ── 10. arguments illegal JSON string ────────────────────────────────────
check("10_args_illegal_json_string", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: openaiToolCallsShape("get_weather", "{not-json"),
        clientTools: TOOLS,
      }),
    "tool_arguments_invalid"
  );
});

// ── 11. arguments parse to array ─────────────────────────────────────────
check("11_args_parse_to_array", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: openaiToolCallsShape("get_weather", "[1,2,3]"),
        clientTools: TOOLS,
      }),
    "tool_arguments_invalid"
  );
});

// ── 12. two JSON candidates → ambiguous ──────────────────────────────────
check("12_two_candidates_ambiguous", ["REAL COMPILER/PARSER"], () => {
  const a = canonicalToolCall("get_weather", { city: "A" });
  const b = canonicalToolCall("get_weather", { city: "B" });
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: a + "\n" + b,
        clientTools: TOOLS,
      }),
    "tool_intent_ambiguous_json"
  );
});

// ── 13. incomplete brackets ──────────────────────────────────────────────
check("13_incomplete_brackets", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: '{"type":"tool_call","tool_calls":[{"name":"get_weather"',
        clientTools: TOOLS,
      }),
    "tool_intent_invalid_json"
  );
});

// ── 14. unknown tool name ────────────────────────────────────────────────
check("14_unknown_tool_name", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: canonicalToolCall("hack_the_planet", {}),
        clientTools: TOOLS,
      }),
    "tool_name_not_allowed"
  );
});

// ── 15. tool_choice mismatch ─────────────────────────────────────────────
check("15_tool_choice_mismatch", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: canonicalToolCall("get_time", { tz: "UTC" }),
        clientTools: TOOLS,
        toolChoice: {
          type: "function",
          function: { name: "get_weather" },
        },
      }),
    "tool_name_not_allowed"
  );
});

// ── 16. arguments schema invalid ─────────────────────────────────────────
check("16_args_schema_invalid", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: canonicalToolCall("get_weather", {
          city: "X",
          unit: "kelvin",
        }),
        clientTools: TOOLS,
      }),
    "tool_arguments_invalid"
  );
});

// ── 17. assistant_text + tool_calls together ─────────────────────────────
check("17_assistant_text_and_tool_calls", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          role: "assistant",
          content: "I will call a tool",
          tool_calls: [
            {
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"NYC"}',
              },
            },
          ],
        }),
        clientTools: TOOLS,
      }),
    "tool_intent_invalid_json"
  );
});

// ── 18. parallel_tool_calls=false with two ───────────────────────────────
check("18_parallel_false_multi", ["REAL COMPILER/PARSER"], () => {
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: canonicalMultiToolCall([
          { name: "get_weather", arguments: { city: "A" } },
          { name: "get_time", arguments: { tz: "UTC" } },
        ]),
        clientTools: TOOLS,
        parallelToolCalls: false,
      }),
    "tool_intent_invalid_json"
  );
});

// ── 19. 20+ Cursor-style tools fixture ───────────────────────────────────
check("19_cursor_style_20plus_tools", ["REAL COMPILER/PARSER"], () => {
  const cursorTools = buildCursorStyleTools(22);
  assert.ok(cursorTools.length >= 20);
  const compiled = compileEmulatedUpstreamBody(
    { model: "gemini-3-pro", messages: [{ role: "user", content: "x" }] },
    { tools: cursorTools, tool_choice: "required" }
  );
  assert.equal(compiled.tools, undefined);
  assert.ok(Array.isArray(compiled.messages));
  const intent = parseToolIntentFromContent({
    content: canonicalToolCall("Read", { path: "/tmp/a.txt" }),
    clientTools: cursorTools,
    toolChoice: "required",
  });
  assert.equal(intent.kind, "tool_call");
  if (intent.kind !== "tool_call") return;
  assert.equal(intent.toolCalls[0].function.name, "Read");
});

// ── 20. deeply nested parameters Schema ──────────────────────────────────
check("20_deep_nested_schema", ["REAL COMPILER/PARSER"], () => {
  const tools = [P1026_DEEP_NESTED_TOOL];
  const good = {
    meta: {
      source: "doc.md",
      tags: ["a"],
      author: {
        name: "tokfai",
        contact: {
          email: "a@b.c",
          phones: [{ kind: "mobile", number: "1" }],
        },
      },
    },
    options: {
      depth: 2,
      flags: { includeImages: false, language: "en" },
    },
  };
  const schemaOk = validateAgainstJsonSchema(
    good,
    P1026_DEEP_NESTED_TOOL.function.parameters
  );
  assert.equal(schemaOk.ok, true);
  const intent = parseToolIntentFromContent({
    content: canonicalToolCall("analyze_document", good),
    clientTools: tools,
  });
  assert.equal(intent.kind, "tool_call");

  const bad = {
    meta: {
      source: "doc.md",
      author: {
        name: "tokfai",
        contact: { email: "a@b.c", phones: [{ kind: "mobile" }] },
      },
    },
    options: { depth: 2, flags: { includeImages: false } },
  };
  throwsCode(
    () =>
      parseToolIntentFromContent({
        content: canonicalToolCall("analyze_document", bad),
        clientTools: tools,
      }),
    "tool_arguments_invalid"
  );
});

// ── 21. native miss → emulated wrapped JSON → success ────────────────────
await checkAsync(
  "21_native_miss_emulated_wrapped_success",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        // native gpt path misses tool_calls
        () => ({ kind: "completion", content: "thinking..." }),
        // emulated repair with prefixed JSON
        () => ({
          kind: "completion",
          content:
            "Result:\n" +
            makeToolCallIntent("get_weather", { city: "Shanghai" }),
        }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "weather?" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s21"
    );
    const c = getCounts();
    const m = msg(result);
    assert.equal(httpOk(result), true);
    assert.ok(Array.isArray(m?.tool_calls));
    assert.equal(m.tool_calls[0].function.name, "get_weather");
    assert.equal(c.debitCallCount, 1);
  },
  { provider: "grsai-primary", repair: true, debit: 1, status: 200 }
);

// ── 22. native miss → emulated OpenAI shape → success ────────────────────
await checkAsync(
  "22_native_miss_emulated_openai_shape",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({ kind: "completion", content: "no tools" }),
        () => ({
          kind: "completion",
          content: openaiToolCallsShape("get_weather", { city: "Kyoto" }, {
            withRole: true,
          }),
        }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "weather" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s22"
    );
    const c = getCounts();
    const m = msg(result);
    assert.equal(httpOk(result), true);
    assert.equal(m?.tool_calls?.[0]?.function?.name, "get_weather");
    assert.equal(c.debitCallCount, 1);
  },
  { provider: "grsai-primary", repair: true, debit: 1, status: 200 }
);

// ── 23. native miss → invalid → repair retry → success ───────────────────
await checkAsync(
  "23_native_miss_invalid_repair_success",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    let emulatedCalls = 0;
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({ kind: "completion", content: "plain" }),
        (ctx) => {
          emulatedCalls += 1;
          if (!ctx.isRepair) {
            return { kind: "completion", content: "NOT_JSON!!!" };
          }
          return {
            kind: "completion",
            content: makeToolCallIntent("get_weather", { city: "Seoul" }),
          };
        },
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "w" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s23"
    );
    const c = getCounts();
    assert.equal(httpOk(result), true);
    assert.equal(msg(result)?.tool_calls?.[0]?.function?.name, "get_weather");
    assert.equal(c.debitCallCount, 1);
    assert.ok(c.repairCallCount >= 1 || emulatedCalls >= 1);
  },
  { provider: "grsai-primary", repair: true, debit: 1, status: 200 }
);

// ── 24. native miss → two invalid → not_billable ─────────────────────────
await checkAsync(
  "24_two_invalid_not_billable",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({ kind: "completion", content: "plain" }),
        () => ({ kind: "completion", content: "STILL_BAD" }),
        () => ({ kind: "completion", content: "STILL_BAD_2" }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "w" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s24"
    );
    const c = getCounts();
    assert.equal(httpOk(result), false);
    assert.equal(c.debitCallCount, 0);
    assert.ok(
      result.errorCode === "tool_intent_invalid_json" ||
        String(result.errorCode ?? "").startsWith("tool_") ||
        String(result.errorCode ?? "").includes("tool")
    );
  },
  { debit: 0, status: "error", billing_status: "not_billable" }
);

// ── 25. provider/model fallback then success → debit once ────────────────
await checkAsync(
  "25_fallback_success_debit_once",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
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
          return {
            kind: "completion",
            content: null,
            tool_calls: [
              {
                id: "call_fb",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Once"}',
                },
              },
            ],
            finish_reason: "tool_calls",
          };
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
      "req_p1026_s25"
    );
    const c = getCounts();
    assert.equal(httpOk(result), true);
    assert.ok(c.fallbackCount >= 1);
    assert.equal(c.debitCallCount, 1);
    assert.ok(msg(result)?.tool_calls?.length >= 1);
  },
  { debit: 1, fallback: true, status: 200 }
);

// ── 26. stream=false → message.tool_calls ────────────────────────────────
await checkAsync(
  "26_stream_false_message_tool_calls",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Vienna" }),
        }),
      ],
    });
    const result = await exec(
      {
        model: "gemini-3-pro",
        stream: false,
        messages: [{ role: "user", content: "w" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s26"
    );
    const c = getCounts();
    const m = msg(result);
    assert.equal(httpOk(result), true);
    assert.equal(result.response?.choices?.[0]?.finish_reason, "tool_calls");
    assert.ok(Array.isArray(m?.tool_calls));
    assert.equal(m.content, null);
    assert.equal(c.debitCallCount, 1);
  },
  { stream: false, debit: 1, status: 200 }
);

// ── 27. stream=true → delta.tool_calls via SSE mapper ────────────────────
await checkAsync(
  "27_stream_true_delta_tool_calls",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Prague" }),
        }),
      ],
    });
    const res = await streamChat(
      {
        model: "gemini-3-pro",
        messages: [{ role: "user", content: "w" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s27"
    );
    const { events, status } = await readSse(res);
    const d = collectDeltas(events);
    const c = getCounts();
    assert.equal(status, 200);
    assert.ok(d.toolCallChunks.length >= 1);
    assert.equal(d.finish, "tool_calls");
    assert.equal(c.debitCallCount, 1);
  },
  { stream: true, status: 200, debit: 1 }
);

// ── 28. role=tool second round does not repeat old call ──────────────────
// P1033 — resume with raw role=tool requires native tool-transcript model.
await checkAsync(
  "28_role_tool_second_round",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          ...nativeToolCompletion("get_time", { tz: "Asia/Shanghai" }, {
            id: "call_new_time",
          }),
        }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [
          { role: "user", content: "time?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_old_weather",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Old"}',
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_old_weather",
            content: '{"ok":true}',
          },
          { role: "user", content: "now the time" },
        ],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s28"
    );
    const m = msg(result);
    assert.equal(httpOk(result), true);
    assert.equal(m?.tool_calls?.[0]?.function?.name, "get_time");
    assert.notEqual(m?.tool_calls?.[0]?.id, "call_old_weather");
  },
  { debit: 1, status: 200 }
);

// ── 29. no tools → parser never entered ──────────────────────────────────
await checkAsync(
  "29_no_tools_skips_parser",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          kind: "completion",
          content: '{"type":"tool_call","tool_calls":[]}',
        }),
      ],
    });
    const result = await exec(
      {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "hi" }],
      },
      "req_p1026_s29"
    );
    const c = getCounts();
    assert.equal(httpOk(result), true);
    assert.equal(c.compilerSeenCount, 0);
    // Plain content preserved — not parsed as tool intent.
    assert.equal(
      msg(result)?.content,
      '{"type":"tool_call","tool_calls":[]}'
    );
    assert.equal(c.debitCallCount, 1);
  },
  { parser_entered: false, debit: 1 }
);

// ── 30. image model still forbids tools ──────────────────────────────────
await checkAsync(
  "30_image_model_forbids_tools",
  ["REAL executeChatCompletion ENTRY", "MOCK PROVIDER", "DEBIT SPY"],
  async () => {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({ kind: "completion", content: "should not run" }),
      ],
    });
    const result = await exec(
      {
        model: "nano-banana",
        messages: [{ role: "user", content: "draw" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1026_s30"
    );
    const c = getCounts();
    assert.equal(httpOk(result), false);
    assert.equal(c.debitCallCount, 0);
    assert.ok(
      result.errorCode === "image_model_not_for_chat" ||
        String(result.errorCode ?? "").includes("image")
    );
  },
  { debit: 0, billing_status: "not_billable" }
);

// ── Compiler prompt hardening (static) ───────────────────────────────────
check("compiler_prompt_hardening", ["STATIC SOURCE CHECK", "REAL COMPILER/PARSER"], () => {
  const p = EMULATED_TOOL_INTENT_SYSTEM_PROMPT;
  for (const needle of [
    "Return exactly one minified JSON object",
    "Do not use Markdown or code fences",
    "Do not explain your answer",
    "Never reproduce tool descriptions",
    "Select only names from the supplied tool list",
    "arguments must be a JSON object",
    "When tool_choice is required, assistant_text is forbidden",
  ]) {
    assert.ok(p.includes(needle), `missing prompt needle: ${needle}`);
  }
  // Client tool definitions still injected.
  const out = compileEmulatedUpstreamBody(
    { model: "x", messages: [] },
    { tools: WEATHER_TOOLS, tool_choice: "required" }
  );
  const lastUser = [...(out.messages as any[])]
    .reverse()
    .find((m) => m.role === "user");
  assert.ok(String(lastUser?.content ?? "").includes("get_weather"));
});

// ── applyToolIntent maps OpenAI response shape ───────────────────────────
check("apply_maps_openai_shape", ["REAL COMPILER/PARSER"], () => {
  const intent = parseToolIntentFromContent({
    content: openaiToolCallsShape("get_weather", { city: "Z" }),
    clientTools: TOOLS,
  });
  const mapped = applyToolIntentToChatCompletion(
    { choices: [{ message: { role: "assistant", content: "raw" } }] },
    intent
  );
  assert.equal((mapped.choices as any)[0].finish_reason, "tool_calls");
  assert.equal((mapped.choices as any)[0].message.content, null);
});

// ── Source allowlist static check ────────────────────────────────────────
check("static_source_scope", ["STATIC SOURCE CHECK"], () => {
  const parser = readFileSync(join(LIB, "toolIntentParser.ts"), "utf8");
  assert.ok(parser.includes("extractToolIntentJsonCandidate"));
  assert.ok(
    parser.includes("tool_intent_ambiguous_json") ||
      parser.includes("TOOL_INTENT_AMBIGUOUS_JSON")
  );
  // Forbid actual JSON5 / eval / Function repair paths (comments may mention them).
  assert.ok(!/\bimport\b[^;]*JSON5/.test(parser));
  assert.ok(!/\brequire\s*\(\s*['"]json5['"]\s*\)/.test(parser));
  assert.ok(!/\bnew\s+Function\s*\(/.test(parser));
  assert.ok(!/\beval\s*\(/.test(parser));
  const errors = readFileSync(join(LIB, "toolIntentErrors.ts"), "utf8");
  assert.ok(errors.includes("tool_intent_ambiguous_json"));
});

console.log("\n── Scenario report ──");
for (const row of report) {
  console.log(JSON.stringify(row));
}

if (failed > 0) {
  console.error(`\n${BLOCKED} (${failed} failed)`);
  process.exit(1);
}

console.log(`\n${PASS}`);
