/**
 * P998 — Chat usage fallback unit tests (no network, no debit).
 *
 *   npx tsx scripts/p998-chat-usage-fallback-unit.mts
 *
 * Marker: TOKFAI_P998_CHAT_USAGE_FALLBACK_PASS
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P998_CHAT_USAGE_FALLBACK_PASS";
const FAIL = "TOKFAI_P998_CHAT_USAGE_FALLBACK_FAIL";

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p998-test-jwt-secret-32chars-min!!");
  set("TOKEN_PEPPER", "p998-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p998-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p998_test_only");
}

ensureDummyEnv();

const {
  coalesceUpstreamUsageTotal,
  estimateChatUsageFromPayload,
  hasBillableChatOutput,
  hasPositiveUsage,
  shouldEstimateChatUsage,
} = await import("../apps/dmit-api/src/lib/chatUsageFallback.ts");

const { priceFor } = await import("../apps/dmit-api/src/upstream/pricing.ts");

let failed = 0;

function pass(label: string) {
  console.log(`PASS  ${label}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function okResponse(content: string): Record<string, unknown> {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function toolCallResponse(): Record<string, unknown> {
  return {
    id: "chatcmpl-tools",
    object: "chat.completion",
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"Shanghai"}',
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const baseRequest: Record<string, unknown> = {
  model: "gpt-5.5",
  messages: [{ role: "user", content: "hi" }],
};

// ── 1. GRSAI + usage all-zero + output "OK" ──────────────────────────────
{
  const responseBody = okResponse("OK");
  const upstreamUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  const estimate = shouldEstimateChatUsage({
    providerId: "grsai-primary",
    usage: upstreamUsage,
    responseBody,
  });
  assert(estimate === true, "1a GRSAI zero usage + OK enables estimate");
  const usage = estimateChatUsageFromPayload({
    requestBody: baseRequest,
    responseBody,
  });
  assert(
    (usage.promptTokens ?? 0) > 0,
    "1b promptTokens > 0",
    `got ${usage.promptTokens}`
  );
  assert(
    (usage.completionTokens ?? 0) > 0,
    "1c completionTokens > 0",
    `got ${usage.completionTokens}`
  );
  assert(
    usage.totalTokens ===
      (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
    "1d totalTokens = prompt + completion",
    `got ${usage.totalTokens}`
  );
}

// ── 2. GRSAI + positive upstream usage → no estimate ─────────────────────
{
  const responseBody = okResponse("OK");
  const upstreamUsage = {
    promptTokens: 12,
    completionTokens: 4,
    totalTokens: 16,
  };
  assert(
    shouldEstimateChatUsage({
      providerId: "grsai-primary",
      usage: upstreamUsage,
      responseBody,
    }) === false,
    "2a positive upstream usage does not estimate"
  );
  assert(hasPositiveUsage(upstreamUsage) === true, "2b hasPositiveUsage true");
  const kept = coalesceUpstreamUsageTotal(upstreamUsage);
  assert(
    kept.promptTokens === 12 &&
      kept.completionTokens === 4 &&
      kept.totalTokens === 16,
    "2c upstream numbers preserved",
    JSON.stringify(kept)
  );
}

// ── 3. Non-GRSAI + usage all-zero → no local estimate ────────────────────
{
  const responseBody = okResponse("OK");
  const upstreamUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  assert(
    shouldEstimateChatUsage({
      providerId: "openai-compatible-secondary",
      usage: upstreamUsage,
      responseBody,
    }) === false,
    "3a non-GRSAI zero usage does not estimate"
  );
}

// ── 4. GRSAI + zero usage + empty choices → no estimate / no fake bill ───
{
  const responseBody: Record<string, unknown> = {
    id: "chatcmpl-empty",
    choices: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  assert(
    hasBillableChatOutput(responseBody) === false,
    "4a empty choices not billable"
  );
  assert(
    shouldEstimateChatUsage({
      providerId: "grsai-primary",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      responseBody,
    }) === false,
    "4b empty choices does not estimate"
  );
}

// ── 5. tool_calls response → completionTokens > 0 ────────────────────────
{
  const responseBody = toolCallResponse();
  assert(hasBillableChatOutput(responseBody) === true, "5a tool_calls billable");
  const usage = estimateChatUsageFromPayload({
    requestBody: {
      ...baseRequest,
      tools: [
        {
          type: "function",
          function: { name: "get_weather", parameters: {} },
        },
      ],
      tool_choice: "auto",
    },
    responseBody,
  });
  assert(
    (usage.completionTokens ?? 0) > 0,
    "5b tool_calls completionTokens > 0",
    `got ${usage.completionTokens}`
  );
}

// ── 6. Chinese content → estimate > 0 ────────────────────────────────────
{
  const responseBody = okResponse("你好，世界");
  const usage = estimateChatUsageFromPayload({
    requestBody: {
      messages: [{ role: "user", content: "请用中文回答" }],
    },
    responseBody,
  });
  assert(
    (usage.promptTokens ?? 0) > 0 && (usage.completionTokens ?? 0) > 0,
    "6 Chinese content yields positive estimate",
    JSON.stringify(usage)
  );
}

// ── 7. Longer content → monotonic increase ───────────────────────────────
{
  const short = estimateChatUsageFromPayload({
    requestBody: baseRequest,
    responseBody: okResponse("OK"),
  });
  const long = estimateChatUsageFromPayload({
    requestBody: baseRequest,
    responseBody: okResponse("OK".repeat(200)),
  });
  assert(
    (long.completionTokens ?? 0) > (short.completionTokens ?? 0),
    "7 longer completion → more tokens",
    `short=${short.completionTokens} long=${long.completionTokens}`
  );
}

// ── 8. null / arrays / multi-turn messages → no crash ────────────────────
{
  let crashed = false;
  let usage: ReturnType<typeof estimateChatUsageFromPayload> | null = null;
  try {
    usage = estimateChatUsageFromPayload({
      requestBody: {
        messages: [
          { role: "system", content: null },
          {
            role: "user",
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: null },
            ],
          },
          { role: "assistant", content: "prior" },
          { role: "user", content: "again" },
        ],
        tools: null,
        tool_choice: null,
        response_format: null,
      },
      responseBody: {
        choices: [
          {
            message: {
              role: "assistant",
              content: [{ type: "text", text: "ok" }],
              tool_calls: null,
            },
          },
        ],
      },
    });
  } catch (err) {
    crashed = true;
    fail("8 no-crash", String(err));
  }
  if (!crashed) {
    assert(
      usage != null && (usage.promptTokens ?? 0) >= 1,
      "8 null/array/multi-turn does not crash",
      JSON.stringify(usage)
    );
  }
}

// ── 9. prompt/completion positive, total=0 → trust upstream, coalesce ────
{
  const upstreamUsage = {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 0,
  };
  assert(hasPositiveUsage(upstreamUsage) === true, "9a treated as valid usage");
  assert(
    shouldEstimateChatUsage({
      providerId: "grsai-primary",
      usage: upstreamUsage,
      responseBody: okResponse("OK"),
    }) === false,
    "9b does not enable character estimate"
  );
  const coalesced = coalesceUpstreamUsageTotal(upstreamUsage);
  assert(
    coalesced.promptTokens === 10 &&
      coalesced.completionTokens === 5 &&
      coalesced.totalTokens === 15,
    "9c totalTokens coalesced to prompt+completion",
    JSON.stringify(coalesced)
  );
}

// ── 10. estimate → positive priceCreditsFor-equivalent charge ────────────
{
  const usage = estimateChatUsageFromPayload({
    requestBody: baseRequest,
    responseBody: okResponse("OK"),
  });
  // Offline path of priceCreditsFor (static catalog); no DB / no debit.
  const creditsCharged = priceFor(
    "gpt-5.5",
    usage.promptTokens ?? 0,
    usage.completionTokens ?? 0
  );
  const billing_status = creditsCharged > 0 ? "charged" : "not_billable";
  assert(creditsCharged > 0, "10a credits_charged > 0", `got ${creditsCharged}`);
  assert(
    billing_status === "charged",
    "10b billing_status charged",
    billing_status
  );
}

// ── Static source guards ─────────────────────────────────────────────────
{
  const execSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
    "utf8"
  );
  const fallbackSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/chatUsageFallback.ts"),
    "utf8"
  );
  assert(
    execSrc.includes("estimateChatUsageFromPayload"),
    "static: executeChatCompletion wires estimateChatUsageFromPayload"
  );
  assert(
    execSrc.includes("chat_usage_estimated"),
    "static: executeChatCompletion logs chat_usage_estimated"
  );
  assert(
    execSrc.includes('usageSource: "estimated"'),
    "static: usageSource estimated audit field"
  );
  assert(
    fallbackSrc.includes("UTF8_BYTES_PER_TOKEN = 3"),
    "static: UTF8_BYTES_PER_TOKEN = 3"
  );
  assert(
    !fallbackSrc.includes("process.env"),
    "static: fallback does not read process.env"
  );
  assert(
    !fallbackSrc.includes("supabase"),
    "static: fallback does not touch supabase"
  );
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
