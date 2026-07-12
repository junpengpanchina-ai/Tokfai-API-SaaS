#!/usr/bin/env node
/**
 * Model matrix smoke — every chat model on GET /v1/models must run via:
 *   POST /v1/chat/completions stream=false|true
 *   POST /v1/responses stream=false|true
 *
 * Also verifies Cherry Studio display-name aliases normalize correctly.
 *
 * Usage:
 *   node scripts/p816-model-matrix-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p816-model-matrix-smoke.mjs
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p816-model-matrix-smoke.mjs";
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

const IMAGE_MODEL_PREFIXES = [
  "nano-banana",
  "gpt-image",
  "dall-e",
  "imagen",
];

const CHERRY_ALIASES = [
  "gpt-5.4-pro",
  "GPT 5.4 Pro",
  "openai/gpt-5.4-pro",
  "gpt-5.5-pro",
  "GPT 5.5 Pro",
  "openai/gpt-5.5-pro",
  "models/gpt-5.4",
  "openai/gpt-5.4",
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

function isImageModelId(id) {
  const lower = String(id).toLowerCase();
  return IMAGE_MODEL_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}-`) || lower.startsWith(prefix)
  );
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

function assertChatJson(res, label) {
  const ok =
    res.status === 200 &&
    res.body?.object === "chat.completion" &&
    typeof res.body?.choices?.[0]?.message?.content === "string";
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, code=${res.body?.error?.code}, message=${res.body?.error?.message}`
  );
}

function assertChatSse(res, label) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = res.text ?? "";
  const ok =
    res.status === 200 &&
    (contentType.includes("text/event-stream") || text.includes("data:")) &&
    /data:\s*\[DONE\]/.test(text) &&
    (text.includes("chat.completion.chunk") || text.includes('"delta"'));
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, content-type=${contentType}, preview=${JSON.stringify(text.slice(0, 160))}`
  );
}

function assertResponsesJson(res, label) {
  const ok =
    res.status === 200 &&
    res.body?.object === "response" &&
    typeof res.body?.output_text === "string";
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, code=${res.body?.error?.code}, message=${res.body?.error?.message}`
  );
}

function assertResponsesSse(res, label) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = res.text ?? "";
  const ok =
    res.status === 200 &&
    contentType.includes("text/event-stream") &&
    /event:\s*response\.output_text\.delta/.test(text) &&
    /event:\s*response\.completed/.test(text) &&
    /data:\s*\[DONE\]/.test(text);
  if (ok) return pass(label);
  return fail(
    label,
    `HTTP ${res.status}, content-type=${contentType}, preview=${JSON.stringify(text.slice(0, 200))}`
  );
}

async function exerciseChatModel(modelId) {
  let ok = true;
  {
    const res = await postJson("/v1/chat/completions", {
      model: modelId,
      messages: [{ role: "user", content: "Say OK" }],
      stream: false,
      max_tokens: 32,
    });
    ok = assertChatJson(res, `chat non-stream ${modelId}`) && ok;
  }
  {
    const res = await postJson("/v1/chat/completions", {
      model: modelId,
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
      max_tokens: 32,
    });
    ok = assertChatSse(res, `chat stream ${modelId}`) && ok;
  }
  {
    const res = await postJson("/v1/responses", {
      model: modelId,
      input: "Say OK",
      stream: false,
      max_output_tokens: 32,
    });
    ok = assertResponsesJson(res, `responses non-stream ${modelId}`) && ok;
  }
  {
    const res = await postJson("/v1/responses", {
      model: modelId,
      input: "Say OK",
      stream: true,
      max_output_tokens: 32,
    });
    ok = assertResponsesSse(res, `responses stream ${modelId}`) && ok;
  }
  return ok;
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

  const { res: modelsRes, body: modelsBody } = await acceptanceFetch(
    `${BASE}/v1/models`,
    { timeoutMs: TIMEOUT_MS }
  );
  if (modelsRes.status !== 200 || !Array.isArray(modelsBody?.data)) {
    ok = fail(
      "GET /v1/models",
      `HTTP ${modelsRes.status}, data=${Array.isArray(modelsBody?.data)}`
    );
    if (mockChild) mockChild.kill();
    process.exit(1);
  }

  const allIds = modelsBody.data.map((row) => row.id).filter(Boolean);
  const chatIds = allIds.filter((id) => !isImageModelId(id));
  const imageIds = allIds.filter((id) => isImageModelId(id));

  pass(
    `GET /v1/models chat=${chatIds.length} image=${imageIds.length} total=${allIds.length}`
  );

  // Listed ids must be canonical — no Cherry display-name fakes on the catalog.
  for (const bad of ["gpt-5.4-pro", "gpt-5.5-pro", "GPT 5.4 Pro"]) {
    if (allIds.includes(bad)) {
      ok = fail(`catalog must not list ${bad}`, `found in /v1/models`) && ok;
    }
  }

  console.log("");
  console.log(`--- matrix: ${chatIds.length} chat models ---`);
  for (const modelId of chatIds) {
    ok = (await exerciseChatModel(modelId)) && ok;
  }

  console.log("");
  console.log("--- Cherry Studio aliases ---");
  for (const alias of CHERRY_ALIASES) {
    const res = await postJson("/v1/chat/completions", {
      model: alias,
      messages: [{ role: "user", content: "Say OK" }],
      stream: false,
      max_tokens: 32,
    });
    ok = assertChatJson(res, `cherry alias chat ${JSON.stringify(alias)}`) && ok;

    const res2 = await postJson("/v1/responses", {
      model: alias,
      input: "Say OK",
      stream: true,
      max_output_tokens: 32,
    });
    ok =
      assertResponsesSse(
        res2,
        `cherry alias responses stream ${JSON.stringify(alias)}`
      ) && ok;
  }

  if (mockChild) mockChild.kill();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  if (mockChild) mockChild.kill();
  process.exit(1);
});
