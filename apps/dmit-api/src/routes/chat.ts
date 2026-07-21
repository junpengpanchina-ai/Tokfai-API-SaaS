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
import { normalizeChatMessages } from "../lib/chatCompletionCompat.js";
import {
  formatZodIssues,
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
 * Cherry Studio / OpenAI SDK bodies are accepted loosely; unknown harmless
 * fields are ignored before upstream. Validation 400s always return a concrete
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

  let body: unknown;
  try {
    body = await readJsonBodyWithLimit(c);
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
      });
      // Return directly — do not rely on onError (avoids empty-body races).
      return respondApiError(c, err, requestId);
    }
    throw err;
  }

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
      body,
      rejectedReason,
      zodErrors,
      validationErrors: ["schema_validation_failed"],
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
      body,
      rejectedReason,
      validationErrors: ["messages_normalization_failed"],
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
      body,
      rejectedReason,
      validationErrors: ["invalid_idempotency_key"],
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
        typeof (body as { model?: unknown })?.model === "string"
          ? String((body as { model: string }).model).trim()
          : undefined;
      const resolved = requestedRaw
        ? resolveChatModel(requestedRaw)
        : undefined;
      logChatCompletionInvalidRequest({
        requestId: result.requestId || requestId,
        route,
        body,
        rejectedReason: safeInvalidRequestMessage(
          result.errorMessage,
          "Invalid chat completion request."
        ),
        validationErrors: [result.errorCode || "invalid_request_error"],
        requestedModel: requestedRaw,
        resolvedModel: resolved?.canonicalId,
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
