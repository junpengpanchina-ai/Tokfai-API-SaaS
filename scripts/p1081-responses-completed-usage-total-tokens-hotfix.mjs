#!/usr/bin/env node
/**
 * P1081 — /v1/responses response.completed usage.total_tokens wire hotfix.
 *
 * Confirms:
 * 1. usage with only input/output → total_tokens filled
 * 2. usage null/undefined → minimal usage with total_tokens
 * 3. stream SSE response.completed JSON has response.usage.total_tokens
 * 4. response.failed is not rewritten to completed
 * 5. P1080 responsesFailedSseBody still emits response.failed + [DONE]
 * 6. billing debit paths are unchanged by this normalizer (wire-only)
 *
 * Usage:
 *   node scripts/p1081-responses-completed-usage-total-tokens-hotfix.mjs
 *
 * Marker: TOKFAI_P1081_RESPONSES_COMPLETED_USAGE_TOTAL_TOKENS_HOTFIX_PASS
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1081_RESPONSES_COMPLETED_USAGE_TOTAL_TOKENS_HOTFIX_PASS";
const FAIL = "TOKFAI_P1081_RESPONSES_COMPLETED_USAGE_TOTAL_TOKENS_HOTFIX_FAIL";

// Offline import stubs (env boot); never print secrets.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function parseSseBlocks(sseText) {
  const blocks = sseText.split("\n\n").filter((b) => b.trim());
  const rows = [];
  for (const block of blocks) {
    let event = null;
    let data = null;
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const raw = line.startsWith("data: ")
          ? line.slice(6)
          : line.slice(5).trimStart();
        if (raw && raw !== "[DONE]" && raw[0] === "{") {
          try {
            data = JSON.parse(raw);
          } catch {
            data = null;
          }
        } else {
          data = raw;
        }
      }
    }
    rows.push({ event, data, block });
  }
  return rows;
}

function findCompleted(sseText) {
  const rows = parseSseBlocks(sseText);
  return rows.find(
    (r) =>
      r.event === "response.completed" ||
      (r.data &&
        typeof r.data === "object" &&
        r.data.type === "response.completed")
  );
}

let ok = true;

{
  const usageSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesUsage.ts"),
    "utf8"
  );
  ok =
    (usageSrc.includes("export function normalizeResponsesUsage") &&
    usageSrc.includes("total_tokens") &&
    !usageSrc.includes("debit_credits") &&
    !usageSrc.includes("credits_charged")
      ? pass
      : fail)("responsesUsage.ts is wire-only normalizer (no billing)") && ok;

  const sseSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesSse.ts"),
    "utf8"
  );
  ok =
    (sseSrc.includes("normalizeResponsesUsage") &&
    sseSrc.includes("responsesFailedSseBody")
      ? pass
      : fail)("responsesSse wires normalizeResponsesUsage + keeps failed helper") &&
    ok;

  const earlySrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/respondEarlySse.ts"),
    "utf8"
  );
  ok =
    (earlySrc.includes("normalizeResponsesUsage") &&
    earlySrc.includes("sanitizeResponsesCompletedForCherry")
      ? pass
      : fail)("respondEarlySse last-mile sanitizer normalizes usage") && ok;

  const transformSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesTransform.ts"),
    "utf8"
  );
  ok =
    (transformSrc.includes("normalizeResponsesUsage") ? pass : fail)(
      "responsesTransform non-stream usage uses normalizer"
    ) && ok;

  // Billing / routing / chat / agent surfaces must not import the wire helper.
  const forbiddenImporters = [
    "apps/dmit-api/src/lib/usageBilling.ts",
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "apps/dmit-api/src/lib/transparentExplicitModelGateway.ts",
  ];
  for (const rel of forbiddenImporters) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    ok =
      (!src.includes("normalizeResponsesUsage") &&
      !src.includes("responsesUsage")
        ? pass
        : fail)(`billing/routing/chat unchanged: ${rel} does not import normalizer`) &&
      ok;
  }
}

const distUsage = join(ROOT, "apps/dmit-api/dist/lib/responsesUsage.js");
const distSse = join(ROOT, "apps/dmit-api/dist/lib/responsesSse.js");
const distRespond = join(ROOT, "apps/dmit-api/dist/lib/respondEarlySse.js");
const distTransform = join(ROOT, "apps/dmit-api/dist/lib/responsesTransform.js");

if (
  !existsSync(distUsage) ||
  !existsSync(distSse) ||
  !existsSync(distRespond) ||
  !existsSync(distTransform)
) {
  ok =
    fail(
      "dist present — run npm run build in apps/dmit-api",
      "missing dist/lib/responsesUsage.js or related"
    ) && ok;
} else {
  const { normalizeResponsesUsage } = await import(
    pathToFileURL(distUsage).href
  );
  const {
    responsesToSseBody,
    responsesSseBodyAfterCreated,
    responsesFailedSseBody,
  } = await import(pathToFileURL(distSse).href);
  const { sanitizeResponsesCompletedForCherry } = await import(
    pathToFileURL(distRespond).href
  );
  const { chatCompletionResponseToResponses } = await import(
    pathToFileURL(distTransform).href
  );

  {
    const u = normalizeResponsesUsage({
      input_tokens: 12,
      output_tokens: 3,
      input_tokens_details: { cached_tokens: 1 },
    });
    ok =
      (u.input_tokens === 12 &&
      u.output_tokens === 3 &&
      u.total_tokens === 15 &&
      u.input_tokens_details?.cached_tokens === 1
        ? pass
        : fail)(
        "normalizer fills total_tokens from input+output; keeps details",
        JSON.stringify(u)
      ) && ok;
  }

  {
    const uNull = normalizeResponsesUsage(null);
    const uUndef = normalizeResponsesUsage(undefined);
    ok =
      (uNull.total_tokens === 0 &&
      uNull.input_tokens === 0 &&
      uNull.output_tokens === 0 &&
      uUndef.total_tokens === 0
        ? pass
        : fail)(
        "normalizer null/undefined → minimal usage with total_tokens",
        JSON.stringify({ uNull, uUndef })
      ) && ok;
  }

  {
    const completedResponse = {
      id: "resp_p1081",
      object: "response",
      created_at: 1_700_000_000,
      status: "completed",
      model: "gpt-5.4",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        },
      ],
      output_text: "ok",
      usage: { input_tokens: 8, output_tokens: 2 },
    };

    const rawRest = responsesSseBodyAfterCreated(completedResponse, {
      skipCreated: true,
    });
    const sse = sanitizeResponsesCompletedForCherry(rawRest);
    const completed = findCompleted(sse);
    const usage = completed?.data?.response?.usage;

    ok =
      (sse.includes("event: response.completed") &&
      typeof usage?.total_tokens === "number" &&
      usage.total_tokens === 10 &&
      usage.input_tokens === 8 &&
      usage.output_tokens === 2
        ? pass
        : fail)(
        "stream smoke: response.completed has usage.total_tokens",
        JSON.stringify(usage)
      ) && ok;

    const full = responsesToSseBody(completedResponse);
    const fullCompleted = findCompleted(full);
    ok =
      (typeof fullCompleted?.data?.response?.usage?.total_tokens === "number"
        ? pass
        : fail)(
        "responsesToSseBody completed includes total_tokens",
        JSON.stringify(fullCompleted?.data?.response?.usage)
      ) && ok;
  }

  {
    const nullUsageResponse = {
      id: "resp_p1081_null_usage",
      object: "response",
      created_at: 1,
      status: "completed",
      model: "gpt-5.4",
      output_text: "x",
      usage: null,
    };
    const sse = sanitizeResponsesCompletedForCherry(
      responsesToSseBody(nullUsageResponse)
    );
    const usage = findCompleted(sse)?.data?.response?.usage;
    ok =
      (typeof usage?.total_tokens === "number" &&
      typeof usage?.input_tokens === "number" &&
      typeof usage?.output_tokens === "number"
        ? pass
        : fail)(
        "null usage → completed still has total_tokens",
        JSON.stringify(usage)
      ) && ok;
  }

  {
    const failedSse = [
      "event: response.failed",
      `data: ${JSON.stringify({
        type: "response.failed",
        response: { id: "resp_p1081_failed", status: "failed" },
      })}`,
      "",
    ].join("\n");
    const failedOut = sanitizeResponsesCompletedForCherry(failedSse);
    ok =
      (failedOut === failedSse &&
      !failedOut.includes("response.completed") &&
      failedOut.includes("response.failed")
        ? pass
        : fail)("response.failed unchanged (not rewritten to completed)") && ok;
  }

  {
    const failedBody = responsesFailedSseBody({
      requestId: "resp_p1081_q",
      message: "queue full",
      code: "server_busy",
    });
    ok =
      (failedBody.includes("event: response.failed") &&
      failedBody.includes("data: [DONE]") &&
      !failedBody.includes("response.completed")
        ? pass
        : fail)("P1080 response.failed + [DONE] preserved") && ok;
  }

  {
    const chatLike = {
      id: "chatcmpl_p1081",
      object: "chat.completion",
      created: 1,
      model: "gpt-5.4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: "stop",
        },
      ],
      // Missing total_tokens on chat usage — wire must still compute it.
      usage: { prompt_tokens: 4, completion_tokens: 6 },
      credits_charged: 42,
      request_id: "req_p1081",
      tokfai: {
        request_id: "req_p1081",
        credits_charged: 42,
        billing_status: "charged",
      },
    };
    const shaped = chatCompletionResponseToResponses(chatLike, "req_p1081");
    ok =
      (shaped.usage?.total_tokens === 10 &&
      shaped.credits_charged === 42 &&
      shaped.tokfai?.credits_charged === 42
        ? pass
        : fail)(
        "non-stream transform: total_tokens filled; credits_charged unchanged",
        JSON.stringify({
          usage: shaped.usage,
          credits_charged: shaped.credits_charged,
          tokfai: shaped.tokfai,
        })
      ) && ok;
  }
}

if (ok) {
  console.log(PASS);
  process.exit(0);
}

console.error(FAIL);
process.exit(1);
