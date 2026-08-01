#!/usr/bin/env node
/**
 * Smoke — /v1/responses SSE response.completed finish_reason (Cherry Studio).
 *
 * Confirms early-SSE rest path sanitizer emits:
 *   event: response.completed
 *   response.status === "completed"
 *   response.finish_reason === "stop"
 *   top-level finish_reason === "stop"
 *   incomplete_details === null
 * and never emits finish_reason "other" on completed streams.
 *
 * Does not touch /v1/chat/completions normalize, billing, or routing.
 *
 * Usage:
 *   node scripts/p991-responses-sse-cherry-smoke.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// respondEarlySse → executeChatCompletion → env (boot validation).
// Stub only for offline import; never print secrets.
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

/** Parse SSE blocks into { event, data } rows. */
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

let ok = true;

{
  const src = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/respondEarlySse.ts"),
    "utf8"
  );
  const wired =
    src.includes("sanitizeResponsesCompletedForCherry") &&
    src.includes("writeResponsesRest") &&
    /writeResponsesRest[\s\S]*sanitizeResponsesCompletedForCherry\(raw\)/.test(
      src
    );
  ok =
    (wired ? pass : fail)(
      "writeResponsesRest wires sanitizeResponsesCompletedForCherry"
    ) && ok;
}

const distRespond = join(ROOT, "apps/dmit-api/dist/lib/respondEarlySse.js");
const distResponsesSse = join(ROOT, "apps/dmit-api/dist/lib/responsesSse.js");

if (!existsSync(distRespond) || !existsSync(distResponsesSse)) {
  ok =
    fail(
      "dist present — run npm run build in apps/dmit-api",
      `missing ${!existsSync(distRespond) ? distRespond : distResponsesSse}`
    ) && ok;
} else {
  const { sanitizeResponsesCompletedForCherry } = await import(
    pathToFileURL(distRespond).href
  );
  const { responsesToSseBody, responsesSseBodyAfterCreated } = await import(
    pathToFileURL(distResponsesSse).href
  );

  const completedResponse = {
    id: "resp_p991_completed",
    object: "response",
    created_at: 1_700_000_000,
    status: "completed",
    model: "gpt-5.5",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hello p991" }],
      },
    ],
    output_text: "hello p991",
    usage: { input_tokens: 3, output_tokens: 2 },
  };

  // Mirror writeResponsesRest: after-created body → Cherry sanitizer.
  const rawRest = responsesSseBodyAfterCreated(completedResponse, {
    skipCreated: true,
  });
  const sse = sanitizeResponsesCompletedForCherry(rawRest);

  ok =
    (sse.includes("event: response.completed") ? pass : fail)(
      "SSE contains event: response.completed"
    ) && ok;

  const rows = parseSseBlocks(sse);
  const completed = rows.find(
    (r) =>
      r.event === "response.completed" ||
      (r.data && typeof r.data === "object" && r.data.type === "response.completed")
  );

  if (!completed || !completed.data || typeof completed.data !== "object") {
    ok = fail("response.completed data payload present") && ok;
  } else {
    const payload = completed.data;
    const response = payload.response;

    ok =
      (response?.status === "completed" ? pass : fail)(
        'response.completed response.status === "completed"',
        JSON.stringify(response?.status)
      ) && ok;

    ok =
      (response?.finish_reason === "stop" ? pass : fail)(
        'response.completed response.finish_reason === "stop"',
        JSON.stringify(response?.finish_reason)
      ) && ok;

    ok =
      (payload.finish_reason === "stop" ? pass : fail)(
        'response.completed top-level finish_reason === "stop"',
        JSON.stringify(payload.finish_reason)
      ) && ok;

    ok =
      (response?.incomplete_details === null ? pass : fail)(
        "response.completed incomplete_details === null",
        JSON.stringify(response?.incomplete_details)
      ) && ok;
  }

  // Mid-stream deltas must not gain finish_reason from the sanitizer.
  const deltaRows = rows.filter(
    (r) =>
      r.event === "response.output_text.delta" ||
      (r.data &&
        typeof r.data === "object" &&
        r.data.type === "response.output_text.delta")
  );
  const deltaWithFr = deltaRows.filter(
    (r) =>
      r.data &&
      typeof r.data === "object" &&
      Object.prototype.hasOwnProperty.call(r.data, "finish_reason")
  );
  ok =
    (deltaWithFr.length === 0 ? pass : fail)(
      "mid-stream output_text.delta has no finish_reason",
      `count=${deltaWithFr.length}`
    ) && ok;

  const addedRows = rows.filter(
    (r) =>
      r.event === "response.output_item.added" ||
      (r.data &&
        typeof r.data === "object" &&
        r.data.type === "response.output_item.added")
  );
  const addedWithFr = addedRows.filter(
    (r) =>
      r.data &&
      typeof r.data === "object" &&
      Object.prototype.hasOwnProperty.call(r.data, "finish_reason")
  );
  ok =
    (addedWithFr.length === 0 ? pass : fail)(
      "mid-stream output_item.added has no finish_reason",
      `count=${addedWithFr.length}`
    ) && ok;

  const otherHits = [...sse.matchAll(/"finish_reason"\s*:\s*"other"/gi)];
  ok =
    (otherHits.length === 0 ? pass : fail)(
      'no finish_reason:"other" in sanitized SSE',
      `matches=${otherHits.length}`
    ) && ok;

  // Full-body path (responsesToSseBody) + sanitizer also gets stop signal.
  const full = sanitizeResponsesCompletedForCherry(
    responsesToSseBody(completedResponse)
  );
  ok =
    (/"finish_reason"\s*:\s*"stop"/i.test(full) ? pass : fail)(
      "full responsesToSseBody + sanitize has finish_reason stop"
    ) && ok;

  // incomplete must not be rewritten to stop.
  const incompleteSse = [
    "event: response.incomplete",
    `data: ${JSON.stringify({
      type: "response.incomplete",
      response: {
        id: "resp_p991_incomplete",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        finish_reason: "length",
      },
    })}`,
    "",
  ].join("\n");
  const incompleteOut = sanitizeResponsesCompletedForCherry(incompleteSse);
  ok =
    (incompleteOut === incompleteSse ? pass : fail)(
      "response.incomplete left untouched (not forced to stop)"
    ) && ok;

  // failed must not be rewritten to stop.
  const failedSse = [
    "event: response.failed",
    `data: ${JSON.stringify({
      type: "response.failed",
      response: { id: "resp_p991_failed", status: "failed" },
    })}`,
    "",
  ].join("\n");
  const failedOut = sanitizeResponsesCompletedForCherry(failedSse);
  ok =
    (failedOut === failedSse ? pass : fail)(
      "response.failed left untouched (not disguised as success)"
    ) && ok;

  // Sanitizer fills missing incomplete_details on completed.
  const missingDetails = [
    "event: response.completed",
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        id: "resp_p991_nodetails",
        status: "completed",
        model: "gpt-5.5",
      },
    })}`,
    "",
  ].join("\n");
  const filled = sanitizeResponsesCompletedForCherry(missingDetails);
  const filledRows = parseSseBlocks(filled);
  const filledCompleted = filledRows.find(
    (r) => r.event === "response.completed"
  );
  ok =
    (filledCompleted?.data?.response?.incomplete_details === null &&
    filledCompleted?.data?.response?.finish_reason === "stop" &&
    filledCompleted?.data?.finish_reason === "stop"
      ? pass
      : fail)(
      "completed missing incomplete_details → null + finish_reason stop",
      JSON.stringify(filledCompleted?.data)
    ) && ok;
}

if (ok) {
  console.log("TOKFAI_P991_RESPONSES_SSE_CHERRY_PASS");
  process.exit(0);
}

console.error("TOKFAI_P991_RESPONSES_SSE_CHERRY_FAIL");
process.exit(1);
