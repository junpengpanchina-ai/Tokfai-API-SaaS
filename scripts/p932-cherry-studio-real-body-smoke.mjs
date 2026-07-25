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
import { UPSTREAM_DEGRADED_CODES } from "./lib/public-beta-live-helpers.mjs";

const SCRIPT = "scripts/p932-cherry-studio-real-body-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_TOKEN = "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS";
const FAIL_TOKEN = "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_FAIL";

const CHERRY_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-pro", "gemini-3-pro"];
/** Must return assistant content + [DONE] — never 30s ping-only hang. */
const GEMINI_25_FLASH_STREAM_MODEL = "gemini-2.5-flash";
const PROMPT = "Return exactly: TOKFAI_CHERRY_OK";
const CHAT_ROUTE = "/v1/chat/completions";
/** Cherry compatibility required live probes: initial attempt + 1 retry. */
const CHERRY_PROBE_MAX_ATTEMPTS = 2;

function isUpstreamChannelDegraded(code) {
  return typeof code === "string" && UPSTREAM_DEGRADED_CODES.has(code);
}

/** Recover error object from JSON body or mid-stream SSE error frame. */
function extractProbeError(body, text) {
  if (body?.error && typeof body.error === "object" && !Array.isArray(body.error)) {
    return body.error;
  }
  const raw = typeof text === "string" ? text : "";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.error && typeof parsed.error === "object") {
        return parsed.error;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function softPassUpstreamDegraded(label, code, message, requestId) {
  console.warn(
    `DEGRADED  ${label} — upstream channel unavailable (not Cherry schema failure) code=${code} message=${message || "none"} request_id=${requestId || "none"}`
  );
  return pass(`${label} (upstream degraded soft-ok)`);
}

function isTimeoutName(name) {
  return name === "TimeoutError" || name === "AbortError";
}

function classifyTimeoutCode(body, timedOut) {
  const code =
    typeof body?.error?.code === "string" ? body.error.code.trim() : "";
  if (code === "upstream_timeout" || code === "upstream_timeout_policy") {
    return "upstream_timeout_policy";
  }
  if (timedOut || code === "network_timeout") return "network_timeout";
  return null;
}

function probeErrorFields(result) {
  const timedOut = result?.timedOut === true;
  const timeoutCode = classifyTimeoutCode(result?.body, timedOut);
  if (timeoutCode) {
    const msg =
      (typeof result?.errorMessage === "string" && result.errorMessage.trim()) ||
      (typeof result?.body?.error?.message === "string" &&
        result.body.error.message.trim()) ||
      "TimeoutError";
    return {
      errorCode: timeoutCode,
      errorMessage: msg === "undefined" || msg === "null" ? "TimeoutError" : msg,
    };
  }
  const code =
    (typeof result?.body?.error?.code === "string" &&
      result.body.error.code.trim()) ||
    "none";
  const message =
    (typeof result?.body?.error?.message === "string" &&
      result.body.error.message.trim()) ||
    "none";
  return {
    errorCode: code === "undefined" ? "none" : code,
    errorMessage: message === "undefined" || message === "null" ? "none" : message,
  };
}

function logProbe({
  model,
  route = CHAT_ROUTE,
  stream,
  status,
  errorCode,
  errorMessage,
  attempt,
}) {
  const bits = [
    `model=${model || "(none)"}`,
    `route=${route}`,
    `stream=${stream === true ? "true" : "false"}`,
    `status=${status ?? "none"}`,
    `errorCode=${errorCode || "none"}`,
    `errorMessage=${errorMessage || "none"}`,
  ];
  if (attempt != null) bits.push(`attempt=${attempt}`);
  console.log(`PROBE  ${bits.join(" ")}`);
}

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

/** SSE success with real assistant content — rejects mid-stream error envelopes. */
function assertSseContentOk(res, text, label) {
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
  if (/"error"\s*:\s*\{/.test(text) || /invalid_request_error/.test(text)) {
    return fail(
      label,
      `SSE error envelope after first frame: ${text.slice(0, 280)}`
    );
  }
  // Non-empty delta.content (role frame has content:"").
  if (!/"delta"\s*:\s*\{[^}]*"content"\s*:\s*"[^"]+/.test(text)) {
    return fail(
      label,
      `missing non-empty assistant content: ${text.slice(0, 280)}`
    );
  }
  return pass(label);
}

async function postChat(ctx, body) {
  return acceptanceFetch(`${ctx.BASE}${CHAT_ROUTE}`, {
    method: "POST",
    headers: ctx.authHeaders({
      "User-Agent": "CherryStudio/1.0 TokfaiP932RealBodySmoke",
    }),
    body: JSON.stringify(body),
    timeoutMs: ctx.TIMEOUT_MS,
  });
}

/**
 * Run a Cherry live probe with structured logging + 1 timeout retry.
 * Never throws TimeoutError/AbortError — always returns boolean ok.
 */
async function runCherryLiveProbe(ctx, {
  label,
  model,
  body,
  evaluate,
}) {
  const stream = body?.stream === true;
  let lastDetail = "";

  for (let attempt = 1; attempt <= CHERRY_PROBE_MAX_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await postChat(ctx, body);
    } catch (err) {
      const name =
        err && typeof err === "object" && typeof err.name === "string"
          ? err.name
          : "Error";
      const timedOut = isTimeoutName(name);
      const errorCode = timedOut ? "network_timeout" : "probe_error";
      const errorMessage = timedOut
        ? "TimeoutError"
        : typeof err?.message === "string" && err.message.trim()
          ? err.message.trim().slice(0, 180)
          : name;
      logProbe({
        model,
        stream,
        status: "throw",
        errorCode,
        errorMessage,
        attempt,
      });
      lastDetail = `model=${model} error=${errorMessage} / ${errorCode}`;
      if (timedOut && attempt < CHERRY_PROBE_MAX_ATTEMPTS) {
        console.log(
          `RETRY  ${label} after ${errorCode} (attempt ${attempt}/${CHERRY_PROBE_MAX_ATTEMPTS})`
        );
        continue;
      }
      return fail(label, lastDetail);
    }

    const { errorCode, errorMessage } = probeErrorFields(result);
    logProbe({
      model,
      stream,
      status: result.res?.status ?? "none",
      errorCode,
      errorMessage,
      attempt,
    });

    const timedOut =
      result.timedOut === true ||
      errorCode === "network_timeout" ||
      errorCode === "upstream_timeout_policy";

    if (timedOut) {
      lastDetail = `model=${model} error=TimeoutError / ${errorCode}`;
      if (attempt < CHERRY_PROBE_MAX_ATTEMPTS) {
        console.log(
          `RETRY  ${label} after ${errorCode} (attempt ${attempt}/${CHERRY_PROBE_MAX_ATTEMPTS})`
        );
        continue;
      }
      return fail(label, lastDetail);
    }

    const verdict = evaluate(result);
    if (verdict === true) return true;
    // evaluate already printed FAIL when false; allow retry only for soft transport issues
    if (typeof verdict === "object" && verdict?.retryable && attempt < CHERRY_PROBE_MAX_ATTEMPTS) {
      console.log(
        `RETRY  ${label} after retryable failure (attempt ${attempt}/${CHERRY_PROBE_MAX_ATTEMPTS})`
      );
      continue;
    }
    return false;
  }

  return fail(label, lastDetail || `model=${model} error=TimeoutError / network_timeout`);
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
    const reqBody = cherryRealBody(model);
    const probeOk = await runCherryLiveProbe(ctx, {
      label: `Cherry real stream body ${model} → SSE + [DONE]`,
      model,
      body: reqBody,
      evaluate: ({ res, body, text }) => {
        const raw = text ?? (typeof body === "string" ? body : "");
        const errObj = extractProbeError(body, raw);
        const code =
          (typeof errObj?.code === "string" && errObj.code.trim()) ||
          (typeof body?.error?.code === "string" && body.error.code.trim()) ||
          "";
        const message =
          (typeof errObj?.message === "string" && errObj.message.trim()) ||
          (typeof body?.error?.message === "string" &&
            body.error.message.trim()) ||
          "";
        const requestId =
          body?.request_id ||
          errObj?.request_id ||
          body?.error?.request_id ||
          res.headers?.get?.("x-request-id") ||
          null;

        // GPT channel / capacity outages must not be treated as Cherry schema FAIL.
        if (isUpstreamChannelDegraded(code)) {
          if (
            !code.trim() ||
            !message.trim() ||
            message === "undefined" ||
            code === "invalid_request_error"
          ) {
            return fail(
              `Cherry real stream body ${model}`,
              `degraded envelope invalid code=${code || "none"} message=${message || "none"}`
            );
          }
          return softPassUpstreamDegraded(
            `Cherry real stream body ${model}`,
            code,
            message,
            requestId
          );
        }

        if (res.status === 400 || code === "invalid_request_error") {
          assertErrorEnvelope(
            body?.error ? body : { error: errObj || body?.error },
            `stream ${model} must not 400 (got envelope)`
          );
          return fail(
            `Cherry real stream body ${model}`,
            `HTTP ${res.status} code=${code || body?.error?.code || "none"} message=${message || body?.error?.message || "none"}`
          );
        }
        return assertSseOk(
          res,
          raw,
          `Cherry real stream body ${model} → SSE + [DONE]`
        );
      },
    });
    ok = probeOk && ok;
  }

  // gemini-2.5-flash stream must synthesize content + [DONE] (not ping-only hang).
  {
    const model = GEMINI_25_FLASH_STREAM_MODEL;
    const probeOk = await runCherryLiveProbe(ctx, {
      label: `gemini-2.5-flash stream → content + [DONE]`,
      model,
      body: cherryRealBody(model, { max_tokens: 32, max_completion_tokens: 32 }),
      evaluate: ({ res, body, text }) => {
        const raw = text ?? "";
        const errObj = extractProbeError(body, raw);
        const code =
          (typeof errObj?.code === "string" && errObj.code.trim()) || "";
        if (isUpstreamChannelDegraded(code)) {
          return softPassUpstreamDegraded(
            "gemini-2.5-flash stream",
            code,
            errObj?.message,
            body?.request_id || errObj?.request_id
          );
        }
        if (/^: ping/m.test(raw) && !/"delta"\s*:\s*\{[^}]*"content"\s*:\s*"[^"]+/.test(raw)) {
          return fail(
            "gemini-2.5-flash stream",
            `ping-only / missing content: ${raw.slice(0, 280)}`
          );
        }
        return assertSseContentOk(
          res,
          raw,
          "gemini-2.5-flash stream → content + [DONE]"
        );
      },
    });
    ok = probeOk && ok;
  }

  // max_completion_tokens only (no max_tokens) + null sampling
  {
    const reqBody = cherryRealBody("gpt-5.5", {
      max_tokens: undefined,
      max_completion_tokens: 32,
      temperature: null,
      top_p: null,
    });
    const probeOk = await runCherryLiveProbe(ctx, {
      label: "max_completion_tokens-only Cherry stream",
      model: "gpt-5.5",
      body: reqBody,
      evaluate: ({ res, body, text }) => {
        const raw = text ?? "";
        const errObj = extractProbeError(body, raw);
        const code =
          (typeof errObj?.code === "string" && errObj.code.trim()) ||
          (typeof body?.error?.code === "string" && body.error.code.trim()) ||
          "";
        if (isUpstreamChannelDegraded(code)) {
          return softPassUpstreamDegraded(
            "max_completion_tokens-only stream",
            code,
            errObj?.message || body?.error?.message,
            body?.request_id || errObj?.request_id
          );
        }
        if (res.status !== 200) {
          return fail(
            "max_completion_tokens-only stream",
            `HTTP ${res.status} code=${code || "none"} message=${errObj?.message || body?.error?.message || "none"}`
          );
        }
        return assertSseContentOk(
          res,
          raw,
          "max_completion_tokens-only Cherry stream"
        );
      },
    });
    ok = probeOk && ok;
  }

  // Empty / non-array messages → 200 not-billable noop (Cherry Studio compat)
  {
    const probeOk = await runCherryLiveProbe(ctx, {
      label: "empty messages → 200 not_billable noop",
      model: "gpt-5.5",
      body: {
        model: "gpt-5.5",
        stream: false,
        messages: [],
        tools: [],
        tool_choice: null,
      },
      evaluate: ({ res, body }) => {
        if (res.status !== 200) {
          return fail(
            "empty messages noop → 200",
            `HTTP ${res.status} code=${body?.error?.code || "none"} message=${body?.error?.message || "none"}`
          );
        }
        if (
          body?.choices?.[0]?.message?.content !== "请求内容为空，请重新输入。" ||
          body?.tokfai?.billing_status !== "not_billable" ||
          body?.tokfai?.rejectedReason !== "empty_messages"
        ) {
          return fail(
            "empty messages noop body",
            JSON.stringify({
              content: body?.choices?.[0]?.message?.content,
              tokfai: body?.tokfai,
            }).slice(0, 240)
          );
        }
        return pass("empty messages → 200 not_billable noop");
      },
    });
    ok = probeOk && ok;
  }

  {
    const probeOk = await runCherryLiveProbe(ctx, {
      label: "non-array messages stream → SSE empty noop",
      model: "gpt-5.5",
      body: {
        model: "gpt-5.5",
        stream: true,
        messages: "not-an-array",
        tools: [],
        tool_choice: null,
      },
      evaluate: ({ res, text }) => {
        const raw = typeof text === "string" ? text : "";
        if (
          !assertSseOk(res, raw, "non-array messages stream → SSE noop") ||
          !raw.includes("请求内容为空，请重新输入。")
        ) {
          if (!raw.includes("请求内容为空，请重新输入。")) {
            return fail("non-array messages SSE content", raw.slice(0, 240));
          }
          return false;
        }
        return pass("non-array messages stream → SSE empty noop");
      },
    });
    ok = probeOk && ok;
  }

  // Truly invalid request → concrete OpenAI error (never undefined)
  {
    const probeOk = await runCherryLiveProbe(ctx, {
      label: "invalid request error envelope (no undefined)",
      model: "__tokfai_mock_invalid_request",
      body: {
        model: "__tokfai_mock_invalid_request",
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      },
      evaluate: ({ res, body }) => {
        if (res.status !== 400) {
          return fail(
            "invalid request → 400",
            `HTTP ${res.status} code=${body?.error?.code || "none"} message=${body?.error?.message || "none"}`
          );
        }
        let localOk = assertErrorEnvelope(
          body,
          "invalid request error envelope (no undefined)"
        );
        if (body?.error?.code !== "invalid_request_error") {
          localOk =
            fail(
              "invalid request code",
              `code=${body?.error?.code || "none"}`
            ) && localOk;
        } else {
          localOk = pass("invalid request code=invalid_request_error") && localOk;
        }
        if (!body?.request_id && !body?.error?.request_id) {
          localOk = fail("invalid request has request_id", "missing") && localOk;
        } else {
          localOk = pass("invalid request includes request_id") && localOk;
        }
        return localOk;
      },
    });
    ok = probeOk && ok;
  }
} catch (err) {
  const name =
    err && typeof err === "object" && typeof err.name === "string"
      ? err.name
      : "Error";
  const timedOut = isTimeoutName(name);
  const errorCode = timedOut ? "network_timeout" : "probe_error";
  const errorMessage = timedOut
    ? "TimeoutError"
    : typeof err?.message === "string" && err.message.trim()
      ? err.message.trim().slice(0, 240)
      : name;
  logProbe({
    model: "(uncaught)",
    stream: false,
    status: "throw",
    errorCode,
    errorMessage,
  });
  ok =
    fail(
      "p932 uncaught probe exception",
      `model=(uncaught) error=${errorMessage} / ${errorCode}`
    ) && false;
} finally {
  ctx.cleanup();
}

console.log(ok ? `\n${PASS_TOKEN}` : `\n${FAIL_TOKEN}`);
process.exit(ok ? 0 : 1);
