#!/usr/bin/env node
/**
 * Internal operator smoke — OpenAI-compatible client connection paths.
 *
 * Covers the endpoints Cherry Studio / OpenCat / OpenAI Compatible clients hit:
 *   - GET /v1/models (required catalog IDs)
 *   - POST /v1/chat/completions non-stream (Gemini + GPT)
 *   - POST /v1/chat/completions stream=true (SSE + [DONE])
 *   - POST /v1/responses (Gemini + GPT)
 *
 * Usage:
 *   node scripts/p814-openai-client-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p814-openai-client-compat-smoke.mjs
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p814-openai-client-compat-smoke.mjs";
const LIVE = isLiveMode();
let mockChild = null;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child;
}

const BASE = resolveApiBaseUrl(LIVE).replace(/\/v1$/, "");
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;

const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const REQUIRED_MODEL_IDS = [
  "auto-fast",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.4",
  "gpt-5.5",
];

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

async function postJson(path, body) {
  const { res, body: json, text } = await acceptanceFetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
  return { status: res.status, body: json, text, headers: res.headers };
}

function assertChatOk(res, label) {
  const ok =
    res.status === 200 &&
    res.body?.object === "chat.completion" &&
    typeof res.body?.choices?.[0]?.message?.content === "string" &&
    res.body.choices[0].message.content.length > 0 &&
    typeof res.body?.request_id === "string";
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, object=${JSON.stringify(res.body?.object)}, code=${res.body?.error?.code}, content=${JSON.stringify(res.body?.choices?.[0]?.message?.content)?.slice(0, 80)}`
  );
}

function assertResponsesOk(res, label) {
  const ok =
    res.status === 200 &&
    res.body?.object === "response" &&
    res.body?.status === "completed" &&
    typeof res.body?.output_text === "string" &&
    res.body.output_text.length > 0 &&
    typeof res.body?.request_id === "string" &&
    res.body.credits_charged !== undefined &&
    typeof res.body?.tokfai?.request_id === "string" &&
    (res.body?.tokfai?.requested_model != null ||
      res.body?.tokfai?.resolved_model != null);

  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, object=${res.body?.object}, output_text=${JSON.stringify(res.body?.output_text)?.slice(0, 80)}, code=${res.body?.error?.code}`
  );
}

function assertSseOk(res, label) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = res.text ?? "";
  const hasEventStream =
    contentType.includes("text/event-stream") || text.includes("data:");
  const hasDone = /data:\s*\[DONE\]/.test(text);
  const hasChunkObject =
    /"object"\s*:\s*"chat\.completion\.chunk"/.test(text) ||
    text.includes('"object":"chat.completion.chunk"');
  const hasDelta = text.includes('"delta"');
  const ok =
    res.status === 200 &&
    hasEventStream &&
    hasDone &&
    hasChunkObject &&
    hasDelta;
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, content-type=${contentType}, hasDone=${hasDone}, hasChunkObject=${hasChunkObject}, hasDelta=${hasDelta}, preview=${JSON.stringify(text.slice(0, 160))}`
  );
}

function assertResponsesSseOk(res, label) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = res.text ?? "";
  const hasEventStream = contentType.includes("text/event-stream");
  const hasDeltaEvent = /event:\s*response\.output_text\.delta/.test(text);
  const hasDeltaField = /"delta"\s*:/.test(text);
  const hasCompleted = /event:\s*response\.completed/.test(text);
  const hasDone = /data:\s*\[DONE\]/.test(text);
  const notPlainJson =
    !text.trimStart().startsWith("{") || text.includes("event:");
  const ok =
    res.status === 200 &&
    hasEventStream &&
    hasDeltaEvent &&
    hasDeltaField &&
    hasCompleted &&
    hasDone &&
    notPlainJson;
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, content-type=${contentType}, deltaEvent=${hasDeltaEvent}, completed=${hasCompleted}, done=${hasDone}, preview=${JSON.stringify(text.slice(0, 200))}`
  );
}

async function run() {
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    console.log(`offline mock: ${BASE}`);
  } else {
    console.log(`live production: ${BASE}`);
  }
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... (or use offline mock key).");
    if (mockChild) mockChild.kill();
    process.exit(1);
  }

  let ok = true;

  // --- /v1/models includes Cherry Studio catalog IDs ---
  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
      timeoutMs: TIMEOUT_MS,
    });
    const ids = Array.isArray(body?.data)
      ? body.data.map((row) => row.id)
      : [];
    const missing = REQUIRED_MODEL_IDS.filter((id) => !ids.includes(id));
    if (res.status === 200 && missing.length === 0) {
      ok =
        pass(`GET /v1/models includes ${REQUIRED_MODEL_IDS.join(", ")}`) && ok;
    } else {
      ok =
        fail(
          "GET /v1/models alias/callable coverage",
          `HTTP ${res.status}, missing=${missing.join(",") || "none"}, count=${ids.length}`
        ) && ok;
    }
  }

  // --- Chat completions (non-stream) ---
  {
    const res = await postJson("/v1/chat/completions", {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    ok = assertChatOk(res, "POST /v1/chat/completions non-stream gemini-2.5-flash") && ok;
  }

  {
    const res = await postJson("/v1/chat/completions", {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    ok = assertChatOk(res, "POST /v1/chat/completions non-stream gpt-5.5") && ok;
  }

  // --- Chat completions (stream=true SSE) ---
  {
    const res = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: true,
    });
    ok =
      assertSseOk(
        res,
        "POST /v1/chat/completions stream=true auto-fast (SSE + [DONE])"
      ) && ok;
  }

  // --- Responses API ---
  {
    const res = await postJson("/v1/responses", {
      model: "gemini-2.5-flash",
      input: "Say ok only.",
    });
    ok = assertResponsesOk(res, "POST /v1/responses model=gemini-2.5-flash") && ok;
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5.5",
      input: "Say ok only.",
    });
    ok = assertResponsesOk(res, "POST /v1/responses model=gpt-5.5") && ok;
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5",
      input: [{ type: "message", role: "user", content: "Say ok only." }],
      max_output_tokens: 64,
    });
    ok =
      assertResponsesOk(
        res,
        "POST /v1/responses model=gpt-5 (alias) + max_output_tokens"
      ) && ok;
  }

  // --- Responses API stream=true (OpenAI Responses SSE) ---
  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5.4",
      input: "Say OK in one short sentence.",
      stream: true,
    });
    ok =
      assertResponsesSseOk(
        res,
        "POST /v1/responses stream=true gpt-5.4 (Responses SSE + [DONE])"
      ) && ok;
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5.5",
      input: [{ role: "user", content: "Say ok only." }],
      stream: true,
      max_output_tokens: 64,
    });
    ok =
      assertResponsesSseOk(
        res,
        "POST /v1/responses stream=true gpt-5.5 input=array"
      ) && ok;
  }

  // --- Image generations (still covered for OpenAI-compatible clients) ---
  {
    const res = await postJson("/v1/images/generations", {
      model: "nano-banana-fast",
      prompt: "a small red circle on white background",
      n: 1,
      size: "1024x1024",
    });
    const imageOk =
      res.status === 200 &&
      Array.isArray(res.body?.data) &&
      res.body.data.length > 0 &&
      (typeof res.body.data[0]?.url === "string" ||
        typeof res.body.data[0]?.b64_json === "string");
    if (imageOk) {
      ok = pass("POST /v1/images/generations model=nano-banana-fast") && ok;
    } else {
      ok =
        fail(
          "POST /v1/images/generations model=nano-banana-fast",
          `HTTP ${res.status}, code=${res.body?.error?.code}`
        ) && ok;
    }
  }

  if (mockChild) mockChild.kill();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  if (mockChild) mockChild.kill();
  process.exit(1);
});
