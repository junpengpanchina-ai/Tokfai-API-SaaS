/**
 * P1018 — REAL ROUTE ENTRY matrix for Tool Intent (pre-deploy).
 *
 * Loads production executeChatCompletion (+ optional chat route).
 * Mocks only Provider fetch / auth / DB-RPC debit boundaries.
 *
 *   npx tsx scripts/p1018-tool-intent-real-route-entry.mts
 *
 * Marker: TOKFAI_P1018_TOOL_INTENT_REAL_ROUTE_ENTRY_PASS
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
  makeAssistantTextIntent,
  makeParallelToolCallIntent,
  makeToolCallIntent,
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const { __toolsCapableAttemptsTestSet } = await import(
  "../apps/dmit-api/src/lib/toolCallCapability.ts"
);

const PASS = "TOKFAI_P1018_TOOL_INTENT_REAL_ROUTE_ENTRY_PASS";
const FAIL = "TOKFAI_P1018_TOOL_INTENT_REAL_ROUTE_ENTRY_FAIL";

let failed = 0;

function pass(label: string, meta: AssertMeta) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify(
      {
        level: "REAL ROUTE ENTRY",
        entry: "executeChatCompletion",
        ...meta,
      },
      null,
      2
    )
  );
}

function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond: boolean, label: string, meta: AssertMeta, detail?: string) {
  if (cond) pass(label, meta);
  else fail(label, detail ?? JSON.stringify(meta));
}

function msg(result: any) {
  const choices = result?.response?.choices;
  return choices?.[0]?.message ?? null;
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1018",
    clientStream: false,
  });
}

console.log("P1018 REAL ROUTE ENTRY — executeChatCompletion\n");

// ── 1. Ordinary chat, no tools ───────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello from plain chat",
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1018_01"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.httpStatus === 200 &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      meta.compilerSeenCount === 0 &&
      m?.content === "hello from plain chat" &&
      !m?.tool_calls,
    "1. no-tools ordinary chat — no compiler, provider×1, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, m, meta })
  );
}

// ── 2. gpt-5.5 native tool required ──────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.hasCompiler) {
          return {
            kind: "completion",
            content: makeToolCallIntent("get_weather", { city: "Shanghai" }),
          };
        }
        return nativeToolCompletion("get_weather", { city: "Shanghai" });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather?" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_02"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  const tc = m?.tool_calls?.[0];
  const argsStr = tc?.function?.arguments;
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      meta.compilerSeenCount === 0 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "native" &&
      Array.isArray(m?.tool_calls) &&
      m.tool_calls.length === 1 &&
      tc?.function?.name === "get_weather" &&
      typeof argsStr === "string" &&
      JSON.parse(argsStr).city === "Shanghai" &&
      result.response.choices[0].finish_reason === "tool_calls" &&
      (m.content === null || m.content === ""),
    "2. gpt-5.5 native required tool_call → message.tool_calls, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, m, finish: result.response?.choices?.[0]?.finish_reason, meta, tokfai: result.response?.tokfai })
  );
}

// ── 2b. gemini-3-pro emulated_json single tool required ──────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "SHOULD_NOT_USE_PLAIN",
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Shanghai" }),
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "weather?" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_02b"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  const tc = m?.tool_calls?.[0];
  const argsStr = tc?.function?.arguments;
  const rawJson = makeToolCallIntent("get_weather", { city: "Shanghai" });
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      meta.debitCallCount === 1 &&
      meta.compilerSeenCount >= 1 &&
      (result.response?.tokfai as any)?.tool_calling_mode === "emulated_json" &&
      Array.isArray(m?.tool_calls) &&
      m.tool_calls.length === 1 &&
      tc?.function?.name === "get_weather" &&
      typeof argsStr === "string" &&
      JSON.parse(argsStr).city === "Shanghai" &&
      result.response.choices[0].finish_reason === "tool_calls" &&
      (m.content === null || m.content === "") &&
      !String(m.content ?? "").includes('"type":"tool_call"') &&
      !String(m.content ?? "").includes(rawJson),
    "2b. gemini emulated required tool_call → message.tool_calls, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, m, finish: result.response?.choices?.[0]?.finish_reason, meta })
  );
}

// ── 3. forced function — wrong name → tool_name_not_allowed, debit=0 ─────
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
      messages: [{ role: "user", content: "weather only" }],
      tools: WEATHER_TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "get_weather" },
      },
    },
    "req_p1018_03"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.errorCode === "tool_name_not_allowed" &&
      result.httpStatus !== 200 &&
      meta.debitCallCount === 0 &&
      meta.credits_charged === 0,
    "3. forced function mismatch → tool_name_not_allowed, debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 4. auto + assistant_text ─────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("Just a normal reply"),
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "say hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1018_04"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      meta.providerCallCount === 1 &&
      m?.content === "Just a normal reply" &&
      !m?.tool_calls &&
      result.response.choices[0].finish_reason === "stop",
    "4. auto assistant_text → ordinary content, debit×1",
    meta,
    JSON.stringify({ m, meta })
  );
}

// ── 5. required but assistant_text ───────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("no tools here"),
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "must tool" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_05"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.errorCode === "required_tool_call_missing" &&
      result.httpStatus !== 200 &&
      meta.debitCallCount === 0 &&
      meta.billing_status === "not_billable",
    "5. required missing tool → required_tool_call_missing, debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 6. invalid JSON then one repair success ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.isRepair) {
          return { kind: "completion", content: "NOT_JSON{{" };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Beijing" }),
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "repair me" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_06"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 1 &&
      m?.tool_calls?.[0]?.function?.name === "get_weather",
    "6. invalid_json + one repair success — provider×2, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, m, meta })
  );
}

// ── 7. invalid JSON repair still fails — max 2 calls, debit=0 ────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "still-not-json" }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "repair fail" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_07"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.errorCode === "tool_intent_invalid_json" &&
      meta.providerCallCount === 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 0 &&
      meta.billing_status === "not_billable",
    "7. invalid_json repair fails — provider≤2, debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 8. arguments schema invalid (+ repair still bad) ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        // city required; extra prop + wrong type
        content: makeToolCallIntent("get_weather", {
          city: 123,
          nope: true,
        } as any),
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "bad args" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_08"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.errorCode === "tool_arguments_invalid" &&
      meta.providerCallCount <= 2 &&
      meta.repairCallCount <= 1 &&
      meta.debitCallCount === 0,
    "8. arguments schema invalid — repair≤1, debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── 9. parallel_tool_calls=false rejects two calls (no silent truncate) ──
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeParallelToolCallIntent(),
      }),
    ],
  });
  const result = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "two tools" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
      parallel_tool_calls: false,
    },
    "req_p1018_09"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      (result.errorCode === "tool_intent_invalid_json" ||
        result.errorCode === "tool_arguments_invalid") &&
      // Must not succeed with a single truncated tool_call
      !(result.ok === true && msg(result)?.tool_calls?.length === 1),
    "9. parallel_tool_calls=false rejects multi — not_billable",
    meta,
    JSON.stringify(result)
  );
}

// ── 10. role=tool second round ───────────────────────────────────────────
{
  let firstToolCallId = "";
  // Round 1 — gemini emulated
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Tokyo" }),
      }),
    ],
  });
  const r1 = await exec(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "weather tokyo" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_10a"
  );
  const meta1 = billingSnapshot(r1);
  firstToolCallId = msg(r1)?.tool_calls?.[0]?.id ?? "";
  const round1Ok =
    r1.ok === true &&
    meta1.debitCallCount === 1 &&
    typeof firstToolCallId === "string" &&
    firstToolCallId.startsWith("call_");

  // Round 2
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("Tokyo is sunny"),
      }),
    ],
  });
  const r2 = await exec(
    {
      model: "gemini-3-pro",
      messages: [
        { role: "user", content: "weather tokyo" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: firstToolCallId || "call_fallback",
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "Tokyo" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: firstToolCallId || "call_fallback",
          content: JSON.stringify({ temp: 26 }),
        },
      ],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1018_10b"
  );
  const meta2 = billingSnapshot(r2);
  const m2 = msg(r2);
  assert(
    round1Ok &&
      r2.ok === true &&
      meta2.debitCallCount === 1 &&
      m2?.content === "Tokyo is sunny",
    "10. role=tool second round — each request debit×1",
    {
      ...meta2,
      round1: meta1,
      firstToolCallId,
    },
    JSON.stringify({ round1Ok, r2ok: r2.ok, m2, meta1, meta2, err: r2 })
  );
}

// ── 11. auto-pro alias + provider fallback (P1020 native) ────────────────
{
  // 11a — auto-pro + required must reach provider (no early alias reject)
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) =>
        ctx.hasCompiler
          ? {
              kind: "completion",
              content: makeToolCallIntent("get_weather", { city: "Seoul" }),
            }
          : nativeToolCompletion("get_weather", { city: "Seoul" }),
    ],
  });
  const aliasResult = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "weather seoul" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_11a"
  );
  const aliasMeta = billingSnapshot(aliasResult);
  const aliasOk =
    aliasResult.ok === true &&
    aliasMeta.providerCallCount >= 1 &&
    aliasMeta.debitCallCount === 1 &&
    msg(aliasResult)?.tool_calls?.[0]?.function?.name === "get_weather";

  // 11b — concrete model: first provider fails, second decides native mode
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
            message: "busy",
          };
        }
        return nativeToolCompletion("get_weather", { city: "Seoul" }, {
          model: ctx.attemptModel ?? "gpt-5.5",
        });
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather seoul" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_11b"
  );
  const meta = billingSnapshot(result);
  const c = getCounts();
  assert(
    aliasOk &&
      result.ok === true &&
      meta.debitCallCount === 1 &&
      meta.fallbackCount >= 1 &&
      c.lastProviderIds.includes("openai-compatible-secondary") &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      (result.response?.tokfai as any)?.tool_calling_mode === "native",
    "11. auto-pro required works; gpt-5.5 provider fallback mode=native debit×1",
    {
      ...meta,
      aliasOk,
      aliasMeta,
    },
    JSON.stringify({
      aliasOk,
      alias: aliasResult,
      ok: result.ok,
      providers: c.lastProviderIds,
      tokfai: result.response?.tokfai,
      meta,
    })
  );
}

// ── 12. image model + tools — no compiler, no provider, not_billable ─────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "should never run",
      }),
    ],
  });
  const result = await exec(
    {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw + tools" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_12"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      result.httpStatus !== 200 &&
      meta.providerCallCount === 0 &&
      meta.compilerSeenCount === 0 &&
      meta.debitCallCount === 0 &&
      (result.errorCode === "image_model_not_for_chat" ||
        result.errorCode === "model_not_tool_capable" ||
        result.errorCode === "tool_emulation_unavailable"),
    "12. image model + tools — reject before provider, debit=0",
    meta,
    JSON.stringify(result)
  );
}

console.log("\n── P1019 hotfix scenarios A–G ──\n");

// ── A. auto-pro + required → tool_calls, debit×1 ─────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) =>
        ctx.hasCompiler
          ? {
              kind: "completion",
              content: makeToolCallIntent("get_weather", {
                city: "CursorCity",
              }),
            }
          : nativeToolCompletion("get_weather", { city: "CursorCity" }),
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "A required" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1019_A"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      result.errorCode !== "model_not_tool_capable" &&
      meta.providerCallCount >= 1 &&
      meta.debitCallCount === 1 &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      result.response.choices[0].finish_reason === "tool_calls",
    "A. auto-pro + required → tool_calls, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, err: (result as any).errorCode, meta, m: msg(result) })
  );
}

// ── B. auto-pro + auto + native tool_calls (no degrade) ──────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (ctx.hasCompiler) {
          return {
            kind: "completion",
            content: makeToolCallIntent("get_weather", { city: "AutoCity" }),
          };
        }
        return nativeToolCompletion("get_weather", { city: "AutoCity" });
      },
    ],
  });
  const result = await exec(
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "B auto" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1019_B"
  );
  const meta = billingSnapshot(result);
  const m = msg(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      Array.isArray(m?.tool_calls) &&
      m.tool_calls.length === 1 &&
      m.content !== "DEGRADED_PLAIN" &&
      ((result.response?.tokfai as any)?.tool_calling_mode === "native" ||
        meta.compilerSeenCount >= 1),
    "B. auto-pro + auto intent → tool_calls (not degraded)",
    meta,
    JSON.stringify({ m, meta, tokfai: result.response?.tokfai })
  );
}

// ── C. auto-pro + tools but no concrete capable → reject, debit=0 ────────
{
  __toolsCapableAttemptsTestSet(true);
  try {
    resetScenario({
      providers: defaultProviders(["grsai-primary"]),
      scripts: [
        () => ({
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "X" }),
        }),
      ],
    });
    const result = await exec(
      {
        model: "auto-pro",
        messages: [{ role: "user", content: "C none capable" }],
        tools: WEATHER_TOOLS,
        tool_choice: "required",
      },
      "req_p1019_C"
    );
    const meta = billingSnapshot(result);
    assert(
      result.ok === false &&
        result.errorCode === "model_not_tool_capable" &&
        result.httpStatus !== 200 &&
        meta.providerCallCount === 0 &&
        meta.debitCallCount === 0 &&
        meta.billing_status === "not_billable",
      "C. auto-pro + no concrete capable → model_not_tool_capable, debit=0",
      meta,
      JSON.stringify(result)
    );
  } finally {
    __toolsCapableAttemptsTestSet(null);
  }
}

// ── D. image + required tools (keep reject) ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({ kind: "completion", content: "nope" }),
    ],
  });
  const result = await exec(
    {
      model: "nano-banana",
      messages: [{ role: "user", content: "D image" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1019_D"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.providerCallCount === 0 &&
      meta.debitCallCount === 0 &&
      result.errorCode === "image_model_not_for_chat",
    "D. image + required tools → reject, debit=0",
    meta,
    JSON.stringify(result)
  );
}

// ── E. repair timeout budget shrink / exhaust ────────────────────────────
{
  const wallStart = Date.now();
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 200,
      idleTimeoutMs: 200,
      totalTimeoutMs: 200,
    },
    scripts: [
      (ctx) => {
        if (!ctx.isRepair) {
          // Consume most of the 200ms total budget before repair.
          return {
            kind: "completion",
            content: "NOT_JSON{{",
            delayMs: 120,
          };
        }
        // Repair should see a strictly smaller timeoutMs budget.
        return {
          kind: "completion",
          content: "STILL_BAD",
          delayMs: 5,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "E repair budget" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1019_E"
  );
  const meta = billingSnapshot(result);
  const c = getCounts();
  const elapsed = Date.now() - wallStart;
  const t0 = c.fetchTimeoutMs[0] ?? 0;
  const t1 = c.fetchTimeoutMs[1];
  const budgetOk =
    c.fetchTimeoutMs.length >= 1 &&
    t0 <= 200 &&
    (t1 === undefined || t1 < t0) &&
    elapsed <= 200 + 150; // totalTimeout + test tolerance
  const failOk =
    result.ok === false &&
    meta.debitCallCount === 0 &&
    meta.providerCallCount <= 2;
  assert(
    budgetOk && failOk,
    "E. repair freshRemainingTotalMs shrink; timeout/fail debit=0",
    {
      ...meta,
      fetchTimeoutMs: c.fetchTimeoutMs,
      elapsed,
      budgetOk,
    },
    JSON.stringify({
      ok: result.ok,
      code: (result as any).errorCode,
      fetchTimeoutMs: c.fetchTimeoutMs,
      elapsed,
      meta,
    })
  );
}

// ── F. repair success — provider×2 repair×1 debit×1 ──────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) =>
        ctx.isRepair
          ? {
              kind: "completion",
              content: makeToolCallIntent("get_weather", { city: "Fixed" }),
            }
          : { kind: "completion", content: "<<<" },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "F repair ok" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1019_F"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 1,
    "F. repair success — provider×2, repair×1, debit×1",
    meta,
    JSON.stringify({ ok: result.ok, meta })
  );
}

// ── G. repair still fails — provider≤2 debit=0 ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "{not-json" })],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "G repair fail" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1019_G"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.providerCallCount <= 2 &&
      meta.repairCallCount === 1 &&
      meta.debitCallCount === 0,
    "G. repair fail — provider≤2, debit=0",
    meta,
    JSON.stringify(result)
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
console.log("TOKFAI_P1019_CURSOR_TOOLS_HOTFIX_SCENARIOS_PASS");
