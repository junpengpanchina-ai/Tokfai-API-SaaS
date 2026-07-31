#!/usr/bin/env node
/**
 * Smoke — /v1/chat/completions SSE finish_reason (Cherry Studio other guard).
 *
 * Confirms synthesized + LIVE curl -N streams end with:
 *   finish_reason:"stop"
 *   data: [DONE]
 * and never emit finish_reason "other".
 *
 * Does not touch /v1/responses, billing, or provider routing.
 *
 * Usage:
 *   node scripts/p990-chat-completions-sse-finish-reason-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p990-chat-completions-sse-finish-reason-smoke.mjs
 */

import { existsSync } from "node:fs";
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

/** Last non-null finish_reason in OpenAI chat.completion.chunk SSE. */
function lastFinishReason(sseText) {
  let last = null;
  for (const line of sseText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const fr = json?.choices?.[0]?.finish_reason;
      if (fr !== null && fr !== undefined) last = fr;
    } catch {
      // ignore non-JSON data lines
    }
  }
  return last;
}

function assertNoOther(sseText, label) {
  const hits = [...sseText.matchAll(/"finish_reason"\s*:\s*"other"/gi)];
  return hits.length === 0
    ? pass(`${label}: no finish_reason other`)
    : fail(`${label}: finish_reason other`, `matches=${hits.length}`);
}

function assertEndsWithStopAndDone(sseText, label) {
  let ok = true;
  const last = lastFinishReason(sseText);
  ok =
    (last === "stop" || last === "tool_calls" || last === "length" || last === "content_filter"
      ? pass
      : fail)(
      `${label}: last finish_reason is OpenAI-safe (got ${JSON.stringify(last)})`
    ) && ok;
  // Cherry / user gate: successful text streams should end stop + [DONE]
  if (last === "stop" || last === "tool_calls") {
    ok = pass(`${label}: last finish_reason=${last}`) && ok;
  }
  ok =
    (/\ndata:\s*\[DONE\]\s*$/m.test(sseText) || sseText.includes("data: [DONE]")
      ? pass
      : fail)(`${label}: contains data: [DONE]`) && ok;
  return ok;
}

let ok = true;

const distSse = join(ROOT, "apps/dmit-api/dist/lib/chatCompletionSse.js");
const distFinish = join(ROOT, "apps/dmit-api/dist/lib/openaiFinishReason.js");

if (!existsSync(distSse) || !existsSync(distFinish)) {
  ok = fail("dist present — run npm run build in apps/dmit-api") && ok;
} else {
  const { chatCompletionToSseBody } = await import(pathToFileURL(distSse).href);
  const { normalizeOpenAiFinishReasonOnSseChunk } = await import(
    pathToFileURL(distFinish).href
  );

  {
    const terminal = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [{ index: 0, delta: {}, finish_reason: "other" }],
    });
    ok =
      (terminal?.choices?.[0]?.finish_reason === "stop" ? pass : fail)(
        "wire delta{} other → stop",
        JSON.stringify(terminal?.choices?.[0]?.finish_reason)
      ) && ok;
  }

  {
    const terminalNull = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [{ index: 0, delta: {}, finish_reason: null }],
    });
    ok =
      (terminalNull?.choices?.[0]?.finish_reason === "stop" ? pass : fail)(
        "wire delta{} null → stop",
        JSON.stringify(terminalNull?.choices?.[0]?.finish_reason)
      ) && ok;
  }

  {
    const missingDelta = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [{ index: 0, finish_reason: null }],
    });
    ok =
      (missingDelta?.choices?.[0]?.finish_reason === "stop" ? pass : fail)(
        "wire missing delta + null → stop",
        JSON.stringify(missingDelta?.choices?.[0]?.finish_reason)
      ) && ok;
  }

  {
    const mid = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [
        { index: 0, delta: { content: "hi" }, finish_reason: null },
      ],
    });
    ok =
      (mid?.choices?.[0]?.finish_reason === null ? pass : fail)(
        "wire mid-stream null preserved",
        JSON.stringify(mid?.choices?.[0]?.finish_reason)
      ) && ok;
  }

  {
    const midOther = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [
        { index: 0, delta: { content: "hi" }, finish_reason: "other" },
      ],
    });
    ok =
      (midOther?.choices?.[0]?.finish_reason === "stop" ? pass : fail)(
        "wire mid-stream other → stop",
        JSON.stringify(midOther?.choices?.[0]?.finish_reason)
      ) && ok;
  }

  const sseFromOther = chatCompletionToSseBody({
    id: "chatcmpl_p990",
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
  });

  ok = assertNoOther(sseFromOther, "offline SSE from other") && ok;
  ok = assertEndsWithStopAndDone(sseFromOther, "offline SSE from other") && ok;
  ok =
    (lastFinishReason(sseFromOther) === "stop" ? pass : fail)(
      'offline last finish_reason === "stop"',
      `got ${JSON.stringify(lastFinishReason(sseFromOther))}`
    ) && ok;

  const sseFromNull = chatCompletionToSseBody({
    id: "chatcmpl_p990_null",
    object: "chat.completion",
    created: 1,
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "hello" },
        finish_reason: null,
      },
    ],
  });
  ok =
    (lastFinishReason(sseFromNull) === "stop" ? pass : fail)(
      "offline null body → last finish_reason stop",
      `got ${JSON.stringify(lastFinishReason(sseFromNull))}`
    ) && ok;
}

if (LIVE) {
  if (!API_KEY) {
    ok = fail("LIVE requires TOKFAI_API_KEY") && ok;
  } else {
    // Equivalent to: curl -N .../v1/chat/completions -d '{"stream":true,...}'
    const url = `${API_BASE}/v1/chat/completions`;
    console.log(`LIVE curl -N stream → ${url} model=${MODEL}`);
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
          messages: [{ role: "user", content: "hello" }],
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        ok = fail(`LIVE HTTP ${res.status}`, text.slice(0, 400)) && ok;
      } else {
        ok = assertNoOther(text, "LIVE curl -N") && ok;
        ok = assertEndsWithStopAndDone(text, "LIVE curl -N") && ok;
        const last = lastFinishReason(text);
        ok =
          (last === "stop" ? pass : fail)(
            'LIVE last finish_reason === "stop"',
            `got ${JSON.stringify(last)}\n${text.slice(-400)}`
          ) && ok;
      }
    } catch (err) {
      ok =
        fail(
          "LIVE fetch",
          err instanceof Error ? err.message : String(err)
        ) && ok;
    }
  }
} else {
  console.log(
    "SKIP  LIVE curl -N (set LIVE=1 TOKFAI_API_KEY=... to run against api)"
  );
}

if (ok) {
  console.log("TOKFAI_P990_CHAT_COMPLETIONS_SSE_FINISH_REASON_PASS");
  process.exit(0);
}

console.error("TOKFAI_P990_CHAT_COMPLETIONS_SSE_FINISH_REASON_FAIL");
process.exit(1);
