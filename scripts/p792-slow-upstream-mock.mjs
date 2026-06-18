#!/usr/bin/env node
/**
 * Internal operator / offline acceptance only — not customer documentation.
 *
 * P792 — slow upstream mock gateway with concurrency backpressure.
 *
 * Usage:
 *   node scripts/p792-slow-upstream-mock.mjs
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const HOST = process.env.MOCK_HOST ?? "127.0.0.1";
const PORT = parseInt(process.env.MOCK_PORT ?? "8788", 10);
const VALID_KEY = process.env.MOCK_API_KEY ?? "sk-tokfai_mock_acceptance";

const MOCK_CHAT_DELAY_MS = parseInt(process.env.MOCK_CHAT_DELAY_MS ?? "3000", 10);
const MOCK_IMAGE_DELAY_MS = parseInt(process.env.MOCK_IMAGE_DELAY_MS ?? "12000", 10);
const MOCK_BATCH_ITEM_DELAY_MS = parseInt(process.env.MOCK_BATCH_ITEM_DELAY_MS ?? "5000", 10);
const MOCK_MODELS_DELAY_MS = parseInt(process.env.MOCK_MODELS_DELAY_MS ?? "100", 10);
const MOCK_TIMEOUT_RATE = parseFloat(process.env.MOCK_TIMEOUT_RATE ?? "0.03");
const MOCK_BUSY_RATE = parseFloat(process.env.MOCK_BUSY_RATE ?? "0.03");
const MOCK_RANDOM_5XX_RATE = parseFloat(process.env.MOCK_RANDOM_5XX_RATE ?? "0.01");

const MOCK_CHAT_CONCURRENCY = parseInt(process.env.MOCK_CHAT_CONCURRENCY ?? "50", 10);
const MOCK_IMAGE_CONCURRENCY = parseInt(process.env.MOCK_IMAGE_CONCURRENCY ?? "10", 10);
const MOCK_BATCH_CONCURRENCY = parseInt(process.env.MOCK_BATCH_CONCURRENCY ?? "20", 10);
const MOCK_GLOBAL_CONCURRENCY = parseInt(process.env.MOCK_GLOBAL_CONCURRENCY ?? "80", 10);

/** @type {Map<string, object>} */
const batches = new Map();

let chatInFlight = 0;
let imageInFlight = 0;
let batchInFlight = 0;
let globalInFlight = 0;

export function getSlowMockConcurrency() {
  return {
    global: globalInFlight,
    chat: chatInFlight,
    image: imageInFlight,
    batch: batchInFlight,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterDelay(baseMs, minMs, maxMs) {
  const min = minMs ?? Math.max(500, Math.floor(baseMs * 0.67));
  const max = maxMs ?? Math.max(min + 1, Math.floor(baseMs * 2.67));
  return min + Math.floor(Math.random() * (max - min + 1));
}

function makeRequestId() {
  return `req_slow_${randomBytes(8).toString("hex")}`;
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

function errorEnvelope(status, code, message, type = "rate_limit_error") {
  const requestId = makeRequestId();
  return {
    status,
    body: {
      error: { message, code, type },
      request_id: requestId,
    },
  };
}

function acquireSlots(kind) {
  if (globalInFlight >= MOCK_GLOBAL_CONCURRENCY) {
    return {
      ok: false,
      response: errorEnvelope(429, "too_many_concurrent_requests", "Too many concurrent requests."),
    };
  }

  const limits = { chat: MOCK_CHAT_CONCURRENCY, image: MOCK_IMAGE_CONCURRENCY, batch: MOCK_BATCH_CONCURRENCY };
  const inFlight = { chat: chatInFlight, image: imageInFlight, batch: batchInFlight };
  const limit = limits[kind] ?? 0;

  if (limit && inFlight[kind] >= limit) {
    const code =
      kind === "image" ? "gateway_overloaded" : kind === "batch" ? "too_many_requests" : "too_many_requests";
    const status = code === "gateway_overloaded" ? 503 : 429;
    return {
      ok: false,
      response: errorEnvelope(
        status,
        code,
        code === "gateway_overloaded" ? "Gateway temporarily overloaded." : "Too many requests."
      ),
    };
  }

  globalInFlight += 1;
  if (kind === "chat") chatInFlight += 1;
  if (kind === "image") imageInFlight += 1;
  if (kind === "batch") batchInFlight += 1;

  return {
    ok: true,
    release: () => {
      globalInFlight = Math.max(0, globalInFlight - 1);
      if (kind === "chat") chatInFlight = Math.max(0, chatInFlight - 1);
      if (kind === "image") imageInFlight = Math.max(0, imageInFlight - 1);
      if (kind === "batch") batchInFlight = Math.max(0, batchInFlight - 1);
    },
  };
}

function maybeRandomUpstreamFailure() {
  const r = Math.random();
  if (r < MOCK_TIMEOUT_RATE) {
    return errorEnvelope(504, "upstream_timeout", "Upstream request timed out.", "upstream_error");
  }
  if (r < MOCK_TIMEOUT_RATE + MOCK_BUSY_RATE) {
    return errorEnvelope(503, "upstream_model_busy", "Upstream model is busy.", "upstream_error");
  }
  if (r < MOCK_TIMEOUT_RATE + MOCK_BUSY_RATE + MOCK_RANDOM_5XX_RATE) {
    return errorEnvelope(503, "gateway_overloaded", "Gateway temporarily overloaded.", "rate_limit_error");
  }
  return null;
}

function checkAuth(req) {
  const token = parseBearer(req);
  if (!token) return authFailure("missing_token", "Missing Bearer token.");
  if (token !== VALID_KEY) return authFailure("invalid_token", "API key not recognised.");
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
      { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
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
    usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    ...meta,
  };
}

function imageGenerationBody(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "gpt-image-2";
  const resolvedModel = requestedModel;
  const meta = tokfaiMeta(requestedModel, resolvedModel);
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: "https://example.com/mock-slow-image.png" }],
    model: resolvedModel,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    ...meta,
  };
}

function scheduleBatchCompletion(batchId, items, requestedModel) {
  const delay = items.length * MOCK_BATCH_ITEM_DELAY_MS;
  setTimeout(() => {
    const batch = batches.get(batchId);
    if (!batch) return;
    batch.status = "completed";
    batch.succeeded_items = items.length;
    batch.failed_items = 0;
    batch.items = items.map((item, index) => {
      const itemMeta = tokfaiMeta(requestedModel, "gemini-3-flash");
      return {
        index,
        status: "succeeded",
        request_id: itemMeta.request_id,
        credits_charged: itemMeta.credits_charged,
        response: chatCompletionBody({ model: requestedModel }),
        input: item,
      };
    });
  }, delay);
}

function createBatchAsync(body) {
  const requestedModel = typeof body.model === "string" ? body.model : "auto-fast";
  const batchId = `batch_slow_${randomBytes(6).toString("hex")}`;
  const items = Array.isArray(body.items) ? body.items : [];
  const meta = tokfaiMeta(requestedModel, "gemini-3-flash");
  const record = {
    id: batchId,
    status: "processing",
    model: requestedModel,
    total_items: items.length,
    succeeded_items: 0,
    failed_items: 0,
    credits_charged: 0,
    request_id: meta.request_id,
    tokfai: meta.tokfai,
    items: [],
    rawItems: items,
  };
  batches.set(batchId, record);
  scheduleBatchCompletion(batchId, items, requestedModel);
  return {
    id: batchId,
    object: "batch",
    status: "processing",
    model: requestedModel,
    total_items: items.length,
    succeeded_items: 0,
    failed_items: 0,
    credits_charged: 0,
    request_id: meta.request_id,
    tokfai: meta.tokfai,
  };
}

function batchPoll(batchId) {
  const batch = batches.get(batchId);
  if (!batch) {
    return errorEnvelope(404, "invalid_request_error", "Batch not found.", "invalid_request_error");
  }
  const body = {
    id: batch.id,
    object: "batch",
    status: batch.status,
    model: batch.model,
    total_items: batch.total_items,
    succeeded_items: batch.succeeded_items,
    failed_items: batch.failed_items,
    credits_charged: batch.status === "completed" ? batch.tokfai?.credits_charged ?? 0.000001 : 0,
    request_id: batch.request_id,
    tokfai: batch.tokfai,
  };
  return { status: 200, body };
}

function batchItems(batchId) {
  const batch = batches.get(batchId);
  if (!batch) {
    return errorEnvelope(404, "invalid_request_error", "Batch not found.", "invalid_request_error");
  }
  return {
    status: 200,
    body: {
      object: "list",
      data: batch.items ?? [],
    },
  };
}

async function handleSlowChat(body) {
  await sleep(jitterDelay(MOCK_CHAT_DELAY_MS, 2000, 8000));
  const failure = maybeRandomUpstreamFailure();
  if (failure) return failure;
  return { status: 200, body: chatCompletionBody(body) };
}

async function handleSlowImage(body) {
  await sleep(jitterDelay(MOCK_IMAGE_DELAY_MS, 8000, 30000));
  const failure = maybeRandomUpstreamFailure();
  if (failure) return failure;
  return { status: 200, body: imageGenerationBody(body) };
}

async function handleSlowBatch(body) {
  await sleep(Math.min(500, MOCK_BATCH_ITEM_DELAY_MS));
  const failure = maybeRandomUpstreamFailure();
  if (failure) return failure;
  return { status: 200, body: createBatchAsync(body) };
}

export function startSlowUpstreamMockGateway(options = {}) {
  const host = options.host ?? HOST;
  const port = options.port ?? PORT;
  const validKey = options.validKey ?? VALID_KEY;

  function checkAuthLocal(req) {
    const token = parseBearer(req);
    if (!token) return authFailure("missing_token", "Missing Bearer token.");
    if (token !== validKey) return authFailure("invalid_token", "API key not recognised.");
    return null;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/health") {
        await sleep(MOCK_MODELS_DELAY_MS);
        return sendJson(res, 200, { ok: true, service: "slow-mock", timestamp: new Date().toISOString() });
      }

      if (req.method === "GET" && path === "/v1/models") {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        await sleep(MOCK_MODELS_DELAY_MS);
        return sendJson(res, 200, {
          object: "list",
          data: [{ id: "auto-fast", object: "model" }],
        });
      }

      if (req.method === "POST" && path === "/v1/chat/completions") {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireSlots("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          const result = await handleSlowChat(body);
          return sendJson(res, result.status, result.body);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/responses") {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireSlots("chat");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          await sleep(jitterDelay(MOCK_CHAT_DELAY_MS, 2000, 8000));
          const failure = maybeRandomUpstreamFailure();
          if (failure) return sendJson(res, failure.status, failure.body);
          return sendJson(res, 200, responsesBody(body));
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/images/generations") {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireSlots("image");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          const result = await handleSlowImage(body);
          return sendJson(res, result.status, result.body);
        } finally {
          slot.release?.();
        }
      }

      if (req.method === "POST" && path === "/v1/batches/chat") {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const slot = acquireSlots("batch");
        if (!slot.ok) return sendJson(res, slot.response.status, slot.response.body);
        try {
          const body = await readJsonBody(req);
          const result = await handleSlowBatch(body);
          return sendJson(res, result.status, result.body);
        } finally {
          slot.release?.();
        }
      }

      const batchMatch = path.match(/^\/v1\/batches\/([^/]+)(\/items)?$/);
      if (req.method === "GET" && batchMatch) {
        const authErr = checkAuthLocal(req);
        if (authErr) return sendJson(res, authErr.status, authErr.body);
        const batchId = batchMatch[1];
        const isItems = Boolean(batchMatch[2]);
        await sleep(MOCK_MODELS_DELAY_MS);
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
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startSlowUpstreamMockGateway().then(({ host, port, validKey, baseUrl }) => {
    console.log(`P792 slow upstream mock listening on ${baseUrl}`);
    console.log(`Valid API key: ${validKey}`);
    console.log(
      `Delays: chat 2-8s (base ${MOCK_CHAT_DELAY_MS}ms), image 8-30s (base ${MOCK_IMAGE_DELAY_MS}ms), batch item ${MOCK_BATCH_ITEM_DELAY_MS}ms`
    );
    console.log(
      `Concurrency: global=${MOCK_GLOBAL_CONCURRENCY} chat=${MOCK_CHAT_CONCURRENCY} image=${MOCK_IMAGE_CONCURRENCY} batch=${MOCK_BATCH_CONCURRENCY}`
    );
  });
}
