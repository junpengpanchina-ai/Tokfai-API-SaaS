#!/usr/bin/env node
/**
 * Offline (+ optional LIVE) smoke — OpenAI finish_reason normalize.
 *
 * Ensures wire responses never emit finish_reason "other" / "unknown"
 * (Cherry Studio AI_FinishReasonError).
 *
 * Usage:
 *   node scripts/p988-finish-reason-normalize-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p988-finish-reason-normalize-smoke.mjs
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
  const finishTs = read("apps/dmit-api/src/lib/openaiFinishReason.ts");
  const execTs = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const sseTs = read("apps/dmit-api/src/lib/chatCompletionSse.ts");

  const checks = [
    [
      "openaiFinishReason module maps other/unknown → stop",
      finishTs.includes('lower === "other"') &&
        finishTs.includes('lower === "unknown"') &&
        finishTs.includes('after = "stop"'),
    ],
    [
      "SSE wire normalizeOpenAiFinishReasonOnSseChunk exists",
      finishTs.includes("normalizeOpenAiFinishReasonOnSseChunk") &&
        finishTs.includes("hasMidStreamDelta"),
    ],
    [
      "executeChatCompletion applies wire normalize",
      execTs.includes("normalizeOpenAiFinishReasonOnChatCompletion"),
    ],
    [
      "usage still reads finish_reason from responseData (pre-normalize)",
      execTs.includes("finish_reason: extractFinishReason(") &&
        execTs.includes("responseData as unknown as ChatCompletionResponse"),
    ],
    [
      "SSE extractFinishReason uses normalizeOpenAiFinishReason",
      sseTs.includes("normalizeOpenAiFinishReason"),
    ],
    [
      "SSE sseLine applies OnSseChunk before stringify",
      sseTs.includes("normalizeOpenAiFinishReasonOnSseChunk"),
    ],
  ];

  for (const [label, cond] of checks) {
    ok = (cond ? pass : fail)(label) && ok;
  }
}

const distFinish = join(
  ROOT,
  "apps/dmit-api/dist/lib/openaiFinishReason.js"
);
const distSse = join(ROOT, "apps/dmit-api/dist/lib/chatCompletionSse.js");

if (!existsSync(distFinish) || !existsSync(distSse)) {
  ok =
    fail(
      "dist modules present (run npm run build in apps/dmit-api)",
      `missing ${!existsSync(distFinish) ? distFinish : distSse}`
    ) && ok;
} else {
  const { normalizeOpenAiFinishReason, normalizeOpenAiFinishReasonOnChatCompletion } =
    await import(pathToFileURL(distFinish).href);
  const { chatCompletionToSseBody } = await import(pathToFileURL(distSse).href);

  const unitCases = [
    [null, "stop"],
    [undefined, "stop"],
    ["", "stop"],
    ["other", "stop"],
    ["Other", "stop"],
    ["unknown", "stop"],
    ["stop", "stop"],
    ["length", "length"],
    ["content_filter", "content_filter"],
    ["tool_calls", "tool_calls"],
    ["function_call", "function_call"],
    ["end_turn", "stop"],
  ];

  for (const [input, expected] of unitCases) {
    const got = normalizeOpenAiFinishReason(input);
    const label = `normalizeOpenAiFinishReason(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`;
    ok = (got === expected ? pass : fail)(
      label,
      got === expected ? undefined : `got ${JSON.stringify(got)}`
    ) && ok;
  }

  {
    const mid = normalizeOpenAiFinishReason(null, { allowNull: true });
    ok =
      (mid === null ? pass : fail)(
        "mid-stream allowNull keeps null",
        `got ${JSON.stringify(mid)}`
      ) && ok;
  }

  const {
    normalizeOpenAiFinishReasonOnSseChunk,
  } = await import(pathToFileURL(distFinish).href);

  {
    const terminal = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [{ index: 0, delta: {}, finish_reason: "other" }],
    });
    const fr = terminal?.choices?.[0]?.finish_reason;
    ok =
      (fr === "stop" ? pass : fail)(
        "SSE wire delta{} other → stop",
        `got ${JSON.stringify(fr)}`
      ) && ok;
  }

  {
    const terminalNull = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [{ index: 0, delta: {}, finish_reason: null }],
    });
    const fr = terminalNull?.choices?.[0]?.finish_reason;
    ok =
      (fr === "stop" ? pass : fail)(
        "SSE wire delta{} null → stop (AI SDK other guard)",
        `got ${JSON.stringify(fr)}`
      ) && ok;
  }

  {
    const mid = normalizeOpenAiFinishReasonOnSseChunk({
      choices: [
        { index: 0, delta: { content: "hi" }, finish_reason: null },
      ],
    });
    const fr = mid?.choices?.[0]?.finish_reason;
    ok =
      (fr === null ? pass : fail)(
        "SSE wire mid-stream null preserved",
        `got ${JSON.stringify(fr)}`
      ) && ok;
  }

  const normalized = normalizeOpenAiFinishReasonOnChatCompletion({
    id: "chatcmpl_test",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "hi" },
        finish_reason: "other",
      },
    ],
  });
  const fr = normalized.choices?.[0]?.finish_reason;
  ok =
    (fr === "stop" ? pass : fail)(
      "non-stream body finish_reason other → stop",
      `got ${JSON.stringify(fr)}`
    ) && ok;

  {
    const nullBody = normalizeOpenAiFinishReasonOnChatCompletion({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: null,
        },
      ],
    });
    const nfr = nullBody.choices?.[0]?.finish_reason;
    ok =
      (nfr === "stop" ? pass : fail)(
        "non-stream body finish_reason null → stop",
        `got ${JSON.stringify(nfr)}`
      ) && ok;
  }

  const sse = chatCompletionToSseBody({
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
  });

  const otherHits = [...sse.matchAll(/"finish_reason"\s*:\s*"other"/gi)];
  ok =
    (otherHits.length === 0 ? pass : fail)(
      "SSE body never emits finish_reason other",
      otherHits.length ? `matches=${otherHits.length}` : undefined
    ) && ok;

  const stopHits = [...sse.matchAll(/"finish_reason"\s*:\s*"stop"/g)];
  ok =
    (stopHits.length >= 1 ? pass : fail)(
      "SSE final chunk uses finish_reason stop",
      `stopHits=${stopHits.length}`
    ) && ok;

  if (!sse.includes("data: [DONE]")) {
    ok = fail("SSE ends with [DONE]") && ok;
  } else {
    pass("SSE ends with [DONE]");
  }
}

if (LIVE) {
  if (!API_KEY) {
    ok = fail("LIVE requires TOKFAI_API_KEY") && ok;
  } else {
    const url = `${API_BASE}/v1/chat/completions`;
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
          messages: [{ role: "user", content: "hello" }],
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        ok =
          fail(
            `LIVE stream HTTP ${res.status}`,
            text.slice(0, 400)
          ) && ok;
      } else {
        const otherHits = [
          ...text.matchAll(/"finish_reason"\s*:\s*"other"/gi),
        ];
        ok =
          (otherHits.length === 0 ? pass : fail)(
            "LIVE stream finish_reason never other",
            otherHits.length
              ? `matches=${otherHits.length}\n${text.slice(0, 800)}`
              : undefined
          ) && ok;
        const anyFinish = [
          ...text.matchAll(/"finish_reason"\s*:\s*"(stop|length|content_filter|tool_calls)"/g),
        ];
        ok =
          (anyFinish.length >= 1 || text.includes("[DONE]")
            ? pass
            : fail)(
            "LIVE stream has OpenAI finish_reason or [DONE]",
            text.slice(0, 400)
          ) && ok;
      }
    } catch (err) {
      ok =
        fail(
          "LIVE stream fetch",
          err instanceof Error ? err.message : String(err)
        ) && ok;
    }
  }
} else {
  console.log("SKIP  LIVE stream (set LIVE=1 TOKFAI_API_KEY=... to run)");
}

if (ok) {
  console.log("TOKFAI_P988_FINISH_REASON_NORMALIZE_PASS");
  process.exit(0);
}

console.error("TOKFAI_P988_FINISH_REASON_NORMALIZE_FAIL");
process.exit(1);
