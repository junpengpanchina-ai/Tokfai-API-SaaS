#!/usr/bin/env node
/**
 * Offline smoke for Tokfai + Cherry Studio OpenAI-compatible integration.
 *
 * Covers:
 *   - GET /v1/models
 *   - POST /v1/chat/completions stream=false|true
 *   - gpt-5.5 / gpt-5.4-pro / gpt-5-pro (+ gemini)
 *   - content string + content parts array
 *   - Cherry common fields (temperature/top_p/max_tokens/stream_options/tools/response_format)
 *   - unknown model → model_not_available with non-empty error.message
 *   - billing fields + request_id
 *   - static DMIT sanitize (message normalize + GPT param strip)
 *
 * Default: mock only. LIVE=1 may call https://api.tokfai.com/v1.
 *
 * Usage: node scripts/p920-cherry-studio-client-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  THIRD_PARTY_CLIENT_PROFILES,
  REQUIRED_MODEL_IDS,
  CLIENT_ERROR_CODES,
  FORBIDDEN_DOC_HOSTS,
  TOKFAI_API_V1,
} from "./lib/third-party-client-profiles.mjs";

const SCRIPT = "scripts/p920-cherry-studio-client-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const profile = THIRD_PARTY_CLIENT_PROFILES["cherry-studio"];

const DOC_FILES = [
  "docs/tokfai-third-party-clients.zh.md",
  "apps/web/lib/docs/public-beta-docs-registry.ts",
];

const CHERRY_MODELS = [
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5-pro",
  "gpt-5",
  "gemini-3-pro",
  "gemini-2.5-flash",
];

function readCorpus() {
  return DOC_FILES.map((rel) => {
    try {
      return readFileSync(join(ROOT, rel), "utf8");
    } catch {
      return "";
    }
  }).join("\n");
}

function cherryBody(overrides = {}) {
  return {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 64,
    max_completion_tokens: 64,
    stream_options: { include_usage: true },
    presence_penalty: 0,
    frequency_penalty: 0,
    tools: [],
    response_format: { type: "text" },
    metadata: { source: "cherry-studio-smoke" },
    user: "cherry-smoke-user",
    enable_thinking: false,
    provider_options: { cherry: true },
    extra_body: { ignored: true },
    ...overrides,
  };
}

function assertErrorEnvelope(body, label) {
  const message = body?.error?.message;
  const code = body?.error?.code;
  const type = body?.error?.type;
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message === "undefined" ||
    /grsaiapi|upstream provider|stack/i.test(message) ||
    typeof code !== "string" ||
    !code.trim() ||
    typeof type !== "string" ||
    !type.trim()
  ) {
    return fail(
      label,
      `bad envelope message=${JSON.stringify(message)} code=${code} type=${type}`
    );
  }
  return pass(label);
}

async function postChat(ctx, body, headers = {}) {
  return acceptanceFetch(`${ctx.BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      ...ctx.authHeaders({
        "User-Agent": "CherryStudio/1.0 TokfaiCompatSmoke",
        ...headers,
      }),
    },
    body: JSON.stringify(body),
    timeoutMs: ctx.TIMEOUT_MS,
  });
}

function assertSseOk(res, text, label) {
  const ct = res.headers.get("content-type") ?? "";
  if (
    res.status !== 200 ||
    !ct.includes("text/event-stream") ||
    !text.includes("chat.completion.chunk") ||
    !text.includes("data:") ||
    !/data:\s*\[DONE\]/.test(text)
  ) {
    return fail(
      label,
      `HTTP ${res.status} ct=${ct} hasChunk=${text.includes("chat.completion.chunk")} done=${/\[DONE\]/.test(text)}`
    );
  }
  return pass(label);
}

function runCompatUnit() {
  const unit = join(ROOT, "scripts/lib/cherry-studio-chat-compat-unit.mjs");
  const result = spawnSync(process.execPath, [unit], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

console.log(`=== ${profile.name} client smoke (cherry-studio) ===\n`);
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  if (!runCompatUnit()) {
    ok = fail("cherry chat compat unit", "unit script failed") && ok;
  } else {
    ok = pass("cherry chat compat unit") && ok;
  }

  {
    const upstream = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/upstreamChatBody.ts"),
      "utf8"
    );
    const compat = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/chatCompletionCompat.ts"),
      "utf8"
    );
    const chatRoute = readFileSync(
      join(ROOT, "apps/dmit-api/src/routes/chat.ts"),
      "utf8"
    );
    const schema = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
      "utf8"
    );
    const staticOk =
      compat.includes("normalizeChatMessageContent") &&
      compat.includes("shouldStripGptSamplingParams") &&
      compat.includes("sanitizeUpstreamChatBody") &&
      upstream.includes("sanitizeUpstreamChatBody") &&
      upstream.includes("max_completion_tokens") &&
      chatRoute.includes("normalizeChatMessages") &&
      chatRoute.includes("text/event-stream") &&
      schema.includes("stream_options") &&
      schema.includes("optionalFiniteNumber");
    if (!staticOk) {
      ok =
        fail(
          "static DMIT Cherry stream sanitize",
          "missing normalize/strip/SSE hooks"
        ) && ok;
    } else {
      ok = pass("static DMIT Cherry stream sanitize present") && ok;
    }
  }

  const corpus = readCorpus();
  for (const phrase of profile.docPhrases) {
    if (!corpus.includes(phrase)) {
      ok = fail(`docs mention ${JSON.stringify(phrase)}`, "missing") && ok;
    } else {
      ok = pass(`docs mention ${JSON.stringify(phrase)}`) && ok;
    }
  }

  for (const modelId of REQUIRED_MODEL_IDS) {
    if (!corpus.includes(modelId)) {
      ok = fail(`docs cover model ${modelId}`, "missing") && ok;
    }
  }
  if (REQUIRED_MODEL_IDS.every((id) => corpus.includes(id))) {
    ok = pass(`docs cover models: ${REQUIRED_MODEL_IDS.join(", ")}`) && ok;
  }

  for (const code of CLIENT_ERROR_CODES) {
    if (!corpus.includes(code)) {
      ok = fail(`docs cover error ${code}`, "missing") && ok;
    }
  }
  if (CLIENT_ERROR_CODES.every((c) => corpus.includes(c))) {
    ok = pass(`docs cover Tokfai errors: ${CLIENT_ERROR_CODES.join(", ")}`) && ok;
  }

  if (!corpus.includes(TOKFAI_API_V1)) {
    ok = fail("docs use https://api.tokfai.com/v1", "missing") && ok;
  } else {
    ok = pass("docs use https://api.tokfai.com/v1") && ok;
  }

  {
    const guide = readFileSync(
      join(ROOT, "docs/tokfai-third-party-clients.zh.md"),
      "utf8"
    );
    let guideHostLeak = null;
    for (const re of FORBIDDEN_DOC_HOSTS) {
      if (re.test(guide)) {
        guideHostLeak = String(re);
        break;
      }
    }
    if (guideHostLeak) {
      ok =
        fail(
          "third-party guide must not include upstream hosts",
          guideHostLeak
        ) && ok;
    } else {
      ok = pass("third-party guide has no upstream host URLs") && ok;
    }
  }

  {
    const { res, body } = await ctx.getJson("/v1/models");
    const rows = Array.isArray(body?.data) ? body.data : [];
    const ids = new Set(rows.map((r) => r.id));
    const missing = REQUIRED_MODEL_IDS.filter((id) => !ids.has(id));
    if (res.status !== 200 || missing.length) {
      ok =
        fail(
          "GET /v1/models",
          `HTTP ${res.status} missing=${missing.join(",")}`
        ) && ok;
    } else {
      ok = pass("GET /v1/models Tokfai registry") && ok;
    }
  }

  // Non-stream: string content + Cherry extras for key models
  for (const model of CHERRY_MODELS) {
    const { res, body } = await postChat(ctx, cherryBody({ model, stream: false }));
    const content = body?.choices?.[0]?.message?.content;
    const requestId = body?.request_id ?? body?.tokfai?.request_id;
    const credits = body?.tokfai?.credits_charged;
    if (
      res.status !== 200 ||
      typeof content !== "string" ||
      !content.length ||
      requestId == null ||
      credits === undefined
    ) {
      ok =
        fail(
          `chat non-stream ${model} + Cherry fields`,
          `HTTP ${res.status} code=${body?.error?.code} content=${typeof content}`
        ) && ok;
    } else {
      ok = pass(`chat non-stream ${model} + Cherry fields`) && ok;
    }
  }

  // Content parts array (Cherry / AI SDK multimodal text parts)
  {
    const { res, body } = await postChat(
      ctx,
      cherryBody({
        model: "gpt-5.5",
        stream: false,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Say ok only." }],
          },
        ],
        temperature: null,
        top_p: null,
      })
    );
    const content = body?.choices?.[0]?.message?.content;
    if (res.status !== 200 || typeof content !== "string" || !content.length) {
      ok =
        fail(
          "chat content parts array + null sampling",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok = pass("chat content parts array + null sampling") && ok;
    }
  }

  // Stream=true for GPT + Gemini
  for (const model of ["gpt-5.5", "gpt-5.4-pro", "gpt-5-pro", "gemini-3-pro"]) {
    const { res, body, text } = await postChat(
      ctx,
      cherryBody({
        model,
        stream: true,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Say ok only." }],
          },
        ],
      })
    );
    // When SSE, body may be null; use text
    const raw = text ?? (typeof body === "string" ? body : "");
    ok =
      assertSseOk(
        res,
        raw,
        `chat stream=true ${model} (SSE chunk + [DONE])`
      ) && ok;
  }

  // Unknown model — must be model_not_available with readable message
  {
    const { res, body } = await postChat(
      ctx,
      cherryBody({
        model: "not-a-real-tokfai-model-zzz",
        stream: false,
      })
    );
    if (res.status !== 400 || body?.error?.code !== "model_not_available") {
      ok =
        fail(
          "unknown model → model_not_available",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok =
        assertErrorEnvelope(
          body,
          "unknown model error envelope (no undefined)"
        ) && ok;
    }
  }

  // Profile baseline (gpt-5.4-pro → gpt-5-pro)
  {
    const { res, body } = await postChat(ctx, profile.chatBody);
    const resolved = body?.tokfai?.resolved_model;
    const content = body?.choices?.[0]?.message?.content;
    if (
      res.status !== 200 ||
      !content ||
      (profile.expectResolved && resolved !== profile.expectResolved)
    ) {
      ok =
        fail(
          "profile chat/completions contract",
          `HTTP ${res.status} resolved=${resolved}`
        ) && ok;
    } else {
      ok =
        pass(
          `profile chat/completions → resolved=${resolved}`
        ) && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok
    ? `\n${profile.passToken}`
    : `\n${profile.failToken}`
);
process.exit(ok ? 0 : 1);
