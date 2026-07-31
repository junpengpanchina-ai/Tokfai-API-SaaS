#!/usr/bin/env node
/**
 * Offline (+ optional LIVE) smoke — /v1/responses finish_reason normalize.
 *
 * Cherry Studio / AI SDK default finishReason to "other" until a valid
 * response.completed chunk (with usage) is parsed. Guard that responses SSE
 * never emits finish_reason "other" and includes usage on the finished event.
 *
 * Usage:
 *   node scripts/p989-responses-finish-reason-normalize-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p989-responses-finish-reason-normalize-smoke.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.env.LIVE === "1";
const API_BASE = (process.env.TOKFAI_API_BASE || "https://api.tokfai.com").replace(
  /\/$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY || "";
const MODEL = process.env.MODEL || "gpt-5.5";

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

let ok = true;

{
  const sseTs = read("apps/dmit-api/src/lib/responsesSse.ts");
  const transformTs = read("apps/dmit-api/src/lib/responsesTransform.ts");
  const finishTs = read("apps/dmit-api/src/lib/openaiFinishReason.ts");

  const checks = [
    [
      "responsesSse includes usage on finished event",
      sseTs.includes("extractResponsesUsage") &&
        sseTs.includes("usage,") &&
        sseTs.includes("AI SDK requires"),
    ],
    [
      "responsesSse wire-normalizes via OnResponsesSsePayload",
      sseTs.includes("normalizeOpenAiFinishReasonOnResponsesSsePayload"),
    ],
    [
      "responsesSse sets finish_reason on finished response",
      sseTs.includes("finish_reason: finishReason"),
    ],
    [
      "responsesTransform sets finish_reason + incomplete_details",
      transformTs.includes("finish_reason: finishReason") &&
        transformTs.includes("incomplete_details"),
    ],
    [
      "openaiFinishReason has Responses helpers",
      finishTs.includes("normalizeOpenAiFinishReasonOnResponsesPayload") &&
        finishTs.includes("normalizeResponsesIncompleteDetails"),
    ],
  ];

  for (const [label, cond] of checks) {
    ok = (cond ? pass : fail)(label) && ok;
  }
}

const distSse = join(ROOT, "apps/dmit-api/dist/lib/responsesSse.js");
const distFinish = join(ROOT, "apps/dmit-api/dist/lib/openaiFinishReason.js");
const distTransform = join(
  ROOT,
  "apps/dmit-api/dist/lib/responsesTransform.js"
);

if (
  !existsSync(distSse) ||
  !existsSync(distFinish) ||
  !existsSync(distTransform)
) {
  ok =
    fail(
      "dist modules present (run npm run build in apps/dmit-api)",
      "missing dist"
    ) && ok;
} else {
  const { responsesToSseBody } = await import(pathToFileURL(distSse).href);
  const { chatCompletionResponseToResponses } = await import(
    pathToFileURL(distTransform).href
  );
  const {
    normalizeOpenAiFinishReasonOnResponsesPayload,
    normalizeResponsesIncompleteDetails,
  } = await import(pathToFileURL(distFinish).href);

  {
    const normalized = normalizeOpenAiFinishReasonOnResponsesPayload({
      object: "response",
      finish_reason: "other",
      incomplete_details: { reason: "other" },
    });
    ok =
      (normalized.finish_reason === "stop" ? pass : fail)(
        "responses payload finish_reason other → stop",
        `got ${JSON.stringify(normalized.finish_reason)}`
      ) && ok;
    ok =
      (normalized.incomplete_details === null ? pass : fail)(
        "responses incomplete_details other → null",
        `got ${JSON.stringify(normalized.incomplete_details)}`
      ) && ok;
  }

  {
    const details = normalizeResponsesIncompleteDetails({
      reason: "stop",
    });
    ok =
      (details === null ? pass : fail)(
        "incomplete_details.reason stop → null (AI SDK other guard)",
        `got ${JSON.stringify(details)}`
      ) && ok;
  }

  const chatLike = {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1,
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "hello" },
        finish_reason: "other",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    credits_charged: 0,
    request_id: "req_test",
    tokfai: {
      request_id: "req_test",
      credits_charged: 0,
      billing_status: "not_billable",
    },
  };

  const responsesBody = chatCompletionResponseToResponses(chatLike, "req_test");
  ok =
    (responsesBody.finish_reason === "stop" ? pass : fail)(
      "transform finish_reason other → stop",
      `got ${JSON.stringify(responsesBody.finish_reason)}`
    ) && ok;
  ok =
    (responsesBody.incomplete_details === null ? pass : fail)(
      "transform incomplete_details null on stop",
      `got ${JSON.stringify(responsesBody.incomplete_details)}`
    ) && ok;
  ok =
    (typeof responsesBody.usage?.input_tokens === "number" ? pass : fail)(
      "transform includes usage.input_tokens",
      `got ${JSON.stringify(responsesBody.usage)}`
    ) && ok;

  const sse = responsesToSseBody(responsesBody);
  const otherHits = [...sse.matchAll(/"finish_reason"\s*:\s*"other"/gi)];
  ok =
    (otherHits.length === 0 ? pass : fail)(
      "responses SSE never emits finish_reason other",
      otherHits.length ? `matches=${otherHits.length}` : undefined
    ) && ok;

  const incompleteOther = [
    ...sse.matchAll(/"incomplete_details"\s*:\s*\{[^}]*"reason"\s*:\s*"other"/gi),
  ];
  ok =
    (incompleteOther.length === 0 ? pass : fail)(
      "responses SSE never emits incomplete_details.reason other",
      incompleteOther.length ? `matches=${incompleteOther.length}` : undefined
    ) && ok;

  ok =
    (sse.includes('"type":"response.completed"') ||
    sse.includes('"type":"response.incomplete"')
      ? pass
      : fail)("responses SSE emits finished event") && ok;

  ok =
    (/response\.(completed|incomplete)[\s\S]*?"usage"\s*:\s*\{/.test(sse)
      ? pass
      : fail)(
      "finished event includes usage (AI SDK schema)",
      sse.slice(0, 500)
    ) && ok;

  ok =
    (sse.includes('"finish_reason":"stop"') ? pass : fail)(
      "responses SSE emits finish_reason stop",
      sse.match(/"finish_reason"\s*:\s*"[^"]+"/g)?.join(", ")
    ) && ok;

  ok =
    (sse.includes("data: [DONE]") ? pass : fail)("responses SSE ends with [DONE]") &&
    ok;
}

if (LIVE) {
  if (!API_KEY) {
    ok = fail("LIVE requires TOKFAI_API_KEY") && ok;
  } else {
    const url = `${API_BASE}/v1/responses`;
    console.log(`LIVE curl stream → ${url} model=${MODEL}`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          input: "hello",
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        ok =
          fail(`LIVE responses stream HTTP ${res.status}`, text.slice(0, 400)) &&
          ok;
      } else {
        const otherHits = [
          ...text.matchAll(/"finish_reason"\s*:\s*"other"/gi),
        ];
        ok =
          (otherHits.length === 0 ? pass : fail)(
            "LIVE responses stream finish_reason never other",
            otherHits.length
              ? `matches=${otherHits.length}\n${text.slice(0, 800)}`
              : undefined
          ) && ok;
        ok =
          (/response\.(completed|incomplete)/.test(text) ? pass : fail)(
            "LIVE responses stream has finished event",
            text.slice(0, 400)
          ) && ok;
      }
    } catch (err) {
      ok =
        fail(
          "LIVE responses stream fetch",
          err instanceof Error ? err.message : String(err)
        ) && ok;
    }
  }
} else {
  console.log("SKIP  LIVE responses stream (set LIVE=1 TOKFAI_API_KEY=...)");
}

if (ok) {
  console.log("TOKFAI_P989_RESPONSES_FINISH_REASON_NORMALIZE_PASS");
  process.exit(0);
}

console.error("TOKFAI_P989_RESPONSES_FINISH_REASON_NORMALIZE_FAIL");
process.exit(1);
