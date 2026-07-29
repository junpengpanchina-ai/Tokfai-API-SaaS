#!/usr/bin/env node
/**
 * Internal operator / offline acceptance only — not customer documentation.
 *
 * P786 — local mock OpenAI-compatible gateway for offline customer acceptance.
 *
 * Usage:
 *   node scripts/p786-offline-customer-mock.mjs
 *   MOCK_PORT=8787 MOCK_API_KEY=sk-tokfai_... node scripts/p786-offline-customer-mock.mjs
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const HOST = process.env.MOCK_HOST ?? "127.0.0.1";
const PORT = parseInt(process.env.MOCK_PORT ?? "8787", 10);
const VALID_KEY =
  process.env.MOCK_API_KEY ?? `sk-tokfai_${"a".repeat(48)}`;

/** @type {Map<string, { id: string; status: string; items: unknown[]; model: string }>} */
const batches = new Map();

/** @type {Map<string, {
 *   id: string;
 *   userKey: string;
 *   status: string;
 *   progress: number;
 *   message: { en: string; zh: string };
 *   model: string;
 *   data: unknown[];
 *   usage: { credits_charged: number };
 *   error: null | { code: string; message: string };
 * }>} */
const imageTasks = new Map();

/** P969: Idempotency-Key → successful chat completion snapshot (offline only). */
/** @type {Map<string, { requestId: string, creditsCharged: number, body: Record<string, unknown> }>} */
const chatIdempotency = new Map();

function makeRequestId() {
  return `req_mock_${randomBytes(8).toString("hex")}`;
}

function parseIdempotencyHeader(req) {
  const raw =
    req.headers["idempotency-key"] ?? req.headers["Idempotency-Key"] ?? "";
  const key = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Models accepted by the offline mock (catalog + aliases). */
const MOCK_ALLOWED_MODELS = new Set([
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
]);

/** Mirror apps/dmit-api consumer compatibility rewrites (offline mock). */
function resolveMockCanonicalModel(raw) {
  let value = String(raw ?? "auto-fast").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep
  }
  value = value.toLowerCase();
  value = value.replace(/^models\//, "").replace(/^openai\//, "");
  value = value.replace(/^google\//, "").replace(/^grsai\//, "");
  value = value.replace(/[_\s]+/g, "-").replace(/^gpt(\d)/, "gpt-$1");
  value = value.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const rewrites = {
    "gpt-5.4-pro": "gpt-5-pro",
    "gpt-5-4-pro": "gpt-5-pro",
    "gpt5.4-pro": "gpt-5-pro",
    "gpt-5.4pro": "gpt-5-pro",
    "gpt5.4pro": "gpt-5-pro",
    "gpt-5.4": "gpt-5",
    "gpt-5-4": "gpt-5",
    "gpt5.4": "gpt-5",
    gpt5: "gpt-5",
    "gpt5-pro": "gpt-5-pro",
    "gpt5.5": "gpt-5.5",
    "gpt-5.5-pro": "gpt-5.5",
    "gpt-5-5-pro": "gpt-5.5",
    "gpt-5.5pro": "gpt-5.5",
    "gpt-5-5": "gpt-5.5",
    "gemini-3-pro-preview": "gemini-3-pro",
    "gemini-2.5-flash-preview": "gemini-2.5-flash",
  };
  return rewrites[value] ?? value;
}

function isMockModelAllowed(raw) {
  const canonical = resolveMockCanonicalModel(raw);
  // Allow after rewrite if either raw normalized id or canonical is listed.
  let normalized = String(raw ?? "").trim().toLowerCase();
  normalized = normalized.replace(/^models\//, "").replace(/^openai\//, "");
  normalized = normalized.replace(/[_\s]+/g, "-").replace(/^gpt(\d)/, "gpt-$1");
  normalized = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (
    MOCK_ALLOWED_MODELS.has(canonical) || MOCK_ALLOWED_MODELS.has(normalized)
  );
}

function modelNotAvailableBody() {
  const requestId = makeRequestId();
  return {
    error: {
      message:
        "This model is not available on Tokfai. Please refresh model list or choose another Tokfai model.",
      code: "model_not_available",
      type: "invalid_request_error",
      request_id: requestId,
    },
    ...notBillableExtras(requestId),
  };
}

function imageModelNotForChatBody(requestId = makeRequestId()) {
  return {
    error: {
      message:
        "Image models cannot be used on /v1/chat/completions. Use POST /v1/images/generations.",
      code: "image_model_not_for_chat",
      type: "invalid_request_error",
      request_id: requestId,
    },
    ...notBillableExtras(requestId),
  };
}

/**
 * Offline-only error triggers for client error-copy smoke (p914).
 * Never hit production; model ids are reserved for mock gateways.
 */
function notBillableExtras(requestId) {
  return {
    request_id: requestId,
    credits_charged: 0,
    tokfai: {
      request_id: requestId,
      credits_charged: 0,
      billing_status: "not_billable",
    },
  };
}

function mockErrorForModel(rawModel) {
  const id = String(rawModel ?? "").trim();
  const table = {
    "__tokfai_mock_insufficient_credits": {
      status: 402,
      code: "insufficient_credits",
      type: "billing_error",
      message:
        "Insufficient balance. Please top up credits in the Tokfai dashboard.",
    },
    "__tokfai_mock_rate_limited": {
      status: 429,
      code: "too_many_requests",
      type: "rate_limit_error",
      message: "Rate limited. Please reduce request rate and retry.",
    },
    "__tokfai_mock_upstream_busy": {
      status: 503,
      code: "upstream_model_busy",
      type: "upstream_error",
      message:
        "Model is busy on Tokfai. Please retry shortly or choose another Tokfai model.",
    },
    "__tokfai_mock_upstream_timeout": {
      status: 504,
      code: "upstream_timeout",
      type: "upstream_error",
      message: "Upstream timed out. Please retry after a short wait.",
    },
    "__tokfai_mock_upstream_error": {
      status: 502,
      code: "upstream_error",
      type: "upstream_error",
      message: "Upstream error on Tokfai. Please retry shortly.",
    },
    "__tokfai_mock_invalid_request": {
      status: 400,
      code: "invalid_request_error",
      type: "invalid_request_error",
      message: "Invalid request.",
    },
  };
  const hit = table[id];
  if (!hit) return null;
  const requestId = makeRequestId();
  return {
    status: hit.status,
    body: {
      error: {
        message: hit.message,
        code: hit.code,
        type: hit.type,
        request_id: requestId,
      },
      ...notBillableExtras(requestId),
    },
  };
}

function tokfaiMeta(requestedModel = "auto-fast", resolvedModel = "gemini-3-flash") {
  const requestId = makeRequestId();
  const creditsCharged = 0.000001;
  return {
    request_id: requestId,
    credits_charged: creditsCharged,
    tokfai: {
      request_id: requestId,
      credits_charged: creditsCharged,
      requested_model: requestedModel,
      resolved_model: resolvedModel,
      billing_status: "charged",
    },
  };
}

function parseBearer(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function authFailure(code, message) {
  const requestId = makeRequestId();
  return {
    status: 401,
    body: {
      error: { message, code, type: "auth_error" },
      request_id: requestId,
    },
  };
}

const MOCK_BACKPRESSURE = process.env.MOCK_BACKPRESSURE === "1";
const CHAT_CONCURRENCY_LIMIT = parseInt(process.env.CHAT_CONCURRENCY_LIMIT ?? "0", 10);
const IMAGE_CONCURRENCY_LIMIT = parseInt(process.env.IMAGE_CONCURRENCY_LIMIT ?? "0", 10);
const BATCH_CONCURRENCY_LIMIT = parseInt(process.env.BATCH_CONCURRENCY_LIMIT ?? "0", 10);

let chatInFlight = 0;
let imageInFlight = 0;
let batchInFlight = 0;

function rateLimitedResponse(code) {
  const requestId = makeRequestId();
  const status = code === "too_many_requests" ? 429 : 503;
  return {
    status,
    body: {
      error: {
        message:
          code === "too_many_requests"
            ? "Too many concurrent requests."
            : "Gateway temporarily overloaded.",
        code,
        type: "rate_limit_error",
      },
      request_id: requestId,
    },
  };
}

function acquireConcurrencySlot(kind) {
  if (!MOCK_BACKPRESSURE) return { ok: true };
  const limits = {
    chat: CHAT_CONCURRENCY_LIMIT,
    image: IMAGE_CONCURRENCY_LIMIT,
    batch: BATCH_CONCURRENCY_LIMIT,
  };
  const limit = limits[kind] ?? 0;
  if (!limit) return { ok: true };

  const counters = { chat: chatInFlight, image: imageInFlight, batch: batchInFlight };
  if (counters[kind] >= limit) {
    const code =
      kind === "image" && imageInFlight >= limit
        ? "gateway_overloaded"
        : "too_many_requests";
    return { ok: false, response: rateLimitedResponse(code) };
  }

  if (kind === "chat") chatInFlight += 1;
  if (kind === "image") imageInFlight += 1;
  if (kind === "batch") batchInFlight += 1;

  return {
    ok: true,
    release: () => {
      if (kind === "chat") chatInFlight = Math.max(0, chatInFlight - 1);
      if (kind === "image") imageInFlight = Math.max(0, imageInFlight - 1);
      if (kind === "batch") batchInFlight = Math.max(0, batchInFlight - 1);
    },
  };
}

function checkAuth(req, validKey = VALID_KEY) {
  const token = parseBearer(req);
  if (!token) {
    return authFailure("missing_token", "Missing Bearer token.");
  }
  if (token !== validKey) {
    return authFailure("invalid_token", "API key not recognised.");
  }
  return null;
}

function checkGeminiAuth(req, validKey = VALID_KEY) {
  const googHeader = req.headers["x-goog-api-key"];
  const googKey =
    typeof googHeader === "string"
      ? googHeader.trim()
      : Array.isArray(googHeader)
        ? String(googHeader[0] ?? "").trim()
        : "";
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const queryKey = url.searchParams.get("key")?.trim() ?? "";
  const token = googKey || queryKey || parseBearer(req);
  if (!token) {
    return authFailure("missing_token", "Missing API key.");
  }
  if (token !== validKey) {
    return authFailure("invalid_token", "API key not recognised.");
  }
  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendSse(res, bodyText) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.end(bodyText);
}

function chatCompletionToSse(completion) {
  const id = completion.id ?? `chatcmpl_mock`;
  const created = completion.created ?? Math.floor(Date.now() / 1000);
  const model = completion.model ?? "gemini-3-flash";
  const message = completion.choices?.[0]?.message ?? {};
  const content =
    typeof message.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : null;
  const finishReason =
    completion.choices?.[0]?.finish_reason ??
    (toolCalls ? "tool_calls" : "stop");
  const base = { id, object: "chat.completion.chunk", created, model };
  const chunks = [
    `data: ${JSON.stringify({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    })}\n\n`,
  ];
  if (content.length > 0) {
    chunks.push(
      `data: ${JSON.stringify({
        ...base,
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      })}\n\n`
    );
  }
  if (toolCalls) {
    const deltaToolCalls = toolCalls.map((tc, index) => ({
      index,
      id: tc?.id ?? `call_${index}`,
      type: tc?.type ?? "function",
      function: {
        name: tc?.function?.name ?? "",
        arguments: tc?.function?.arguments ?? "",
      },
    }));
    chunks.push(
      `data: ${JSON.stringify({
        ...base,
        choices: [
          {
            index: 0,
            delta: { tool_calls: deltaToolCalls },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  }
  chunks.push(
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    })}\n\n`
  );
  chunks.push("data: [DONE]\n\n");
  return chunks.join("");
}

function mockNormalizeChatContent(content) {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      if (typeof item.text === "string") parts.push(item.text);
      else if (typeof item.content === "string") parts.push(item.content);
    }
    return parts.join("");
  }
  if (typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
  }
  return "";
}

function mockNormalizeChatRole(role) {
  if (typeof role !== "string" || !role.trim()) return "user";
  const lower = role.trim().toLowerCase();
  if (lower === "developer") return "system";
  if (
    lower === "assistant" ||
    lower === "user" ||
    lower === "system" ||
    lower === "tool" ||
    lower === "function"
  ) {
    return lower;
  }
  return "user";
}

function mockChatContentShape(messages) {
  if (!Array.isArray(messages)) return "not_array";
  if (messages.length === 0) return "empty";
  return messages
    .map((raw) => {
      if (!raw || typeof raw !== "object") return "invalid_message";
      const content = raw.content;
      if (typeof content === "string") return "string";
      if (content === null) return "null";
      if (content === undefined) return "missing";
      if (Array.isArray(content)) {
        const partTypes = content.map((part) => {
          if (typeof part === "string") return "string";
          if (!part || typeof part !== "object") return typeof part;
          return typeof part.type === "string" && part.type.trim()
            ? part.type.trim()
            : typeof part.text === "string"
              ? "text"
              : "object";
        });
        return `array[${partTypes.join(",")}]`;
      }
      return typeof content;
    })
    .join("|");
}

/** Mirror apps/dmit-api normalizeClientChatCompletionBody (offline only). */
function mockNormalizeClientChatBody(rawBody) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { noop: false, body: rawBody };
  }
  const NULL_KEYS = [
    "temperature",
    "top_p",
    "presence_penalty",
    "frequency_penalty",
    "max_tokens",
    "max_completion_tokens",
    "tools",
    "tool_choice",
    "response_format",
    "stream_options",
  ];
  const body = { ...rawBody };
  for (const key of NULL_KEYS) {
    if (body[key] === null) delete body[key];
  }
  const messagesRaw = body.messages;
  if (
    messagesRaw === undefined ||
    messagesRaw === null ||
    !Array.isArray(messagesRaw) ||
    messagesRaw.length === 0
  ) {
    return { noop: true, body };
  }
  const normalizedMessages = [];
  for (const raw of messagesRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    normalizedMessages.push({
      ...raw,
      role: mockNormalizeChatRole(raw.role),
      content: mockNormalizeChatContent(raw.content),
    });
  }
  const hasText = normalizedMessages.some(
    (m) => typeof m.content === "string" && m.content.trim().length > 0
  );
  const hasToolPayload = normalizedMessages.some((m) => {
    const role = String(m.role ?? "");
    if (role === "tool" || role === "function") return true;
    if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true;
    if (typeof m.tool_call_id === "string" && m.tool_call_id.trim()) return true;
    return false;
  });
  const hasToolsArg = Array.isArray(body.tools) && body.tools.length > 0;
  if (!hasText && !hasToolPayload && !hasToolsArg) {
    return { noop: true, body: { ...body, messages: normalizedMessages } };
  }
  return { noop: false, body: { ...body, messages: normalizedMessages } };
}

function chatCompletionBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const resolvedModel = resolveMockCanonicalModel(requestedModel);
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  const firstContent = body.messages?.[0]?.content;
  const hasTools =
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (body.tool_choice != null && body.tool_choice !== "none");
  const content =
    typeof firstContent === "string" &&
    /TOKFAI_CHAT_ALIAS_READY/i.test(firstContent)
      ? "TOKFAI_CHAT_ALIAS_READY"
      : typeof firstContent === "string" &&
          /TOKFAI_CHERRY_OK/i.test(firstContent)
        ? "TOKFAI_CHERRY_OK"
        : hasTools
          ? null
          : "ok";

  if (hasTools) {
    const toolName =
      body.tools?.[0]?.function?.name &&
      typeof body.tools[0].function.name === "string"
        ? body.tools[0].function.name
        : "get_weather";
    return {
      id: `chatcmpl_${meta.request_id}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: resolvedModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_mock_p970",
                type: "function",
                function: {
                  name: toolName,
                  arguments: JSON.stringify({ location: "Shanghai" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      ...meta,
    };
  }

  return {
    id: `chatcmpl_${meta.request_id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    ...meta,
  };
}

function responsesBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const resolvedModel = resolveMockCanonicalModel(requestedModel);
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  const inputText =
    typeof body.input === "string"
      ? body.input
      : Array.isArray(body.input)
        ? JSON.stringify(body.input)
        : "";
  const outputText = /TOKFAI_ALIAS_READY/i.test(inputText)
    ? "TOKFAI_ALIAS_READY"
    : "ok";
  return {
    id: `resp_${meta.request_id}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: resolvedModel,
    output_text: outputText,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    ...meta,
  };
}

function responsesToSse(response) {
  const responseId = response.id ?? `resp_mock`;
  const model = response.model ?? "gemini-3-flash";
  const messageId = `msg_${String(responseId).replace(/^resp_/, "")}`;
  const outputText =
    typeof response.output_text === "string" && response.output_text.length > 0
      ? response.output_text
      : "ok";
  const event = (name, payload) =>
    `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  return [
    event("response.created", {
      type: "response.created",
      response: {
        id: responseId,
        object: "response",
        status: "in_progress",
        model,
      },
    }),
    event("response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: messageId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    }),
    event("response.content_part.added", {
      type: "response.content_part.added",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "" },
    }),
    event("response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      delta: outputText,
    }),
    event("response.output_text.done", {
      type: "response.output_text.done",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    }),
    event("response.content_part.done", {
      type: "response.content_part.done",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: outputText },
    }),
    event("response.output_item.done", {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: outputText }],
      },
    }),
    event("response.completed", {
      type: "response.completed",
      response: {
        id: responseId,
        object: "response",
        status: "completed",
        model,
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: outputText }],
          },
        ],
        output_text: outputText,
      },
    }),
    "data: [DONE]\n\n",
  ].join("");
}

function geminiGenerateContentBody(body, modelId = "gemini-2.5-flash") {
  const text =
    body?.contents?.[0]?.parts?.[0]?.text != null ? "ok" : "ok";
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
          role: "model",
        },
        finishReason: "STOP",
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 1,
      candidatesTokenCount: 1,
      totalTokenCount: 2,
    },
    modelVersion: modelId,
  };
}

function geminiGenerateContentToSse(response) {
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "ok";
  const usageMetadata = response?.usageMetadata ?? {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  };
  return [
    `data: ${JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text }], role: "model" },
          index: 0,
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: "" }], role: "model" },
          finishReason: "STOP",
          index: 0,
        },
      ],
      usageMetadata,
    })}\n\n`,
  ].join("");
}

/** Image/media models accepted by offline mock (capability routing). */
const MOCK_IMAGE_MODELS = new Set([
  "nano-banana",
  "nano-banana-fast",
  "nano-banana-2",
  "gpt-image-2",
  "gpt-image-2-vip",
]);

/** Temporarily unavailable / coming soon — mirror dmit-api UNAVAILABLE set. */
const MOCK_UNAVAILABLE_IMAGE_MODELS = new Set([
  "nano-banana-2-lite",
  "nano-banana-pro",
  "nano-banana-pro-vip",
  "nano-banana-pro-cl",
  "nano-banana-2-cl",
  "nano-banana-2-2k-cl",
  "nano-banana-2-4k-cl",
  "nano-banana-pro-4k-vip",
]);

/**
 * Tokfai public → upstream mapping (mock mirror of resolveImageUpstreamModel).
 * Public response still shows the requested model.
 */
function resolveMockImageUpstreamModel(model) {
  const m = String(model ?? "")
    .trim()
    .toLowerCase();
  if (m === "nano-banana") return "nano-banana-fast";
  return m;
}

function isMockImageModel(model) {
  const m = String(model ?? "")
    .trim()
    .toLowerCase();
  if (MOCK_UNAVAILABLE_IMAGE_MODELS.has(m)) return false;
  return (
    MOCK_IMAGE_MODELS.has(m) ||
    m.startsWith("nano-banana") ||
    m === "gpt-image" ||
    m.startsWith("gpt-image-")
  );
}

function isMockTextChatModel(model) {
  const m = String(model ?? "")
    .trim()
    .toLowerCase();
  if (isMockImageModel(m)) return false;
  return (
    m.startsWith("gpt-") ||
    m.startsWith("gemini-") ||
    m.startsWith("auto-") ||
    MOCK_ALLOWED_MODELS.has(m)
  );
}

function imageGenerationBody(body) {
  const requestedModel =
    typeof body.model === "string" ? body.model : "nano-banana";
  const resolvedModel = requestedModel;
  const upstreamModel = resolveMockImageUpstreamModel(resolvedModel);
  const meta = tokfaiMeta(requestedModel, resolvedModel);

  // Temporarily unavailable Nano Banana SKUs.
  if (MOCK_UNAVAILABLE_IMAGE_MODELS.has(String(resolvedModel).toLowerCase())) {
    return {
      __status: 400,
      error: {
        message: "当前图片模型不可用，请切换图片模型",
        code: "image_model_not_available",
        type: "invalid_request_error",
        request_id: meta.request_id,
      },
      tokfai: {
        billing_status: "not_billable",
        credits_charged: 0,
      },
      request_id: meta.request_id,
      suggestedModels: [...MOCK_IMAGE_MODELS],
    };
  }

  // GPT/Gemini/Claude text models cannot use /v1/images/generations.
  if (isMockTextChatModel(resolvedModel) || !isMockImageModel(resolvedModel)) {
    return {
      __status: 400,
      error: {
        message:
          "This model is not image-capable. Use an image model on POST /v1/images/generations (e.g. nano-banana).",
        code: "model_not_image_capable",
        type: "invalid_request_error",
        request_id: meta.request_id,
      },
      tokfai: {
        billing_status: "not_billable",
        credits_charged: 0,
      },
      request_id: meta.request_id,
      suggestedModels: [...MOCK_IMAGE_MODELS],
    };
  }

  const images = collectMockImages(body);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const wantsReference =
    body.mode === "reference_edit" ||
    /保留人物|保留主体|不要换人|参考图|换成|替换成/i.test(prompt);

  if (wantsReference && images.length === 0) {
    return {
      __status: 400,
      error: {
        message: "需要上传参考图后才能进行保留主体改图。",
        code: "reference_image_missing",
        type: "validation_error",
        request_id: meta.request_id,
      },
      tokfai: {
        billing_status: "not_billable",
        credits_charged: 0,
      },
      request_id: meta.request_id,
    };
  }

  const hasBlob = images.some((url) => /^blob:/i.test(String(url)));
  if (hasBlob) {
    return {
      __status: 400,
      error: {
        message: "Browser blob URLs cannot be used as reference images.",
        code: "invalid_image_url",
        type: "validation_error",
        request_id: meta.request_id,
      },
      tokfai: {
        billing_status: "not_billable",
        credits_charged: 0,
      },
      request_id: meta.request_id,
    };
  }

  const mode = images.length > 0 || wantsReference ? "reference_edit" : "text_to_image";
  const taskId = meta.request_id;
  const wantFail =
    /__tokfai_image_fail__|force_upstream_image_error/i.test(prompt);
  const wantTimeout =
    /__tokfai_image_timeout__|force_image_task_timeout/i.test(prompt);
  /** P957 soft wait: stay in-flight with task_timeout, then complete (poll continues). */
  const wantSoftTimeout =
    /__tokfai_image_soft_timeout__|force_image_soft_timeout/i.test(prompt);
  const completeDelayMs = wantSoftTimeout ? 2_500 : 200;

  imageTasks.set(taskId, {
    id: taskId,
    userKey: "", // filled by route
    status: "queued",
    progress: 0,
    message: { en: "Queued", zh: "已排队" },
    model: resolvedModel,
    // Internal only — never copied into public poll response.
    _upstream_model: upstreamModel,
    data: [],
    usage: { credits_charged: 0 },
    error: null,
    mode,
    billing_status: "not_billable",
    credits_charged: 0,
    task_timeout: false,
    timeout_pending: false,
    timeout_code: null,
    created_at_ms: Date.now(),
  });

  setTimeout(() => {
    const task = imageTasks.get(taskId);
    if (!task) return;
    task.status = "generating";
    task.progress = wantFail ? 96 : 55;
    task.message = { en: "Generating image", zh: "正在生成图片" };
    if (wantSoftTimeout) {
      task.task_timeout = true;
      task.timeout_pending = true;
      task.timeout_code = "image_task_timeout_pending";
      task.message = {
        en: "Still generating — you can check again later with task_id. Not billed yet.",
        zh: "生成中，可稍后查询（保留 task_id）。尚未扣费。",
      };
    }
  }, 50);

  setTimeout(() => {
    const task = imageTasks.get(taskId);
    if (!task) return;
    if (wantFail) {
      task.status = "failed";
      task.progress = 96;
      task.task_timeout = false;
      task.message = {
        en: "Image generation is temporarily unavailable. Please retry shortly.",
        zh: "图片生成暂时不可用，请稍后重试。",
      };
      task.error = {
        message:
          "Image generation is temporarily unavailable. Please retry shortly.",
        code: "upstream_image_error",
        type: "server_error",
        request_id: taskId,
      };
      task.usage = { credits_charged: 0 };
      task.billing_status = "not_billable";
      task.credits_charged = 0;
      return;
    }
    if (wantTimeout) {
      task.status = "retryable_timeout";
      task.progress = 90;
      task.task_timeout = false;
      task.message = {
        en: "Image generation timed out before completion.",
        zh: "图片生成超时，请稍后重试。未扣费。",
      };
      task.error = {
        message: "Image generation timed out before completion.",
        code: "image_task_timeout",
        type: "upstream_error",
        request_id: taskId,
      };
      task.usage = { credits_charged: 0 };
      task.billing_status = "not_billable";
      task.credits_charged = 0;
      return;
    }
    task.status = "completed";
    task.progress = 100;
    task.task_timeout = false;
    task.message = { en: "Completed", zh: "已完成" };
    task.data = [
      {
        url: "https://example.com/mock-image.png",
        revised_prompt: null,
      },
    ];
    task.usage = { credits_charged: meta.credits_charged };
    task.billing_status = "billable";
    task.credits_charged = meta.credits_charged;
  }, completeDelayMs);

  return {
    __status: 202,
    id: taskId,
    task_id: taskId,
    object: "image.generation",
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    status: "queued",
    processing: true,
    progress: 0,
    message: { en: "Queued", zh: "已排队" },
    data: [],
    usage: { credits_charged: 0 },
    tokfai: {
      request_id: taskId,
      billing_status: "not_billable",
      credits_charged: 0,
      mode,
    },
    request_id: taskId,
    credits_charged: 0,
    mode,
  };
}

function collectMockImages(body) {
  const buckets = [
    body?.images,
    body?.image_urls,
    body?.reference_images,
    body?.input_images,
  ];
  const out = [];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
  }
  return out.slice(0, 4);
}


function createBatch(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const batchId = `batch_mock_${randomBytes(6).toString("hex")}`;
  const items = Array.isArray(body.items) ? body.items : [];
  const meta = tokfaiMeta(requestedModel, "gemini-3-flash");
  const record = {
    id: batchId,
    status: "completed",
    model: requestedModel,
    total_items: items.length,
    succeeded_items: items.length,
    failed_items: 0,
    credits_charged: meta.credits_charged,
    request_id: meta.request_id,
    tokfai: meta.tokfai,
    items: items.map((item, index) => ({
      index,
      status: "succeeded",
      request_id: `req_mock_item_${index}_${randomBytes(4).toString("hex")}`,
      credits_charged: 0.000001,
      response: chatCompletionBody({ model: requestedModel }),
      input: item,
    })),
  };
  batches.set(batchId, record);
  return {
    id: batchId,
    object: "batch",
    status: "completed",
    model: requestedModel,
    total_items: items.length,
    succeeded_items: items.length,
    failed_items: 0,
    credits_charged: meta.credits_charged,
    request_id: meta.request_id,
    tokfai: meta.tokfai,
  };
}

function batchPoll(batchId) {
  const batch = batches.get(batchId);
  if (!batch) {
    return {
      status: 404,
      body: {
        error: {
          message: "Batch not found.",
          code: "invalid_request_error",
          type: "invalid_request_error",
        },
        request_id: makeRequestId(),
      },
    };
  }
  return {
    status: 200,
    body: {
      id: batch.id,
      object: "batch",
      status: batch.status,
      model: batch.model,
      total_items: batch.total_items,
      succeeded_items: batch.succeeded_items,
      failed_items: batch.failed_items,
      credits_charged: batch.credits_charged,
      request_id: batch.request_id,
      tokfai: batch.tokfai,
    },
  };
}

function batchItems(batchId) {
  const batch = batches.get(batchId);
  if (!batch) {
    return {
      status: 404,
      body: {
        error: {
          message: "Batch not found.",
          code: "invalid_request_error",
          type: "invalid_request_error",
        },
        request_id: makeRequestId(),
      },
    };
  }
  return {
    status: 200,
    body: {
      object: "list",
      data: batch.items,
    },
  };
}

export function startMockGateway(options = {}) {
  const host = options.host ?? HOST;
  const port = options.port ?? PORT;
  const validKey = options.validKey ?? VALID_KEY;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && (path === "/health" || path === "/v1/health")) {
        return sendJson(res, 200, {
          ok: true,
          service: "dmit-api",
          env: "mock",
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && path === "/v1/billing/plans") {
        return sendJson(res, 200, {
          object: "list",
          data: [
            {
              id: "mock_plan_starter",
              name: "Starter",
              credits: 10000,
              price_cents: 1000,
              currency: "usd",
              active: true,
            },
          ],
        });
      }

      if (req.method === "GET" && path === "/v1/status") {
        return sendJson(res, 200, {
          ok: true,
          service: "dmit-api",
          environment: "mock",
          version: "0.1.0",
          git_commit: "mock",
          uptime_seconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          supported_endpoints: [
            "GET /v1/models",
            "POST /v1/chat/completions",
            "POST /v1/responses",
            "GET /v1beta/models",
            "POST /v1beta/models/:model:generateContent",
            "POST /v1beta/models/:model:streamGenerateContent",
            "POST /v1/images/generations",
            "POST /v1/batches/chat",
          ],
        });
      }

      if (req.method === "GET" && path === "/v1beta/models") {
        const ids = [
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-3-flash",
          "gemini-3-pro",
        ];
        return sendJson(res, 200, {
          models: ids.map((id) => ({
            name: `models/${id}`,
            displayName: id,
            supportedGenerationMethods: [
              "generateContent",
              "streamGenerateContent",
            ],
          })),
        });
      }

      const geminiActionMatch = path.match(
        /^\/v1beta\/models\/(.+):(generateContent|streamGenerateContent)$/
      );
      if (req.method === "POST" && geminiActionMatch) {
        const authErr = checkGeminiAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const GEMINI_ALIASES = {
            "gemini-3.1-flash": "gemini-3-flash",
            "gemini-3.1-pro": "gemini-3-pro",
          };
          const GEMINI_PUBLIC = new Set([
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-3-flash",
            "gemini-3-pro",
          ]);
          const requested = decodeURIComponent(geminiActionMatch[1]).replace(
            /^models\//,
            ""
          );
          const modelId = GEMINI_ALIASES[requested] ?? requested;
          if (!GEMINI_PUBLIC.has(modelId)) {
            return sendJson(res, 400, {
              error: {
                message: `Unsupported model: ${requested}. Supported models: gemini-2.5-flash, gemini-2.5-pro, gemini-3-flash, gemini-3-pro`,
                code: "model_not_supported",
                type: "validation_error",
              },
              request_id: makeRequestId(),
            });
          }
          const action = geminiActionMatch[2];
          const body = await readJsonBody(req);
          const response = geminiGenerateContentBody(body, modelId);
          if (action === "streamGenerateContent") {
            return sendSse(res, geminiGenerateContentToSse(response));
          }
          return sendJson(res, 200, response);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "GET" && path === "/v1/models") {
        const now = Math.floor(Date.now() / 1000);
        // Chat / alias catalog only — image models are not listed on GET /v1/models.
        const ids = [
          "auto-fast",
          "auto-pro",
          "auto-cheap",
          "gpt-5",
          "gpt-5-chat",
          "gpt-5-pro",
          "gpt-5.4-pro",
          "gpt-5.1",
          "gpt-5.2",
          "gpt-5.5",
          "gpt-5.4",
          "gemini-2.5-flash",
          "gemini-3-pro",
          "gemini-3-flash",
        ];
        const labels = {
          "auto-fast": "Tokfai Auto Fast",
          "auto-pro": "Tokfai Auto Pro",
          "auto-cheap": "Tokfai Auto Cheap",
          "gpt-5": "Tokfai GPT-5",
          "gpt-5-chat": "Tokfai GPT-5 Chat",
          "gpt-5-pro": "Tokfai GPT-5 Pro",
          "gpt-5.4-pro": "Tokfai GPT-5.4 Pro",
          "gpt-5.1": "Tokfai GPT-5.1",
          "gpt-5.2": "Tokfai GPT-5.2",
          "gpt-5.5": "Tokfai GPT-5.5",
          "gpt-5.4": "Tokfai GPT-5.4",
          "gemini-2.5-flash": "Tokfai Gemini 2.5 Flash",
          "gemini-3-pro": "Tokfai Gemini 3 Pro",
          "gemini-3-flash": "Tokfai Gemini 3 Flash",
        };
        const aliasOf = {
          "gpt-5.4": "gpt-5",
          "gpt-5.4-pro": "gpt-5-pro",
        };
        return sendJson(res, 200, {
          object: "list",
          data: ids.map((id) => {
            const label = labels[id] ?? `Tokfai ${id}`;
            const coding =
              /(^|[-_/])(coding|codex|code)([-_/]|$)/i.test(id) ||
              id.startsWith("gpt-5") ||
              id.startsWith("auto-pro");
            return {
              id,
              object: "model",
              created: now,
              owned_by: "tokfai",
              name: label,
              display_name: label,
              title: label,
              ...(aliasOf[id] ? { alias_of: aliasOf[id] } : {}),
              capabilities: {
                chat: true,
                stream: true,
                tools: true,
                image: false,
                coding,
              },
            };
          }),
        });
      }

      if (req.method === "POST" && path === "/v1/chat/completions") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          const idemKey = parseIdempotencyHeader(req);
          if (idemKey && chatIdempotency.has(idemKey)) {
            const hit = chatIdempotency.get(idemKey);
            const replay = structuredClone(hit.body);
            // Keep original request_id / credits — no double charge.
            return sendJson(res, 200, replay);
          }
          // Cherry Studio compat: mirror DMIT normalizeClientChatCompletionBody
          // (empty / missing / non-array / all-empty-content → 200 noop).
          const clientNorm = mockNormalizeClientChatBody(body);
          if (clientNorm.noop) {
            const requestId = makeRequestId();
            const model =
              typeof body?.model === "string" && body.model.trim()
                ? body.model.trim()
                : "unknown";
            const messages = body?.messages;
            console.warn(
              JSON.stringify({
                level: "warn",
                msg: "chat_completion_empty_messages_noop",
                requestId,
                route: "/v1/chat/completions",
                model,
                requestedModel: model === "unknown" ? undefined : model,
                resolvedModel: model === "unknown" ? undefined : model,
                stream: body?.stream === true || body?.stream === false
                  ? body.stream
                  : body?.stream === undefined
                    ? "missing"
                    : typeof body?.stream,
                bodyKeys: Object.keys(body ?? {}).sort().join(","),
                messagesCount: Array.isArray(messages) ? messages.length : 0,
                contentShape: mockChatContentShape(messages),
                rejectedReason: "empty_messages",
                normalized: true,
                noop: true,
              })
            );
            const noop = {
              id: `chatcmpl_${requestId}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "请求内容为空，请重新输入。",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
              credits_charged: 0,
              request_id: requestId,
              tokfai: {
                credits_charged: 0,
                request_id: requestId,
                requested_model: model,
                resolved_model: model,
                billing_status: "not_billable",
                rejectedReason: "empty_messages",
              },
            };
            if (body?.stream === true) {
              return sendSse(res, chatCompletionToSse(noop));
            }
            return sendJson(res, 200, noop);
          }
          const normalizedBody = clientNorm.body;
          const model =
            typeof normalizedBody?.model === "string"
              ? normalizedBody.model
              : "auto-fast";
          const forced = mockErrorForModel(model);
          if (forced) return sendJson(res, forced.status, forced.body);
          // Image models are isolated — never chat fallback / billing.
          if (isMockImageModel(model) || MOCK_UNAVAILABLE_IMAGE_MODELS.has(String(model).toLowerCase()) || String(model).toLowerCase().startsWith("nano-banana") || String(model).toLowerCase().startsWith("gpt-image")) {
            return sendJson(res, 400, imageModelNotForChatBody());
          }
          if (!isMockModelAllowed(model)) {
            return sendJson(res, 400, modelNotAvailableBody());
          }
          const completion = chatCompletionBody(normalizedBody);
          if (idemKey && normalizedBody?.stream !== true) {
            chatIdempotency.set(idemKey, {
              requestId: completion.request_id,
              creditsCharged: Number(completion.credits_charged ?? 0),
              body: completion,
            });
          }
          if (normalizedBody?.stream === true) {
            return sendSse(res, chatCompletionToSse(completion));
          }
          return sendJson(res, 200, completion);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/responses") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          if (body?.input === undefined || body?.input === null) {
            return sendJson(res, 400, {
              error: {
                message: "Invalid request.",
                code: "invalid_request_error",
                type: "invalid_request_error",
              },
              request_id: makeRequestId(),
            });
          }
          const model =
            typeof body?.model === "string" ? body.model : "auto-fast";
          const forced = mockErrorForModel(model);
          if (forced) return sendJson(res, forced.status, forced.body);
          if (isMockImageModel(model) || MOCK_UNAVAILABLE_IMAGE_MODELS.has(String(model).toLowerCase()) || String(model).toLowerCase().startsWith("nano-banana") || String(model).toLowerCase().startsWith("gpt-image")) {
            return sendJson(res, 400, imageModelNotForChatBody());
          }
          if (!isMockModelAllowed(model)) {
            return sendJson(res, 400, modelNotAvailableBody());
          }
          const response = responsesBody(body);
          if (body?.stream === true) {
            return sendSse(res, responsesToSse(response));
          }
          return sendJson(res, 200, response);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/images/generations") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("image");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          const payload = imageGenerationBody(body);
          const status = payload.__status ?? 200;
          if (payload.__status) delete payload.__status;
          const token = parseBearer(req) ?? "";
          if (payload.id && imageTasks.has(payload.id)) {
            imageTasks.get(payload.id).userKey = token;
          }
          return sendJson(res, status, payload);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/vision/analyze") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const body = await readJsonBody(req);
        const imageUrl =
          typeof body?.image_url === "string" ? body.image_url.trim() : "";
        const requestId = makeRequestId();
        if (!imageUrl) {
          return sendJson(res, 400, {
            error: {
              message: "image_url is required.",
              code: "invalid_image_url",
              type: "invalid_request_error",
            },
            request_id: requestId,
          });
        }
        if (/^(blob:|file:)/i.test(imageUrl)) {
          return sendJson(res, 400, {
            error: {
              message: "blob: and file: URLs are not supported.",
              code: "invalid_image_url",
              type: "validation_error",
            },
            request_id: requestId,
          });
        }
        if (/^https?:\/\//i.test(imageUrl)) {
          try {
            const host = new URL(imageUrl).hostname.toLowerCase();
            if (
              host === "localhost" ||
              host.endsWith(".localhost") ||
              host === "127.0.0.1" ||
              host.startsWith("10.") ||
              host.startsWith("192.168.") ||
              /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
            ) {
              return sendJson(res, 400, {
                error: {
                  message: "This image URL is not allowed.",
                  code: "invalid_image_url",
                  type: "invalid_request_error",
                },
                request_id: requestId,
              });
            }
          } catch {
            return sendJson(res, 400, {
              error: {
                message: "Image URL must be a valid URL.",
                code: "invalid_image_url",
                type: "invalid_request_error",
              },
              request_id: requestId,
            });
          }
        }
        if (/^https?:\/\/example\.com\/not-an-image/i.test(imageUrl)) {
          return sendJson(res, 400, {
            error: {
              message:
                "URL does not point to a supported image (PNG, JPG, or WEBP).",
              code: "unsupported_image_content_type",
              type: "validation_error",
            },
            request_id: requestId,
          });
        }
        if (/^https?:\/\/example\.com\/huge-image/i.test(imageUrl)) {
          return sendJson(res, 400, {
            error: {
              message: "Image exceeds the 10 MB size limit.",
              code: "image_too_large",
              type: "validation_error",
            },
            request_id: requestId,
          });
        }
        if (/^https?:\/\/example\.com\/upstream-fail/i.test(imageUrl)) {
          return sendJson(res, 502, {
            error: {
              message: "Vision analyze failed. Please retry.",
              code: "upstream_error",
              type: "upstream_error",
            },
            request_id: requestId,
            tokfai: {
              credits_charged: 0,
              billing_status: "not_billable",
              usage_type: "vision_analyze",
            },
          });
        }
        const requested =
          typeof body?.model === "string" && body.model.trim()
            ? body.model.trim()
            : "vision-auto";
        const resolved =
          requested === "vision-auto" ? "gemini-2.5-flash" : requested;
        return sendJson(res, 200, {
          id: `vis_${requestId.replace(/^req_/, "")}`,
          object: "vision.analysis",
          model: resolved,
          output_text: "ok",
          request_id: requestId,
          tokfai: {
            credits_charged: 0.000001,
            billing_status: "charged",
            resolved_model: resolved,
            requested_model: requested,
            usage_type: "vision_analyze",
          },
        });
      }

      const imageGetMatch = path.match(/^\/v1\/images\/generations\/([^/]+)$/);
      if (req.method === "GET" && imageGetMatch) {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const id = decodeURIComponent(imageGetMatch[1]);
        const task = imageTasks.get(id);
        const token = parseBearer(req) ?? "";
        if (!task || (task.userKey && task.userKey !== token)) {
          return sendJson(res, 404, {
            error: {
              message: "Image generation not found.",
              code: "not_found",
              type: "invalid_request_error",
            },
            request_id: makeRequestId(),
          });
        }
        const creditsCharged = Number(task.credits_charged ?? 0);
        const billingStatus =
          task.billing_status ??
          (task.status === "completed" && creditsCharged > 0
            ? "billable"
            : "not_billable");
        const isTerminal =
          task.status === "completed" ||
          task.status === "failed" ||
          task.status === "retryable_timeout";
        const softTimedOut =
          !isTerminal &&
          (Boolean(task.task_timeout) || Boolean(task.timeout_pending));
        const body = {
          id: task.id,
          task_id: task.id,
          object: "image.generation",
          model: task.model,
          status: task.status,
          progress: task.progress,
          message: task.message,
          data: task.data,
          usage: task.usage,
          error: isTerminal ? task.error : null,
          tokfai: {
            request_id: task.id,
            billing_status: billingStatus,
            credits_charged:
              task.status === "completed" ? creditsCharged : 0,
            mode: task.mode,
            ...(softTimedOut
              ? {
                  timeout_pending: true,
                  task_timeout: true,
                  timeout_code:
                    task.timeout_code || "image_task_timeout_pending",
                }
              : {}),
          },
          request_id: task.id,
          credits_charged:
            task.status === "completed" ? creditsCharged : 0,
        };
        if (!isTerminal) body.processing = true;
        if (softTimedOut) {
          body.task_timeout = true;
          body.timeout_pending = true;
          body.timeout_code =
            task.timeout_code || "image_task_timeout_pending";
        }
        return sendJson(res, 200, body);
      }

      if (req.method === "POST" && path === "/v1/batches/chat") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("batch");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          return sendJson(res, 200, createBatch(body));
        } finally {
          slot.release?.();
        }
      }

      const batchMatch = path.match(/^\/v1\/batches\/([^/]+)(\/items)?$/);
      if (req.method === "GET" && batchMatch) {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const batchId = batchMatch[1];
        const isItems = Boolean(batchMatch[2]);
        const result = isItems ? batchItems(batchId) : batchPoll(batchId);
        return sendJson(res, result.status, result.body);
      }

      return sendJson(res, 404, {
        error: {
          message: `No route for ${req.method} ${path}.`,
          code: "route_not_found",
          type: "invalid_request_error",
        },
        request_id: makeRequestId(),
      });
    } catch (err) {
      return sendJson(res, 500, {
        error: {
          message: err instanceof Error ? err.message : "Internal error.",
          code: "upstream_error",
          type: "api_error",
        },
        request_id: makeRequestId(),
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve({
        server,
        host,
        port,
        validKey,
        baseUrl: `http://${host}:${port}/v1`,
      });
    });
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startMockGateway().then(({ host, port, validKey, baseUrl }) => {
    console.log(`P786 mock gateway listening on ${baseUrl}`);
    console.log(`Valid API key: ${validKey}`);
    console.log("Endpoints: GET /v1/models, POST /v1/chat/completions, POST /v1/responses,");
    console.log("  GET /v1beta/models, POST /v1beta/models/:model:generateContent,");
    console.log("  POST /v1beta/models/:model:streamGenerateContent,");
    console.log("  POST /v1/images/generations, POST /v1/vision/analyze, POST /v1/batches/chat, GET /v1/batches/:id,");
    console.log("  GET /v1/batches/:id/items");
  });
}
