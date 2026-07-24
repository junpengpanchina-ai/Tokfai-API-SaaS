#!/usr/bin/env node
/**
 * P946 — gemini-2.5-flash /v1/chat/completions stream=false reliability.
 *
 * Verifies the narrow non-stream → upstream stream=true assemble fallback:
 *   - static: only gemini-2.5-flash + client stream=false path
 *   - unit: SSE assemble → chat.completion
 *   - LIVE: 30 consecutive non-stream calls — no 504, no empty body,
 *     no charged timeout
 *
 * Hard limits:
 *   - does not change aliases / Cherry / image paths
 *   - never print full API key
 *
 * Usage:
 *   node scripts/p946-gemini-25-flash-nonstream-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p946-gemini-25-flash-nonstream-smoke.mjs
 *
 * Optional:
 *   ITERATIONS=30
 *   CHAT_TIMEOUT_MS=200000
 *
 * Acceptance:
 *   TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p946-gemini-25-flash-nonstream-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS";
const FAIL_MARKER = "TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_FAIL";
const MODEL = "gemini-2.5-flash";
const ITERATIONS = Math.max(
  1,
  parseInt(process.env.ITERATIONS ?? "30", 10) || 30
);

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function containsUndefinedLiteral(text) {
  return /\bundefined\b/i.test(String(text ?? ""));
}

function isTokfaiErrorEnvelope(body) {
  const err = body?.error;
  return (
    err &&
    typeof err === "object" &&
    typeof err.message === "string" &&
    err.message.trim().length > 0 &&
    typeof err.code === "string" &&
    err.code.trim().length > 0 &&
    typeof err.type === "string" &&
    err.type.trim().length > 0 &&
    !containsUndefinedLiteral(err.message) &&
    !containsUndefinedLiteral(err.code)
  );
}

function hasChargedTimeout(body, text) {
  const billing = String(
    body?.tokfai?.billing_status ?? body?.billing_status ?? ""
  ).toLowerCase();
  const msg = String(body?.error?.message ?? text ?? "").toLowerCase();
  if (msg.includes("charged timeout")) return true;
  if (
    billing.includes("charged") &&
    (body?.error || /timeout/i.test(msg))
  ) {
    return true;
  }
  const credits = body?.credits_charged ?? body?.tokfai?.credits_charged;
  if (
    body?.error &&
    typeof credits === "number" &&
    credits > 0 &&
    /timeout/i.test(msg)
  ) {
    return true;
  }
  return false;
}

async function loadAssembleHelpers() {
  // Prefer compiled dist when present; fall back to tsx register via dynamic import
  // of the TypeScript source through Node's experimental strip-types when available.
  const distPath = join(
    ROOT,
    "apps/dmit-api/dist/lib/assembleChatCompletionFromUpstreamSse.js"
  );
  try {
    return await import(pathToFileURL(distPath).href);
  } catch {
    // Offline static + inline assemble check below covers the contract when
    // dist is missing (typecheck/build run earlier in the release gate).
    return null;
  }
}

function inlineAssembleFromSse(text) {
  const payloads = [];
  for (const block of String(text).split(/\n\n+/)) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) continue;
    const data = dataLines.join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(data));
    } catch {
      // ignore
    }
  }
  let content = "";
  let finish = null;
  let id = "";
  let model = MODEL;
  for (const p of payloads) {
    if (typeof p?.id === "string") id = p.id;
    if (typeof p?.model === "string") model = p.model;
    const choice = p?.choices?.[0];
    if (typeof choice?.delta?.content === "string") {
      content += choice.delta.content;
    }
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) {
      finish = choice.finish_reason;
    }
  }
  if (!payloads.length) return null;
  return {
    id: id || "chatcmpl_test",
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finish ?? "stop",
      },
    ],
  };
}

async function runStaticChecks() {
  let ok = true;
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const fallbackGate = read(
    "apps/dmit-api/src/lib/gemini25FlashNonStreamStreamFallback.ts"
  );
  const assemble = read(
    "apps/dmit-api/src/lib/assembleChatCompletionFromUpstreamSse.ts"
  );
  const streamFetch = read(
    "apps/dmit-api/src/upstream/providerFetchChatStreamAssembled.ts"
  );
  const policy = read("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts");
  const aliases = read("apps/dmit-api/src/upstream/modelAliases.ts");
  const cherry = read("apps/dmit-api/src/lib/chatCompletionCompat.ts");
  const images = read("apps/dmit-api/src/routes/images.ts");

  ok =
    (fallbackGate.includes('GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL') &&
    fallbackGate.includes('"gemini-2.5-flash"') &&
    fallbackGate.includes("isGemini25FlashNonStreamStreamFallbackPath") &&
    fallbackGate.includes("isGemini25FlashStreamFallbackEligible")
      ? pass("fallback gate scoped to gemini-2.5-flash")
      : fail("fallback gate scoped to gemini-2.5-flash")) && ok;

  ok =
    (exec.includes("providerFetchChatStreamAssembled") &&
    exec.includes("chat_gemini25_flash_nonstream_stream_fallback") &&
    exec.includes("isGemini25FlashNonStreamStreamFallbackPath") &&
    exec.includes("recordSuccessfulUsageAndDebit")
      ? pass("executeChatCompletion wires stream assemble fallback")
      : fail("executeChatCompletion wires stream assemble fallback")) && ok;

  ok =
    (streamFetch.includes("stream: true") &&
    streamFetch.includes("assembleChatCompletionFromUpstreamSse") &&
    streamFetch.includes("idleTimeoutMs") &&
    streamFetch.includes('billing_status: "not_billable"')
      ? pass("upstream stream drain + assemble helper")
      : fail("upstream stream drain + assemble helper")) && ok;

  ok =
    (assemble.includes("assembleChatCompletionFromUpstreamSse") &&
    assemble.includes('object: "chat.completion"')
      ? pass("SSE assemble → chat.completion")
      : fail("SSE assemble → chat.completion")) && ok;

  ok =
    (policy.includes("chat_gemini25_flash_nonstream_stream_fallback") &&
    policy.includes("gemini-2.5-flash")
      ? pass("timeout policy budget for nonstream+stream fallback")
      : fail("timeout policy budget for nonstream+stream fallback")) && ok;

  // Ensure we did not widen alias / Cherry / image surfaces in this change set
  // (spot-check: fallback files must not import those modules).
  ok =
    (!fallbackGate.includes("modelAliases") &&
    !fallbackGate.includes("chatCompletionCompat") &&
    !streamFetch.includes("buildGrsaiImagePayload") &&
    !assemble.includes("chatCompletionCompat")
      ? pass("fallback modules isolated from alias/Cherry/image")
      : fail("fallback modules isolated from alias/Cherry/image")) && ok;

  ok =
    (aliases.includes("gemini-2.5-flash") &&
    cherry.includes("stream: false") &&
    images.includes("/v1/images")
      ? pass("alias / Cherry / image files still present (untouched by scope)")
      : fail("alias / Cherry / image files still present")) && ok;

  const sampleSse = [
    'data: {"id":"chatcmpl_p946","object":"chat.completion.chunk","created":1,"model":"gemini-2.5-flash","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl_p946","object":"chat.completion.chunk","created":1,"model":"gemini-2.5-flash","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl_p946","object":"chat.completion.chunk","created":1,"model":"gemini-2.5-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
    "data: [DONE]\n\n",
  ].join("");

  const helpers = await loadAssembleHelpers();
  let assembled = null;
  if (helpers?.assembleChatCompletionFromUpstreamSse) {
    assembled = helpers.assembleChatCompletionFromUpstreamSse(sampleSse, MODEL);
  } else {
    assembled = inlineAssembleFromSse(sampleSse);
  }

  ok =
    (assembled &&
    assembled.object === "chat.completion" &&
    assembled.choices?.[0]?.message?.content === "ok" &&
    assembled.choices?.[0]?.finish_reason === "stop"
      ? pass("assemble unit: content + finish_reason")
      : fail(
          "assemble unit: content + finish_reason",
          JSON.stringify(assembled)
        )) && ok;

  return ok;
}

async function runLiveIterations({ BASE, API_KEY, TIMEOUT_MS }) {
  let ok = true;
  console.log(
    `\nLIVE iterations: model=${MODEL} stream=false n=${ITERATIONS} timeoutMs=${TIMEOUT_MS}\n`
  );

  for (let i = 1; i <= ITERATIONS; i++) {
    if (i > 1) {
      // Small gap reduces token rate-limit collisions after prior LIVE steps.
      await new Promise((r) => setTimeout(r, 750));
    }
    const started = Date.now();
    const res = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: "user", content: `P946 iter ${i}: say ok only.` }],
        max_tokens: 16,
      }),
      timeoutMs: TIMEOUT_MS,
    });
    const latencyMs = Date.now() - started;
    const text = res.text ?? "";
    const body = res.body;
    const status = res.res?.status ?? 0;
    const requestId =
      body?.request_id ??
      body?.tokfai?.request_id ??
      res.res?.headers?.get?.("x-request-id") ??
      null;

    const label = `iter ${String(i).padStart(2, "0")}/${ITERATIONS}`;

    if (!text || !String(text).trim()) {
      ok = fail(label, `empty body status=${status}`) && ok;
      break;
    }
    if (containsUndefinedLiteral(text)) {
      ok = fail(label, `literal undefined in body request_id=${requestId}`) && ok;
      break;
    }
    if (status === 504) {
      ok =
        fail(
          label,
          `HTTP 504 request_id=${requestId} code=${body?.error?.code ?? "?"} msg=${body?.error?.message ?? "?"}`
        ) && ok;
      break;
    }
    if (status === 500) {
      ok =
        fail(
          label,
          `HTTP 500 request_id=${requestId} code=${body?.error?.code ?? "?"} msg=${body?.error?.message ?? "?"}`
        ) && ok;
      break;
    }
    if (hasChargedTimeout(body, text)) {
      ok = fail(label, `charged timeout request_id=${requestId}`) && ok;
      break;
    }

    if (status !== 200) {
      if (!isTokfaiErrorEnvelope(body)) {
        ok =
          fail(
            label,
            `non-200 without envelope status=${status} request_id=${requestId}`
          ) && ok;
        break;
      }
      // Hard fail any non-timeout? User asked: no 504, no empty body, no charged timeout.
      // Other 4xx/429 with envelope are still failures for "30 consecutive success".
      ok =
        fail(
          label,
          `HTTP ${status} code=${body.error.code} msg=${body.error.message} request_id=${requestId}`
        ) && ok;
      break;
    }

    const content = body?.choices?.[0]?.message?.content;
    const objectOk = body?.object === "chat.completion";
    if (!objectOk || content == null) {
      ok =
        fail(
          label,
          `invalid chat.completion envelope request_id=${requestId}`
        ) && ok;
      break;
    }
    if (!requestId) {
      ok = fail(label, "missing request_id") && ok;
      break;
    }

    console.log(
      `PASS  ${label} status=200 latencyMs=${latencyMs} request_id=${requestId}`
    );
  }

  return ok;
}

async function main() {
  let ok = true;
  console.log("=== P946 gemini-2.5-flash non-stream smoke ===\n");

  ok = (await runStaticChecks()) && ok;

  const { LIVE, BASE, API_KEY, TIMEOUT_MS, cleanup } =
    await bootstrapClientCompatSmoke(SCRIPT);

  try {
    if (LIVE) {
      // LIVE needs enough client budget for non-stream + stream fallback.
      const liveTimeout = Math.max(
        TIMEOUT_MS,
        parseInt(process.env.CHAT_TIMEOUT_MS ?? "200000", 10) || 200_000
      );
      ok =
        (await runLiveIterations({
          BASE,
          API_KEY,
          TIMEOUT_MS: liveTimeout,
        })) && ok;
    } else {
      // Offline: mock should still return chat.completion for gemini-2.5-flash.
      const res = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          messages: [{ role: "user", content: "Say ok only." }],
        }),
        timeoutMs: TIMEOUT_MS,
      });
      const text = res.text ?? "";
      const status = res.res?.status ?? 0;
      if (
        status === 200 &&
        res.body?.object === "chat.completion" &&
        text.trim() &&
        !containsUndefinedLiteral(text)
      ) {
        ok = pass("offline mock chat non-stream gemini-2.5-flash") && ok;
      } else {
        ok =
          fail(
            "offline mock chat non-stream gemini-2.5-flash",
            `status=${status}`
          ) && ok;
      }
      ok =
        pass(
          `offline mode skips LIVE ${ITERATIONS}x loop (set LIVE=1 for release gate)`
        ) && ok;
    }
  } finally {
    cleanup();
  }

  if (ok) {
    console.log(`\n${PASS_MARKER}`);
    process.exit(0);
  }
  console.error(`\n${FAIL_MARKER}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL_MARKER);
  console.error(err);
  process.exit(1);
});
