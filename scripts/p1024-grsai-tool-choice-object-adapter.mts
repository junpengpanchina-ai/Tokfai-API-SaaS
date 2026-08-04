/**
 * P1024 — GRSAI native object tool_choice adapter.
 *
 * REAL ROUTE ENTRY via executeChatCompletion (+ stream SSE).
 * Mocks only Provider fetch / auth / DB-RPC debit boundaries.
 *
 *   npx tsx scripts/p1024-grsai-tool-choice-object-adapter.mts
 *
 * Marker: TOKFAI_P1024_GRSAI_TOOL_CHOICE_OBJECT_ADAPTER_PASS
 */

import { fileURLToPath } from "node:url";
import {
  CALLER,
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

const PASS = "TOKFAI_P1024_GRSAI_TOOL_CHOICE_OBJECT_ADAPTER_PASS";
const FAIL = "TOKFAI_P1024_GRSAI_TOOL_CHOICE_OBJECT_ADAPTER_FAIL";

const CANARY_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_tokfai_canary",
      description: "Canary tool",
      parameters: {
        type: "object",
        properties: { value: { type: "integer" } },
        required: ["value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Weather",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
] as const;

function objectChoice(name: string) {
  return { type: "function", function: { name } };
}

let failed = 0;
function pass(label: string, meta: AssertMeta & Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify({ level: meta.level ?? "REAL ROUTE ENTRY", ...meta }, null, 2)
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

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1024",
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
    const choice = (ev as any).choices?.[0];
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

console.log("P1024 GRSAI NATIVE OBJECT tool_choice ADAPTER\n");

// ── 1. single tool + object tool_choice → required + tools.length=1 ──────
{
  const clientBody = {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "canary" }],
    tools: [CANARY_TOOLS[0]],
    tool_choice: objectChoice("get_tokfai_canary"),
  };
  const clientToolsBefore = JSON.stringify(clientBody.tools);
  const clientChoiceBefore = JSON.stringify(clientBody.tool_choice);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.json.tool_choice !== "required") {
          return {
            kind: "error",
            code: "upstream_error",
            status: 400,
            message: "unexpected tool_choice",
          };
        }
        return nativeToolCompletion("get_tokfai_canary", { value: 1 });
      },
    ],
  });
  const result = await exec(clientBody, "req_p1024_01");
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      out.toolNames.length === 1 &&
      out.toolNames[0] === "get_tokfai_canary" &&
      JSON.stringify(clientBody.tools) === clientToolsBefore &&
      JSON.stringify(clientBody.tool_choice) === clientChoiceBefore &&
      meta.debitCallCount === 1,
    "1. GRSAI native single tool object choice → required + tools×1",
    {
      ...meta,
      outbound: out,
      clientBodyIntact: true,
    }
  );
}

// ── 2. multi tools + second function forced ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_weather", { city: "Second" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "second" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_weather"),
    },
    "req_p1024_02"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      out.toolNames.length === 1 &&
      out.toolNames[0] === "get_weather" &&
      !out.toolNames.includes("get_tokfai_canary") &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather",
    "2. multi tools — only forced second function kept outbound",
    { ...meta, outbound: out }
  );
}

// ── 3. unknown forced name → 400, provider=0, debit=0 ────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "X" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "nope" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("does_not_exist"),
    },
    "req_p1024_03"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.httpStatus === 400 &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0 &&
      (result.errorCode === "tool_name_not_allowed" ||
        result.errorCode === "invalid_request_error"),
    "3. unknown forced name → 400 provider=0 debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 4. empty function.name → 400 provider=0 ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "X" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "empty" }],
      tools: CANARY_TOOLS,
      tool_choice: { type: "function", function: { name: "  " } },
    },
    "req_p1024_04"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.httpStatus === 400 &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0,
    "4. empty function.name → 400 provider=0 debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 5. upstream correct function → 200 debit×1 ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_tokfai_canary", { value: 42 }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "ok" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_05"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      result.response.choices[0].finish_reason === "tool_calls" &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_tokfai_canary" &&
      meta.debitCallCount === 1 &&
      meta.providerCallCount === 1,
    "5. upstream correct function → 200 tool_calls debit×1",
    meta
  );
}

// ── 6. upstream wrong function → not success, debit=0 ────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.hasCompiler) {
          // repair still wrong name
          return {
            kind: "completion",
            content: makeToolCallIntent("get_weather", { city: "Wrong" }),
          };
        }
        return nativeToolCompletion("get_weather", { city: "Wrong" });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "mismatch" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_06"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      meta.billing_status === "not_billable" &&
      meta.providerCallCount <= 2 &&
      meta.repairCallCount <= 1,
    "6. upstream wrong function → fail/repair≤1 debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 7. upstream mixed correct+wrong → fail debit=0 ───────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.hasCompiler) {
          return {
            kind: "completion",
            content: JSON.stringify({
              type: "tool_call",
              tool_calls: [
                { name: "get_tokfai_canary", arguments: { value: 1 } },
                { name: "get_weather", arguments: { city: "X" } },
              ],
            }),
          };
        }
        return {
          kind: "completion",
          content: null,
          tool_calls: [
            {
              id: "call_a",
              type: "function",
              function: {
                name: "get_tokfai_canary",
                arguments: JSON.stringify({ value: 1 }),
              },
            },
            {
              id: "call_b",
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "X" }),
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
      messages: [{ role: "user", content: "mixed" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_07"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      meta.billing_status === "not_billable",
    "7. mixed correct+wrong tool_calls → fail debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 8. tool_choice="required" — no object adapter / no filter ────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_tokfai_canary", { value: 7 }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "required" }],
      tools: CANARY_TOOLS,
      tool_choice: "required",
    },
    "req_p1024_08"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      out.toolNames.length === 2 &&
      out.toolNames.includes("get_tokfai_canary") &&
      out.toolNames.includes("get_weather") &&
      meta.debitCallCount === 1,
    "8. tool_choice=required — no object adapter, tools not filtered",
    { ...meta, outbound: out }
  );
}

// ── 9. tool_choice="auto" unchanged ──────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "plain auto reply" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "auto" }],
      tools: CANARY_TOOLS,
      tool_choice: "auto",
    },
    "req_p1024_09"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      out?.tool_choice === "auto" &&
      out.toolNames.length === 2 &&
      msg(result)?.content === "plain auto reply" &&
      meta.debitCallCount === 1,
    "9. tool_choice=auto — behavior unchanged",
    { ...meta, outbound: out }
  );
}

// ── 10. Gemini emulated — no GRSAI native adapter ────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        // Emulated path strips tools; must see compiler, not native required filter.
        if (!ctx.hasCompiler) {
          return { kind: "completion", content: "LEAK" };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Gem" }),
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "gem" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_weather"),
    },
    "req_p1024_10"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  assert(
    result.ok === true &&
      meta.compilerSeenCount >= 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "emulated_json" &&
      // emulated strips tools from outbound
      (out?.toolNames.length ?? 0) === 0 &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      meta.debitCallCount === 1,
    "10. Gemini emulated — no GRSAI native object adapter",
    { ...meta, outbound: out, mode: (result.response?.tokfai as any)?.tool_calling_mode }
  );
}

// ── 11. provider fallback — first adapt must not pollute second body ─────
{
  const clientBody = {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "fb" }],
    tools: [...CANARY_TOOLS],
    tool_choice: objectChoice("get_tokfai_canary"),
  };
  const toolsSnapshot = JSON.stringify(clientBody.tools);

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
        // Secondary must NOT be forced through GRSAI adapter.
        return nativeToolCompletion("get_tokfai_canary", { value: 9 });
      },
    ],
  });
  const result = await exec(clientBody, "req_p1024_11");
  const meta = billingSnapshot(result);
  const outs = getCounts().outboundBodies;
  const primary = outs.find((o) => o.providerId === "grsai-primary");
  const secondary = outs.find(
    (o) => o.providerId === "openai-compatible-secondary"
  );
  assert(
    result.ok === true &&
      meta.fallbackCount >= 1 &&
      meta.debitCallCount === 1 &&
      primary?.tool_choice === "required" &&
      primary.toolNames.length === 1 &&
      // secondary keeps object tool_choice + both tools (no GRSAI adapt)
      typeof secondary?.tool_choice === "object" &&
      secondary.toolNames.length === 2 &&
      JSON.stringify(clientBody.tools) === toolsSnapshot,
    "11. provider fallback — primary adapt does not pollute secondary/client",
    {
      ...meta,
      primary,
      secondary,
      clientIntact: JSON.stringify(clientBody.tools) === toolsSnapshot,
    }
  );
}

// ── 12. role=tool second round with forced function ──────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_tokfai_canary", { value: 1 }),
    ],
  });
  const r1 = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "r1" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_12a"
  );
  const id = msg(r1)?.tool_calls?.[0]?.id ?? "call_x";
  const meta1 = billingSnapshot(r1);

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        // Second round may still force same tool or auto; ensure tool_call_id preserved in outbound.
        const messages = Array.isArray(ctx.json.messages)
          ? ctx.json.messages
          : [];
        const hasToolRole = messages.some(
          (m) =>
            m &&
            typeof m === "object" &&
            (m as any).role === "tool" &&
            (m as any).tool_call_id === id
        );
        if (!hasToolRole) {
          return {
            kind: "error",
            code: "upstream_error",
            status: 400,
            message: "missing tool role",
          };
        }
        return { kind: "completion", content: "final after tool" };
      },
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
          content: JSON.stringify({ value: 1 }),
        },
      ],
      tools: CANARY_TOOLS,
      tool_choice: "auto",
    },
    "req_p1024_12b"
  );
  const meta2 = billingSnapshot(r2);
  assert(
    r1.ok === true &&
      meta1.debitCallCount === 1 &&
      r2.ok === true &&
      meta2.debitCallCount === 1 &&
      msg(r2)?.content === "final after tool",
    "12. role=tool second round — tool_call_id preserved, debit×1 each",
    {
      ...meta2,
      round1_debit: meta1.debitCallCount,
      round2_debit: meta2.debitCallCount,
      tool_call_id: id,
    }
  );
}

// ── 13. stream=false message.tool_calls ──────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_tokfai_canary", { value: 3 }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: "ns" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_13"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      Array.isArray(msg(result)?.tool_calls) &&
      msg(result).tool_calls.length === 1 &&
      meta.debitCallCount === 1,
    "13. stream=false message.tool_calls ok",
    meta
  );
}

// ── 14. stream=true delta.tool_calls, no raw JSON leak ───────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => nativeToolCompletion("get_tokfai_canary", { value: 4 }),
    ],
  });
  const res = await respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId: "req_p1024_14",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "st" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
      stream: false,
    } as any,
    limitKey: "p1024-stream",
    idempotencyKey: null,
  });
  const { events, status, text } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  assert(
    status === 200 &&
      d.toolCallChunks.length >= 1 &&
      d.finish === "tool_calls" &&
      c.debitCallCount === 1 &&
      !d.contents.join("").includes('"type":"tool_call"'),
    "14. stream=true delta.tool_calls, no emulated JSON leak",
    {
      level: "REAL ROUTE ENTRY",
      providerCallCount: c.providerCallCount,
      repairCallCount: c.repairCallCount,
      fallbackCount: c.fallbackCount,
      debitCallCount: c.debitCallCount,
      finish: d.finish,
      toolCallChunks: d.toolCallChunks.length,
      contentJoined: d.contents.join(""),
    }
  );
}

// ── 15. success debit ≤ 1 across provider/repair/fallback ────────────────
{
  resetScenario({
    providers: defaultProviders([
      "grsai-primary",
      "openai-compatible-secondary",
    ]),
    scripts: [
      (ctx) => {
        if (ctx.providerId === "grsai-primary" && !ctx.hasCompiler) {
          // wrong name → triggers mismatch → emulated repair
          return nativeToolCompletion("get_weather", { city: "nope" });
        }
        if (ctx.providerId === "grsai-primary" && ctx.hasCompiler) {
          return {
            kind: "error",
            code: "upstream_model_busy",
            status: 503,
          };
        }
        return nativeToolCompletion("get_tokfai_canary", { value: 11 });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "combo" }],
      tools: CANARY_TOOLS,
      tool_choice: objectChoice("get_tokfai_canary"),
    },
    "req_p1024_15"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      meta.debitCallCount <= 1 &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_tokfai_canary",
    "15. repair+fallback success — debit≤1",
    {
      ...meta,
      provider: meta.providerCallCount,
      repair: meta.repairCallCount,
      fallback: meta.fallbackCount,
      debit: meta.debitCallCount,
    }
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
