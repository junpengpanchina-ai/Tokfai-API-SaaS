/**
 * P1030 — AUTO arbitration commercial usage aggregation.
 *
 * Proves native + arbitration upstream costs are summed into one atomic debit
 * without a second debit RPC, and that restore-native no longer bills only
 * arbitration usage while returning native text.
 *
 * Authenticity:
 *   REAL executeChatCompletion ENTRY
 *   REAL billing aggregation helper (billableUsageAggregation.ts)
 *   REAL compiler/parser
 *   MOCK PROVIDER
 *   MOCK/SPY billing RPC (not a real DB debit)
 *   非 LIVE GRSAI
 *   非 LIVE Cursor
 *   非真实 DB debit
 *
 *   npx tsx scripts/p1030-auto-arbitration-commercial-usage.mts
 *
 * Marker: TOKFAI_P1030_COMMERCIAL_USAGE_AGGREGATION_PASS
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
  makeToolCallIntent,
  nativeToolCompletion,
  resetScenario,
  type AssertMeta,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const {
  mergeNormalizedUsages,
  cloneNormalizedUsage,
} = await import("../apps/dmit-api/src/lib/billableUsageAggregation.ts");
const { priceCreditsFor } = await import(
  "../apps/dmit-api/src/catalog/modelCatalog.ts"
);

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  createUpstreamToolCallIdNormalizer,
  isUpstreamSafeToolCallId,
  UPSTREAM_TOOL_CALL_ID_MAX_LEN,
} = await import("../apps/dmit-api/src/lib/upstreamToolCallId.ts");

const PASS = "TOKFAI_P1030_COMMERCIAL_USAGE_AGGREGATION_PASS";
const FAIL = "TOKFAI_P1030_COMMERCIAL_USAGE_AGGREGATION_BLOCKED";

const LEVEL =
  "REAL executeChatCompletion ENTRY + REAL billing aggregation helper + REAL compiler/parser + MOCK PROVIDER + MOCK/SPY billing RPC (非 LIVE Cursor / 非 LIVE GRSAI / 非真实 DB debit)";

/** Distinct usages — identical values would hide underbilling. */
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
const EXPECT_MERGED = {
  prompt_tokens: 114,
  completion_tokens: 10,
  total_tokens: 124,
};

const LONG_ID_86 =
  "call_cursor_tool_" + "x".repeat(86 - "call_cursor_tool_".length);

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
    limitKey: "p1030",
    clientStream,
  });
}

function roundCreditAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * 1_000_000) / 1_000_000;
}

async function expectedCredits(
  prompt: number,
  completion: number
): Promise<number> {
  const raw = await priceCreditsFor("gpt-5.5", prompt, completion, CALLER.tenantId);
  return roundCreditAmount(raw);
}

function debitTokens() {
  const e = getCounts().lastDebitEntry;
  return {
    prompt_tokens: Number(e?.prompt_tokens ?? NaN),
    completion_tokens: Number(e?.completion_tokens ?? NaN),
    total_tokens: Number(e?.total_tokens ?? NaN),
    credits_charged: Number(e?.credits_charged ?? NaN),
  };
}

function near(a: number, b: number, eps = 1e-9) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}

console.log("P1030 AUTO ARBITRATION COMMERCIAL USAGE AGGREGATION\n");
console.log(`Authenticity: ${LEVEL}\n`);

// Unit: merge helper
{
  const merged = mergeNormalizedUsages([
    {
      promptTokens: NATIVE_USAGE.prompt_tokens,
      completionTokens: NATIVE_USAGE.completion_tokens,
      totalTokens: NATIVE_USAGE.total_tokens,
    },
    {
      promptTokens: ARB_USAGE.prompt_tokens,
      completionTokens: ARB_USAGE.completion_tokens,
      totalTokens: ARB_USAGE.total_tokens,
    },
  ]);
  const cloned = cloneNormalizedUsage(merged);
  cloned.promptTokens = 0;
  assert(
    merged.promptTokens === EXPECT_MERGED.prompt_tokens &&
      merged.completionTokens === EXPECT_MERGED.completion_tokens &&
      merged.totalTokens === EXPECT_MERGED.total_tokens &&
      mergeNormalizedUsages([]).promptTokens === null &&
      // clone must not share refs that mutate source
      merged.promptTokens === EXPECT_MERGED.prompt_tokens,
    "0. mergeNormalizedUsages pure helper",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      level: "UNIT (no network)",
      merged,
    }
  );
}

const nativeCredits = await expectedCredits(
  NATIVE_USAGE.prompt_tokens,
  NATIVE_USAGE.completion_tokens
);
const arbCredits = await expectedCredits(
  ARB_USAGE.prompt_tokens,
  ARB_USAGE.completion_tokens
);
const sumCredits = roundCreditAmount(nativeCredits + arbCredits);

// ── A. Native direct tool_calls ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        ...nativeToolCompletion("get_weather", { city: "Direct" }),
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_a"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      tok.completion_tokens === NATIVE_USAGE.completion_tokens &&
      near(tok.credits_charged, nativeCredits) &&
      near(meta.credits_charged ?? NaN, nativeCredits),
    "A. native direct tool_calls — component=1 debit=1 native-only credits",
    { ...meta, debitTokens: tok, nativeCredits, components: 1 }
  );
}

// ── B. Native text → arbitration tool_calls ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "should call tool",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "Arb" }),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_b"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      (meta.arbitrationCallCount ?? 0) === 1 &&
      meta.debitCallCount === 1 &&
      Array.isArray(msg(result)?.tool_calls) &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      tok.completion_tokens === EXPECT_MERGED.completion_tokens &&
      tok.total_tokens === EXPECT_MERGED.total_tokens &&
      near(tok.credits_charged, sumCredits) &&
      !near(tok.credits_charged, arbCredits) &&
      !near(tok.credits_charged, nativeCredits) &&
      sumCredits > arbCredits &&
      sumCredits > nativeCredits,
    "B. native→arb tool_calls — component=2 debit=1 credits=native+arb",
    {
      ...meta,
      debitTokens: tok,
      nativeCredits,
      arbCredits,
      sumCredits,
      components: 2,
    }
  );
}

// ── C. Native text → arbitration assistant_text ──────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "plain first",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeAssistantTextIntent("final assistant"),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_c"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      meta.providerCallCount === 2 &&
      meta.debitCallCount === 1 &&
      msg(result)?.content === "final assistant" &&
      !Array.isArray(msg(result)?.tool_calls) &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      near(tok.credits_charged, sumCredits),
    "C. native→arb assistant_text — aggregate charge",
    { ...meta, debitTokens: tok, sumCredits, components: 2 }
  );
}

// ── D. invalid JSON → restore Native ─────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "ORIGINAL_NATIVE_TEXT",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: "NOT_VALID_JSON{{{",
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_d"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  const publicUsage = result?.response?.usage;
  assert(
    result.ok === true &&
      msg(result)?.content === "ORIGINAL_NATIVE_TEXT" &&
      !Array.isArray(msg(result)?.tool_calls) &&
      meta.providerCallCount === 2 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      near(tok.credits_charged, sumCredits) &&
      !near(tok.credits_charged, arbCredits) &&
      // public usage follows restored native (not arb-only billing)
      Number(publicUsage?.prompt_tokens) === NATIVE_USAGE.prompt_tokens &&
      Number(publicUsage?.completion_tokens) === NATIVE_USAGE.completion_tokens,
    "D. invalid JSON restore — aggregate debit; public usage=native",
    {
      ...meta,
      debitTokens: tok,
      publicUsage,
      sumCredits,
      components: 2,
    }
  );
}

// ── E. unknown tool → restore ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "keep me",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("not_a_real_tool", { x: 1 }),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_e"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "keep me" &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      near(tok.credits_charged, sumCredits),
    "E. unknown tool restore — aggregate charge",
    { ...meta, debitTokens: tok, components: 2 }
  );
}

// ── F. schema invalid → restore ──────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "schema keep",
            usage: NATIVE_USAGE,
          };
        }
        // city must be string; pass number to fail schema
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: 123 as any }),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_f"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "schema keep" &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      near(tok.credits_charged, sumCredits),
    "F. schema invalid restore — aggregate charge",
    { ...meta, debitTokens: tok, components: 2 }
  );
}

// ── G. arbitration transport failure, no usage ───────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "TRANSPORT_FALLBACK",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "error",
          code: "upstream_error",
          status: 502,
          message: "arb transport failed",
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_g"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      msg(result)?.content === "TRANSPORT_FALLBACK" &&
      meta.providerCallCount === 2 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      tok.completion_tokens === NATIVE_USAGE.completion_tokens &&
      near(tok.credits_charged, nativeCredits),
    "G. arb transport failure — component=1 native-only debit",
    { ...meta, debitTokens: tok, components: 1 }
  );
}

// ── H. arbitration timeout, remaining > 0 ────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
    },
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "TIMEOUT_FALLBACK_TEXT",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "error",
          code: "upstream_timeout",
          status: 504,
          message: "arbitration timed out",
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "timeout arb" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_h"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  const timeouts = getCounts().fetchTimeoutMs;
  assert(
    result.ok === true &&
      msg(result)?.content === "TIMEOUT_FALLBACK_TEXT" &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      near(tok.credits_charged, nativeCredits) &&
      timeouts.every((t) => t > 0 && t <= 30_000),
    "H. arb timeout remaining>0 — native-only debit; no budget resurrection",
    { ...meta, debitTokens: tok, fetchTimeoutMs: timeouts, components: 1 }
  );
}

// ── I. total wall-clock exhausted — non-200, debit=0 ─────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    timeoutPolicy: {
      upstreamTimeoutMs: 5_000,
      idleTimeoutMs: 5_000,
      totalTimeoutMs: 80,
    },
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "will timeout after",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "error",
          code: "upstream_timeout",
          status: 504,
          message: "arb after budget",
          delayMs: 120,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "total timeout" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_i"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false &&
      meta.debitCallCount === 0 &&
      (meta.credits_charged === 0 || meta.credits_charged == null),
    "I. total wall-clock exhausted — non-200 debit=0",
    { ...meta, components: 0 }
  );
}

// ── J. required failure — no text fallback, debit=0 ──────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "plain pretending",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: "STILL_NOT_JSON",
          usage: ARB_USAGE,
        };
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
    "req_p1030_j"
  );
  const meta = billingSnapshot(result);
  assert(
    result.ok === false && meta.debitCallCount === 0,
    "J. required failure — no text fallback, debit=0",
    { ...meta }
  );
}

// ── K. forced object P1024 — no AUTO arbitration ─────────────────────────
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
        return {
          ...nativeToolCompletion("get_weather", { city: "Forced" }),
          usage: NATIVE_USAGE,
        };
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
    "req_p1030_k"
  );
  const meta = billingSnapshot(result);
  const out = getCounts().outboundBodies[0];
  const tok = debitTokens();
  assert(
    result.ok === true &&
      out?.tool_choice === "required" &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      near(tok.credits_charged, nativeCredits),
    "K. forced object P1024 — no AUTO arbitration; native-only",
    { ...meta, debitTokens: tok, outbound: out }
  );
}

// ── L. P1027 call_id mapping preserved ───────────────────────────────────
{
  const normalize = createUpstreamToolCallIdNormalizer();
  const a = normalize(LONG_ID_86);
  assert(
    LONG_ID_86.length === 86 &&
      isUpstreamSafeToolCallId(a) &&
      a.length <= UPSTREAM_TOOL_CALL_ID_MAX_LEN,
    "L. P1027 call_id unit map intact",
    {
      providerCallCount: 0,
      repairCallCount: 0,
      fallbackCount: 0,
      debitCallCount: 0,
      mappedLen: a.length,
      level: "UNIT upstreamToolCallId",
    }
  );
}

// ── M. provider fallback — scope not polluted ────────────────────────────
{
  resetScenario({
    providers: defaultProviders([
      "grsai-primary",
      "openai-compatible-secondary",
    ]),
    scripts: [
      () => ({
        kind: "error",
        code: "upstream_model_busy",
        status: 503,
        message: "busy",
      }),
      (ctx) => {
        if (!ctx.hasCompiler) {
          return {
            kind: "completion",
            content: "secondary miss",
            usage: NATIVE_USAGE,
          };
        }
        return {
          kind: "completion",
          content: makeToolCallIntent("get_weather", { city: "FB" }),
          usage: ARB_USAGE,
        };
      },
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "fallback" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1030_m"
  );
  const meta = billingSnapshot(result);
  const tok = debitTokens();
  assert(
    result.ok === true &&
      meta.fallbackCount >= 1 &&
      meta.debitCallCount === 1 &&
      msg(result)?.tool_calls?.[0]?.function?.name === "get_weather" &&
      tok.prompt_tokens === EXPECT_MERGED.prompt_tokens &&
      near(tok.credits_charged, sumCredits),
    "M. provider fallback success — only final provider components; debit=1",
    { ...meta, debitTokens: tok, components: 2 }
  );
}

// ── N. role=tool second round — no cross-request residue ─────────────────
// P1033 — resumeToolRound must NOT run first-turn AUTO arbitration, so round-2
// bills a single native component (NATIVE_USAGE), not native+arb merge.
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
    "req_p1030_n1"
  );
  const id = msg(r1)?.tool_calls?.[0]?.id ?? "call_x";
  const tok1 = debitTokens();

  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "done after tool",
        usage: NATIVE_USAGE,
      }),
      // Must not be consumed — arbitration is forbidden on resumeToolRound.
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("arb should not run"),
        usage: ARB_USAGE,
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
    "req_p1030_n2"
  );
  const tok2 = debitTokens();
  const meta2 = billingSnapshot(r2);
  assert(
    r1.ok === true &&
      tok1.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      r2.ok === true &&
      meta2.debitCallCount === 1 &&
      (meta2.arbitrationCallCount ?? 0) === 0 &&
      msg(r2)?.content === "done after tool" &&
      tok2.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      near(tok2.credits_charged, nativeCredits),
    "N. role=tool second round — per-request components; no residue",
    {
      ...meta2,
      round1_tokens: tok1,
      round2_tokens: tok2,
      tool_call_id: id,
    }
  );
}

// ── O. plain chat single-component unchanged ─────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "hello chat",
        usage: NATIVE_USAGE,
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    "req_p1030_o"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.providerCallCount === 1 &&
      (meta.arbitrationCallCount ?? 0) === 0 &&
      meta.debitCallCount === 1 &&
      tok.prompt_tokens === NATIVE_USAGE.prompt_tokens &&
      near(tok.credits_charged, nativeCredits) &&
      near(meta.credits_charged ?? NaN, nativeCredits),
    "O. plain chat — single-component credits unchanged vs native-only",
    { ...meta, debitTokens: tok, nativeCredits }
  );
}

// ── P. usage missing → estimate fallback; no NaN / double estimate ───────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: "estimate me please",
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      }),
    ],
  });
  const result = await exec(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "estimate" }],
    },
    "req_p1030_p"
  );
  const tok = debitTokens();
  const meta = billingSnapshot(result);
  assert(
    result.ok === true &&
      meta.debitCallCount === 1 &&
      Number.isFinite(tok.prompt_tokens) &&
      tok.prompt_tokens > 0 &&
      Number.isFinite(tok.completion_tokens) &&
      tok.completion_tokens > 0 &&
      Number.isFinite(tok.credits_charged) &&
      tok.credits_charged >= 0 &&
      !Number.isNaN(tok.credits_charged),
    "P. missing/zero usage — estimate fallback; no NaN; single debit",
    { ...meta, debitTokens: tok }
  );
}

console.log("\n── provider / component / debit / credits matrix ──");
console.log(
  JSON.stringify(
    {
      A_native_hit: { provider: 1, components: 1, debit: 1 },
      B_arb_tool: { provider: 2, components: 2, debit: 1, credits: "native+arb" },
      C_arb_text: { provider: 2, components: 2, debit: 1 },
      D_invalid_restore: { provider: 2, components: 2, debit: 1 },
      E_unknown_restore: { provider: 2, components: 2, debit: 1 },
      F_schema_restore: { provider: 2, components: 2, debit: 1 },
      G_transport: { provider: 2, components: 1, debit: 1 },
      H_timeout: { provider: 2, components: 1, debit: 1 },
      I_total_timeout: { debit: 0 },
      J_required: { debit: 0 },
      K_forced: { provider: 1, components: 1, debit: 1 },
      M_fallback: { components: 2, debit: 1 },
      N_tool_round: { per_request: true },
      O_plain: { provider: 1, components: 1, debit: 1 },
      P_estimate: { debit: 1 },
      nativeCredits,
      arbCredits,
      sumCredits,
      expectMerged: EXPECT_MERGED,
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
