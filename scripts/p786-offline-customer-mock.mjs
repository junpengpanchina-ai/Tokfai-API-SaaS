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

function makeRequestId() {
  return `req_mock_${randomBytes(8).toString("hex")}`;
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

function chatCompletionBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const resolvedModel = "gemini-3-flash";
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  return {
    id: `chatcmpl_${meta.request_id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    ...meta,
  };
}

function responsesBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const resolvedModel = "gemini-3-flash";
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  return {
    id: `resp_${meta.request_id}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: resolvedModel,
    output_text: "ok",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "ok" }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    ...meta,
  };
}

function imageGenerationBody(body) {
  const requestedModel =
    typeof body.model === "string" ? body.model : "gpt-image-2";
  const resolvedModel = requestedModel;
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: "https://example.com/mock-image.png" }],
    model: resolvedModel,
    ...meta,
  };
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
      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "dmit-api",
          env: "mock",
          timestamp: new Date().toISOString(),
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
            "POST /v1/images/generations",
            "POST /v1/batches/chat",
          ],
        });
      }

      if (req.method === "GET" && path === "/v1/models") {
        const now = Math.floor(Date.now() / 1000);
        const ids = [
          "auto-fast",
          "auto-pro",
          "auto-cheap",
          "gpt-5",
          "gpt-5-chat",
          "gpt-5-pro",
          "gpt-5.1",
          "gpt-5.2",
          "gpt-5.5",
          "gpt-5.4",
          "gemini-2.5-flash",
          "gemini-3-flash",
          "nano-banana-fast",
        ];
        return sendJson(res, 200, {
          object: "list",
          data: ids.map((id) => ({
            id,
            object: "model",
            created: now,
            owned_by: "tokfai",
          })),
        });
      }

      if (req.method === "POST" && path === "/v1/chat/completions") {
        const authErr = checkAuth(req, validKey);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireConcurrencySlot("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          return sendJson(res, 200, chatCompletionBody(body));
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
          return sendJson(res, 200, responsesBody(body));
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
          return sendJson(res, 200, imageGenerationBody(body));
        } finally {
          slot.release?.();
        }
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
    console.log("  POST /v1/images/generations, POST /v1/batches/chat, GET /v1/batches/:id,");
    console.log("  GET /v1/batches/:id/items");
  });
}
