#!/usr/bin/env node
/**
 * P932 — Cherry Studio real chat stream body smoke.
 *
 * Simulates the OpenAI-compatible payload Cherry Studio / AI SDK actually
 * sends for manual chat (stream=true + content parts + null optionals).
 *
 * Covers models: gpt-5.5, gpt-5.4, gpt-5.4-pro, gemini-3-pro
 *
 * Default: offline mock. LIVE=1 may call https://api.tokfai.com.
 *
 * Usage: node scripts/p932-cherry-studio-real-body-smoke.mjs
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

const SCRIPT = "scripts/p932-cherry-studio-real-body-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_TOKEN = "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS";
const FAIL_TOKEN = "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_FAIL";

const CHERRY_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-pro", "gemini-3-pro"];
const PROMPT = "Return exactly: TOKFAI_CHERRY_OK";

/** Real Cherry Studio / AI SDK-ish chat stream body. */
function cherryRealBody(model, overrides = {}) {
  return {
    model,
    stream: true,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: PROMPT }],
      },
    ],
    tools: [],
    tool_choice: null,
    stream_options: { include_usage: true },
    temperature: null,
    top_p: null,
    presence_penalty: null,
    frequency_penalty: null,
    response_format: null,
    max_tokens: 64,
    max_completion_tokens: 64,
    enable_thinking: false,
    provider_options: { cherry: true },
    extra_body: { ignored: true },
    metadata: { source: "p932-cherry-real-body" },
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
    message === "null" ||
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
      `HTTP ${res.status} ct=${ct} hasChunk=${text.includes("chat.completion.chunk")} done=${/\[DONE\]/.test(text)} body=${text.slice(0, 240)}`
    );
  }
  return pass(label);
}

async function postChat(ctx, body) {
  return acceptanceFetch(`${ctx.BASE}/v1/chat/completions`, {
    method: "POST",
    headers: ctx.authHeaders({
      "User-Agent": "CherryStudio/1.0 TokfaiP932RealBodySmoke",
    }),
    body: JSON.stringify(body),
    timeoutMs: ctx.TIMEOUT_MS,
  });
}

function runDiagnosticsUnit() {
  const source = `
import { ChatCompletionRequestSchema } from "./src/lib/executeChatCompletion.ts";
import { sanitizeUpstreamChatBody } from "./src/lib/chatCompletionCompat.ts";
import {
  chatBodyKeys,
  chatContentShape,
  formatZodIssues,
  safeInvalidRequestMessage,
} from "./src/lib/chatCompletionDiagnostics.ts";

function assert(cond, msg) {
  if (!cond) { console.error("FAIL  " + msg); process.exit(1); }
  console.log("PASS  " + msg);
}

const body = {
  model: "gpt-5.5",
  stream: true,
  messages: [{ role: "user", content: [{ type: "text", text: "Return exactly: TOKFAI_CHERRY_OK" }] }],
  tools: [],
  tool_choice: null,
  stream_options: { include_usage: true },
  temperature: null,
  top_p: null,
  presence_penalty: null,
  frequency_penalty: null,
  response_format: null,
  max_tokens: "64",
  max_completion_tokens: null,
  enable_thinking: false,
  provider_options: { cherry: true },
  extra_body: { ignored: true },
};

const parsed = ChatCompletionRequestSchema.safeParse(body);
assert(parsed.success === true, "Cherry real body parses (nulls + string max_tokens)");
assert(parsed.data.temperature === undefined, "temperature null stripped");
assert(parsed.data.tool_choice === null, "tool_choice null retained at schema");
assert(parsed.data.max_tokens === 64, "string max_tokens coerced");
assert(parsed.data.stream === true, "stream true");

const sanitized = sanitizeUpstreamChatBody(parsed.data, "gpt-5.5");
assert(sanitized.ok === true, "sanitize ok");
assert(sanitized.upstream.tools === undefined, "empty tools not forwarded");
assert(sanitized.upstream.tool_choice === undefined, "null tool_choice not forwarded");
assert(sanitized.upstream.response_format === undefined, "null response_format not forwarded");
assert(sanitized.upstream.stream_options === undefined, "stream_options not forwarded");
assert(sanitized.upstream.temperature === undefined, "gpt temperature stripped");
assert(sanitized.upstream.stream === false, "upstream stream false");
assert(
  Array.isArray(sanitized.upstream.messages) &&
    sanitized.upstream.messages[0].content === "Return exactly: TOKFAI_CHERRY_OK",
  "content parts flattened"
);

const gemSan = sanitizeUpstreamChatBody(parsed.data, "gemini-3-pro");
assert(gemSan.ok === true, "gemini sanitize ok");
assert(gemSan.upstream.tool_choice === undefined, "gemini tool_choice stripped");
assert(gemSan.upstream.temperature === undefined, "gemini null temperature stripped");
assert(!Object.values(gemSan.upstream).includes(null), "gemini no nulls");

const gpt54San = sanitizeUpstreamChatBody(parsed.data, "gpt-5");
assert(gpt54San.ok === true, "gpt-5 (alias target) sanitize ok");
assert(gpt54San.upstream.temperature === undefined, "alias-target temperature stripped");
assert(gpt54San.upstream.tool_choice === undefined, "alias-target tool_choice stripped");

assert(chatContentShape(body.messages) === "array[text]", "contentShape array[text]");
assert(chatBodyKeys(body).includes("tool_choice"), "bodyKeys includes tool_choice");
assert(
  safeInvalidRequestMessage("undefined", "Invalid chat completion request.") ===
    "Invalid chat completion request.",
  "undefined → fallback"
);
assert(
  safeInvalidRequestMessage("  ", "Invalid chat completion request.") ===
    "Invalid chat completion request.",
  "blank → fallback"
);
assert(
  safeInvalidRequestMessage("messages must be a non-empty array.") ===
    "messages must be a non-empty array.",
  "concrete reason kept"
);

const bad = ChatCompletionRequestSchema.safeParse({ model: "gpt-5.5", messages: "nope" });
assert(bad.success === false, "invalid messages still rejected");
assert(formatZodIssues(bad.error).length > 0, "zodIssues formatted");

console.log("TOKFAI_P932_DIAG_UNIT_PASS");
`;

  const tsxBin = join(ROOT, "apps/dmit-api/node_modules/.bin/tsx");
  const result = spawnSync(tsxBin, ["--eval", source], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL ?? "https://example.supabase.co",
      SUPABASE_JWT_SECRET:
        process.env.SUPABASE_JWT_SECRET ?? "xxxxxxxxxxxxxxxxxxxx",
      TOKEN_PEPPER:
        process.env.TOKEN_PEPPER ?? "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      GRSAI_API_KEY: process.env.GRSAI_API_KEY ?? "test-key",
      STRIPE_WEBHOOK_SECRET:
        process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test",
    },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

console.log("=== P932 Cherry Studio real body smoke ===\n");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  if (!runDiagnosticsUnit()) {
    ok = fail("p932 schema/sanitize/diagnostics unit", "unit failed") && ok;
  } else {
    ok = pass("p932 schema/sanitize/diagnostics unit") && ok;
  }

  {
    const chatRoute = readFileSync(
      join(ROOT, "apps/dmit-api/src/routes/chat.ts"),
      "utf8"
    );
    const diag = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/chatCompletionDiagnostics.ts"),
      "utf8"
    );
    const logger = readFileSync(
      join(ROOT, "apps/dmit-api/src/logger.ts"),
      "utf8"
    );
    const schema = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
      "utf8"
    );
    const staticOk =
      chatRoute.includes("logChatCompletionInvalidRequest") &&
      chatRoute.includes("respondApiError") &&
      diag.includes("contentShape") &&
      diag.includes("rejectedReason") &&
      diag.includes("bodyKeys") &&
      diag.includes("requestedModel") &&
      diag.includes("resolvedModel") &&
      logger.includes("contentShape") &&
      logger.includes("zodErrors") &&
      logger.includes("requestedModel") &&
      schema.includes("coerceOptionalFiniteNumberInput") &&
      schema.includes("coerceOptionalPositiveIntInput");
    if (!staticOk) {
      ok =
        fail(
          "static Cherry 400 diagnostics + coerce hooks",
          "missing log/diag/coerce"
        ) && ok;
    } else {
      ok = pass("static Cherry 400 diagnostics + coerce hooks") && ok;
    }
  }

  for (const model of CHERRY_MODELS) {
    const { res, body, text } = await postChat(ctx, cherryRealBody(model));
    const raw = text ?? (typeof body === "string" ? body : "");

    if (res.status === 400) {
      ok =
        assertErrorEnvelope(
          body,
          `stream ${model} must not 400 (got envelope)`
        ) && ok;
      ok =
        fail(
          `Cherry real stream body ${model}`,
          `HTTP 400 code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
      continue;
    }

    ok =
      assertSseOk(res, raw, `Cherry real stream body ${model} → SSE + [DONE]`) &&
      ok;
  }

  // max_completion_tokens only (no max_tokens) + null sampling
  {
    const { res, text, body } = await postChat(
      ctx,
      cherryRealBody("gpt-5.5", {
        max_tokens: undefined,
        max_completion_tokens: 32,
        temperature: null,
        top_p: null,
      })
    );
    // JSON.stringify drops undefined max_tokens
    const raw = text ?? "";
    if (res.status !== 200) {
      ok =
        fail(
          "max_completion_tokens-only stream",
          `HTTP ${res.status} code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
    } else {
      ok =
        assertSseOk(
          res,
          raw,
          "max_completion_tokens-only Cherry stream"
        ) && ok;
    }
  }

  // Empty / non-array messages → 200 not-billable noop (Cherry Studio compat)
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [],
      tools: [],
      tool_choice: null,
    });
    if (res.status !== 200) {
      ok =
        fail("empty messages noop → 200", `HTTP ${res.status}`) && ok;
    } else if (
      body?.choices?.[0]?.message?.content !== "请求内容为空，请重新输入。" ||
      body?.tokfai?.billing_status !== "not_billable" ||
      body?.tokfai?.rejectedReason !== "empty_messages"
    ) {
      ok =
        fail(
          "empty messages noop body",
          JSON.stringify({
            content: body?.choices?.[0]?.message?.content,
            tokfai: body?.tokfai,
          }).slice(0, 240)
        ) && ok;
    } else {
      ok = pass("empty messages → 200 not_billable noop") && ok;
    }
  }

  {
    const { res, body: _body, text } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: true,
      messages: "not-an-array",
      tools: [],
      tool_choice: null,
    });
    const raw = typeof text === "string" ? text : "";
    if (
      !assertSseOk(res, raw, "non-array messages stream → SSE noop") ||
      !raw.includes("请求内容为空，请重新输入。")
    ) {
      if (!raw.includes("请求内容为空，请重新输入。")) {
        ok =
          fail(
            "non-array messages SSE content",
            raw.slice(0, 240)
          ) && ok;
      } else {
        ok = false;
      }
    } else {
      ok = pass("non-array messages stream → SSE empty noop") && ok;
    }
  }

  // Truly invalid request → concrete OpenAI error (never undefined)
  {
    const { res, body } = await postChat(ctx, {
      model: "__tokfai_mock_invalid_request",
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    });
    if (res.status !== 400) {
      ok =
        fail(
          "invalid request → 400",
          `HTTP ${res.status}`
        ) && ok;
    } else {
      ok =
        assertErrorEnvelope(
          body,
          "invalid request error envelope (no undefined)"
        ) && ok;
      if (body?.error?.code !== "invalid_request_error") {
        ok =
          fail(
            "invalid request code",
            `code=${body?.error?.code}`
          ) && ok;
      } else {
        ok = pass("invalid request code=invalid_request_error") && ok;
      }
      if (!body?.request_id && !body?.error?.request_id) {
        ok = fail("invalid request has request_id", "missing") && ok;
      } else {
        ok = pass("invalid request includes request_id") && ok;
      }
    }
  }
} finally {
  ctx.cleanup();
}

console.log(ok ? `\n${PASS_TOKEN}` : `\n${FAIL_TOKEN}`);
process.exit(ok ? 0 : 1);
