#!/usr/bin/env node
/**
 * P903 — OpenAI-compatible client smoke (offline mock by default).
 *
 * Cherry Studio / Chatbox / Codex / Cursor / OpenAI SDK paths:
 *   GET  /v1/models
 *   POST /v1/chat/completions stream=false|true
 *   POST /v1/responses stream=false|true
 *
 * Param compat: max_tokens, max_completion_tokens, max_output_tokens,
 * messages↔input, temperature/top_p/stream_options accepted.
 *
 * Usage:
 *   node scripts/p903-openai-client-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p903-openai-client-compat-smoke.mjs
 */

import {
  isLiveMode,
  resolveAcceptanceApiKey,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "scripts/p903-openai-client-compat-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = isLiveMode();
let mockChild = null;
let BASE;
let API_KEY;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child ?? null;
  BASE = mock.baseUrl.replace(/\/v1$/, "");
  API_KEY = resolveAcceptanceApiKey(false, mock.apiKey);
} else {
  BASE = resolveApiBaseUrl(true).replace(/\/v1$/, "");
  API_KEY = resolveAcceptanceApiKey(true);
}

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
  const { res, body: json, text, headers } = await acceptanceFetch(
    `${BASE}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    }
  );
  return { status: res.status, body: json, text, headers: res.headers };
}

async function run() {
  if (!LIVE) printOfflineDefaultHint(SCRIPT);
  console.log(LIVE ? `live: ${BASE}` : `offline mock: ${BASE}`);
  console.log("");

  let ok = true;

  {
    const chat = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
      "utf8"
    );
    const upstream = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/upstreamChatBody.ts"),
      "utf8"
    );
    const responses = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/responsesTransform.ts"),
      "utf8"
    );
    const staticOk =
      chat.includes("max_completion_tokens") &&
      chat.includes("stream_options") &&
      upstream.includes("max_completion_tokens") &&
      responses.includes("max_completion_tokens") &&
      responses.includes("stream_options");
    if (!staticOk) {
      ok = fail("static param compat", "max_completion_tokens/stream_options") && ok;
    } else {
      ok = pass("static: max_completion_tokens + stream_options accepted") && ok;
    }
  }

  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeoutMs: TIMEOUT_MS,
    });
    if (res.status !== 200 || !Array.isArray(body?.data)) {
      ok = fail("GET /v1/models", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("GET /v1/models") && ok;
    }
  }

  {
    const res = await postJson("/v1/chat/completions", {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      temperature: 0.2,
      top_p: 0.9,
      max_completion_tokens: 64,
      stream_options: { include_usage: true },
    });
    const content = res.body?.choices?.[0]?.message?.content;
    if (res.status !== 200 || typeof content !== "string" || !content.length) {
      ok =
        fail(
          "chat non-stream + max_completion_tokens/stream_options",
          `HTTP ${res.status} code=${res.body?.error?.code}`
        ) && ok;
    } else {
      ok =
        pass(
          "POST /v1/chat/completions stream=false (max_completion_tokens ok)"
        ) && ok;
    }
  }

  {
    const res = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: true,
      max_tokens: 64,
    });
    const text = res.text ?? "";
    if (res.status !== 200 || !text.includes("data:") || !/\[DONE\]/.test(text)) {
      ok = fail("chat stream=true", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/chat/completions stream=true") && ok;
    }
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5",
      input: "Say ok only.",
      stream: false,
      max_output_tokens: 64,
      temperature: 0.1,
    });
    if (
      res.status !== 200 ||
      res.body?.object !== "response" ||
      !res.body?.output_text
    ) {
      ok = fail("responses non-stream string input", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/responses stream=false input=string") && ok;
    }
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5.5",
      input: [{ role: "user", content: "Say ok only." }],
      stream: false,
      max_completion_tokens: 32,
      stream_options: { include_usage: true },
    });
    if (
      res.status !== 200 ||
      res.body?.tokfai?.request_id == null ||
      res.body?.tokfai?.credits_charged === undefined
    ) {
      ok = fail("responses array + tokfai fields", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/responses input=array + tokfai meta") && ok;
    }
  }

  {
    const res = await postJson("/v1/responses", {
      model: "gpt-5.4",
      input: "Say ok only.",
      stream: true,
      max_output_tokens: 64,
    });
    const text = res.text ?? "";
    const ct = res.headers.get("content-type") ?? "";
    if (
      res.status !== 200 ||
      (!ct.includes("text/event-stream") && !text.includes("event:"))
    ) {
      ok = fail("responses stream=true", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/responses stream=true") && ok;
    }
  }

  if (mockChild) mockChild.kill();
  console.log(
    ok ? "\nTOKFAI_P903_OPENAI_CLIENT_COMPAT_PASS" : "\nTOKFAI_P903_OPENAI_CLIENT_COMPAT_FAIL"
  );
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  if (mockChild) mockChild.kill();
  console.error(err);
  process.exit(1);
});
