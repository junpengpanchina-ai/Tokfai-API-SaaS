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

function makeRequestId() {
  return `req_mock_${randomBytes(8).toString("hex")}`;
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
  return {
    error: {
      message:
        "This model is not available on Tokfai. Please refresh model list or choose another Tokfai model.",
      code: "model_not_available",
      type: "invalid_request_error",
    },
    request_id: makeRequestId(),
  };
}

/**
 * Offline-only error triggers for client error-copy smoke (p914).
 * Never hit production; model ids are reserved for mock gateways.
 */
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
    "__tokfai_mock_invalid_request": {
      status: 400,
      code: "invalid_request_error",
      type: "invalid_request_error",
      message: "Invalid request.",
    },
  };
  const hit = table[id];
  if (!hit) return null;
  return {
    status: hit.status,
    body: {
      error: {
        message: hit.message,
        code: hit.code,
        type: hit.type,
      },
      request_id: makeRequestId(),
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
  const content =
    completion.choices?.[0]?.message?.content ??
    (typeof completion.choices?.[0]?.message?.content === "string"
      ? completion.choices[0].message.content
      : "ok");
  const finishReason = completion.choices?.[0]?.finish_reason ?? "stop";
  const base = { id, object: "chat.completion.chunk", created, model };
  return [
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
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
}

function chatCompletionBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const resolvedModel = resolveMockCanonicalModel(requestedModel);
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  const content =
    typeof body.messages?.[0]?.content === "string" &&
    /TOKFAI_CHAT_ALIAS_READY/i.test(body.messages[0].content)
      ? "TOKFAI_CHAT_ALIAS_READY"
      : "ok";
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

function imageGenerationBody(body) {
  const requestedModel =
    typeof body.model === "string" ? body.model : "gpt-image-2";
  const resolvedModel = requestedModel;
  const meta = tokfaiMeta(requestedModel, resolvedModel);

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
      },
      request_id: meta.request_id,
    };
  }

  const hasDataUrl = images.some((url) => String(url).startsWith("data:image/"));
  const hasBlob = images.some((url) => /^blob:/i.test(String(url)));
  if (hasBlob) {
    return {
      __status: 400,
      error: {
        message: "Browser blob URLs cannot be used as reference images.",
        code: "invalid_image_url",
        type: "validation_error",
      },
      request_id: meta.request_id,
    };
  }

  const mode = images.length > 0 || wantsReference ? "reference_edit" : "text_to_image";
  // Async accept (matches production POST → 202 + poll).
  const taskId = meta.request_id;
  imageTasks.set(taskId, {
    id: taskId,
    userKey: "", // filled by route
    status: "queued",
    progress: 0,
    message: { en: "Queued", zh: "已排队" },
    model: resolvedModel,
    data: [],
    usage: { credits_charged: 0 },
    error: null,
    mode,
  });

  // Complete shortly after accept so GET poll succeeds in smokes.
  setTimeout(() => {
    const task = imageTasks.get(taskId);
    if (!task) return;
    task.status = "generating";
    task.progress = 55;
    task.message = { en: "Generating image", zh: "正在生成图片" };
  }, 50);
  setTimeout(() => {
    const task = imageTasks.get(taskId);
    if (!task) return;
    task.status = "completed";
    task.progress = 100;
    task.message = { en: "Completed", zh: "已完成" };
    task.data = [{ url: "https://example.com/mock-image.png" }];
    task.usage = { credits_charged: meta.credits_charged };
  }, 200);

  return {
    __status: 202,
    id: taskId,
    object: "image.generation",
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    status: "queued",
    progress: 0,
    message: { en: "Queued", zh: "已排队" },
    data: [],
    usage: { credits_charged: 0 },
    tokfai: { request_id: taskId, mode },
    request_id: taskId,
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
            return {
              id,
              object: "model",
              created: now,
              owned_by: "tokfai",
              name: label,
              display_name: label,
              title: label,
              ...(aliasOf[id] ? { alias_of: aliasOf[id] } : {}),
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
          // Cherry Studio compat: empty / missing / non-array messages → 200 noop
          // (mirror apps/dmit-api chat_completion_empty_messages_noop).
          if (
            body?.messages === undefined ||
            body?.messages === null ||
            !Array.isArray(body?.messages) ||
            body.messages.length === 0
          ) {
            const requestId = makeRequestId();
            const model =
              typeof body?.model === "string" && body.model.trim()
                ? body.model.trim()
                : "unknown";
            console.warn(
              JSON.stringify({
                level: "warn",
                msg: "chat_completion_empty_messages_noop",
                requestId,
                route: "/v1/chat/completions",
                model,
                stream: body?.stream === true || body?.stream === false
                  ? body.stream
                  : body?.stream === undefined
                    ? "missing"
                    : typeof body?.stream,
                bodyKeys: Object.keys(body ?? {}).sort().join(","),
                messagesCount: 0,
                contentShape: "empty",
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
          const model =
            typeof body?.model === "string" ? body.model : "auto-fast";
          const forced = mockErrorForModel(model);
          if (forced) return sendJson(res, forced.status, forced.body);
          if (!isMockModelAllowed(model)) {
            return sendJson(res, 400, modelNotAvailableBody());
          }
          const completion = chatCompletionBody(body);
          if (body?.stream === true) {
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
        return sendJson(res, 200, {
          id: task.id,
          object: "image.generation",
          model: task.model,
          status: task.status,
          progress: task.progress,
          message: task.message,
          data: task.data,
          usage: task.usage,
          error: task.error,
          tokfai: { request_id: task.id, mode: task.mode },
          request_id: task.id,
        });
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
    console.log("  POST /v1/images/generations, POST /v1/batches/chat, GET /v1/batches/:id,");
    console.log("  GET /v1/batches/:id/items");
  });
}
