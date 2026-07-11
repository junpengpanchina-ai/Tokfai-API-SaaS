#!/usr/bin/env node
/**
 * Internal operator smoke — OpenAI-compatible client connection paths.
 *
 * Covers the endpoints Cherry Studio / OpenCat / OpenAI Compatible clients hit:
 *   - POST /v1/responses (auto-fast, gemini-2.5-flash, gpt-5.5)
 *   - POST /v1/chat/completions (auto-fast)
 *   - POST /v1/images/generations (nano-banana-fast)
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
  const { res, body: json } = await acceptanceFetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
  return { status: res.status, body: json };
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

  // --- /v1/models includes aliases clients may pick ---
  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
      timeoutMs: TIMEOUT_MS,
    });
    const ids = Array.isArray(body?.data)
      ? body.data.map((row) => row.id)
      : [];
    const required = ["auto-fast", "gpt-5", "gpt-5.5", "gemini-2.5-flash"];
    const missing = required.filter((id) => !ids.includes(id));
    if (res.status === 200 && missing.length === 0) {
      ok = pass(`GET /v1/models includes ${required.join(", ")}`) && ok;
    } else {
      ok =
        fail(
          "GET /v1/models alias/callable coverage",
          `HTTP ${res.status}, missing=${missing.join(",") || "none"}, count=${ids.length}`
        ) && ok;
    }
  }

  // --- Responses API ---
  const responseCases = [
    {
      label: "POST /v1/responses model=auto-fast",
      body: { model: "auto-fast", input: "Say ok only." },
    },
    {
      label: "POST /v1/responses model=gemini-2.5-flash",
      body: { model: "gemini-2.5-flash", input: "Say ok only." },
    },
    {
      label: "POST /v1/responses model=gpt-5.5",
      body: { model: "gpt-5.5", input: "Say ok only." },
    },
    {
      label: "POST /v1/responses model=gpt-5 (alias) + max_output_tokens",
      body: {
        model: "gpt-5",
        input: [{ type: "message", role: "user", content: "Say ok only." }],
        max_output_tokens: 64,
      },
    },
  ];

  for (const { label, body } of responseCases) {
    const res = await postJson("/v1/responses", body);
    ok = assertResponsesOk(res, label) && ok;
  }

  // --- Chat completions ---
  {
    const res = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    const chatOk =
      res.status === 200 &&
      typeof res.body?.choices?.[0]?.message?.content === "string" &&
      res.body.choices[0].message.content.length > 0 &&
      typeof res.body?.request_id === "string";
    if (chatOk) {
      ok = pass("POST /v1/chat/completions model=auto-fast") && ok;
    } else {
      ok =
        fail(
          "POST /v1/chat/completions model=auto-fast",
          `HTTP ${res.status}, code=${res.body?.error?.code}`
        ) && ok;
    }
  }

  // --- Image generations ---
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
