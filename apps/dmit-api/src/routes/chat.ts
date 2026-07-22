import { Hono } from "hono";

import { ApiError } from "../errors.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import { respondApiError } from "../middleware/error.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
} from "../gateway/concurrency.js";
import { chatCompletionToSseBody } from "../lib/chatCompletionSse.js";
import {
  normalizeChatMessages,
  normalizeClientChatCompletionBody,
} from "../lib/chatCompletionCompat.js";
import {
  buildEmptyMessagesNoopChatCompletion,
  formatZodIssues,
  logChatCompletionClientNormalized,
  logChatCompletionEmptyMessagesNoop,
  logChatCompletionInvalidRequest,
  safeInvalidRequestMessage,
} from "../lib/chatCompletionDiagnostics.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import { respondExecuteChatCompletionFailure } from "../lib/handleExecuteChatCompletionResult.js";
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { readJsonBodyWithLimit } from "../lib/readJsonBodyWithLimit.js";
import { resolveChatModel } from "../upstream/modelAliases.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKeyOrSupabaseJwt (sk-tokfai_ or Supabase JWT).
 * Non-stream requests return JSON; stream=true returns OpenAI-compatible SSE
 * (synthesized from a completed upstream response) ending with data: [DONE].
 *
 * Cherry Studio / OpenAI SDK bodies are normalized/sanitized BEFORE schema
 * validation. Empty / all-empty-content messages return a 200 not_billable
 * noop (never upstream, never debit). Validation 400s always return a concrete
 * JSON error envelope via respondApiError (never empty body / undefined message).
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKeyOrSupabaseJwt);
chatRoutes.use("/v1/chat/completions", chatGatewayMiddleware);

chatRoutes.post("/v1/chat/completions", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);
  const route = "/v1/chat/completions";

  let rawBody: unknown;
  try {
    rawBody = await readJsonBodyWithLimit(c);
  } catch (err) {
    if (err instanceof ApiError && err.code === "request_body_too_large") {
      await logGatewayRejection({
        caller,
        requestId,
        err,
        limitKey,
        keyInflight: await getKeyInflight(limitKey),
        globalInflight: await getGlobalUpstreamInflight(),
      });
    }
    if (err instanceof ApiError && err.status === 400) {
      logChatCompletionInvalidRequest({
        requestId,
        route,
        body: null,
        rejectedReason: safeInvalidRequestMessage(
          err.publicMessage,
          "Invalid JSON body."
        ),
        validationErrors: [err.code ?? "invalid_request_error"],
        normalized: false,
        noop: false,
      });
      // Return directly — do not rely on onError (avoids empty-body races).
      return respondApiError(c, err, requestId);
    }
    throw err;
  }

  // Cherry Studio compat: normalize/sanitize BEFORE schema validation.
  // messages missing / null / [] / non-array / all-empty-content → 200 noop.
  const clientNorm = normalizeClientChatCompletionBody(rawBody);
  if (clientNorm.noop) {
    logChatCompletionEmptyMessagesNoop({
      requestId,
      route,
      body: clientNorm.body,
      originalBody: rawBody,
      normalized: clientNorm.normalized,
      rejectedReason: clientNorm.rejectedReason,
    });
    const noop = buildEmptyMessagesNoopChatCompletion({
      requestId,
      body: clientNorm.body,
    });
    const wantsStream =
      (clientNorm.body !== null &&
        typeof clientNorm.body === "object" &&
        !Array.isArray(clientNorm.body) &&
        (clientNorm.body as { stream?: unknown }).stream === true) ||
      (rawBody !== null &&
        typeof rawBody === "object" &&
        !Array.isArray(rawBody) &&
        (rawBody as { stream?: unknown }).stream === true);
    if (wantsStream) {
      const sseBody = chatCompletionToSseBody(noop);
      return c.newResponse(sseBody, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Request-Id": requestId,
        },
      });
    }
    return c.json(noop);
  }

  if (clientNorm.normalized) {
    logChatCompletionClientNormalized({
      requestId,
      route,
      body: clientNorm.body,
      originalBody: rawBody,
    });
  }

  const body = clientNorm.body;
  const parsed = ChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    const zodErrors = formatZodIssues(parsed.error);
    const rejectedReason = safeInvalidRequestMessage(
      zodErrors[0]
        ? `Invalid chat completion request: ${zodErrors[0]}`
        : "Invalid chat completion request."
    );
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      zodErrors,
      validationErrors: ["schema_validation_failed"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId
    );
  }

  const normalizedMessages = normalizeChatMessages(parsed.data.messages);
  if (!normalizedMessages.ok) {
    const rejectedReason = safeInvalidRequestMessage(
      normalizedMessages.message,
      "Invalid chat completion request."
    );
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      validationErrors: ["messages_normalization_failed"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId
    );
  }

  const rawIdempotencyKey =
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key");
  const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
  if (rawIdempotencyKey && !idempotencyKey) {
    const rejectedReason = "Invalid Idempotency-Key header.";
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      validationErrors: ["invalid_idempotency_key"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_idempotency_key"),
      requestId
    );
  }

  const wantsStream = parsed.data.stream === true;

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: {
      ...parsed.data,
      messages: normalizedMessages.messages,
      stream: false,
    },
    limitKey,
    idempotencyKey,
    clientStream: wantsStream,
  });

  if (!result.ok) {
    if (result.httpStatus === 400) {
      const requestedRaw =
        typeof (rawBody as { model?: unknown })?.model === "string"
          ? String((rawBody as { model: string }).model).trim()
          : undefined;
      const resolved = requestedRaw
        ? resolveChatModel(requestedRaw)
        : undefined;
      logChatCompletionInvalidRequest({
        requestId: result.requestId || requestId,
        route,
        body: rawBody,
        rejectedReason: safeInvalidRequestMessage(
          result.errorMessage,
          "Invalid chat completion request."
        ),
        validationErrors: [result.errorCode || "invalid_request_error"],
        requestedModel: requestedRaw,
        resolvedModel: resolved?.canonicalId,
        normalized: clientNorm.normalized,
        noop: false,
      });
    }
    // Always JSON error body — never SSE — even when client asked stream=true.
    return respondExecuteChatCompletionFailure(c, result);
  }

  if (wantsStream) {
    const sseBody = chatCompletionToSseBody(result.response);
    return c.newResponse(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": result.requestId,
      },
    });
  }

  return c.json(result.response);
});
