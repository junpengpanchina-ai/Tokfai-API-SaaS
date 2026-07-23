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
import { respondResponsesEarlySse } from "../lib/respondEarlySse.js";
import {
  chatCompletionResponseToResponses,
  isResponsesFormatResponse,
  ResponsesRequestSchema,
  responsesBodyToChatBody,
} from "../lib/responsesTransform.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * /v1/responses — OpenAI Responses API compatibility for client software.
 *
 * Converts Responses `input` to chat `messages` and reuses executeChatCompletion
 * for auth, billing, routing, and upstream handling.
 *
 * stream=false → JSON object=response
 * stream=true  → OpenAI Responses SSE; response.created is flushed immediately
 *                after prechecks (before upstream). Remaining events are
 *                synthesized from the completed response. Precheck failures
 *                still use the JSON error envelope (never empty body).
 *
 * Validation 400s always return a concrete JSON error envelope (never empty body).
 */
export const responsesRoutes = new Hono();

responsesRoutes.use("/v1/responses", requireApiKeyOrSupabaseJwt);
responsesRoutes.use("/v1/responses", chatGatewayMiddleware);

responsesRoutes.post("/v1/responses", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);
  const route = "/v1/responses";

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
      return respondApiError(c, err, requestId);
    }
    throw err;
  }

  // Reject chat-shaped payloads that accidentally send messages instead of input.
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    !("input" in (body as Record<string, unknown>)) &&
    "messages" in (body as Record<string, unknown>)
  ) {
    const rejectedReason =
      "Invalid responses request: use `input` (string or message array), not `messages`.";
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body,
      rejectedReason,
      validationErrors: ["messages_instead_of_input"],
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId
    );
  }

  const parsed = ResponsesRequestSchema.safeParse(body);
  if (!parsed.success) {
    const zodErrors = formatZodIssues(parsed.error);
    const rejectedReason = safeInvalidRequestMessage(
      zodErrors[0]
        ? `Invalid responses request: ${zodErrors[0]}`
        : "Invalid responses request."
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

  if (
    typeof parsed.data.model !== "string" ||
    !parsed.data.model.trim()
  ) {
    const rejectedReason = "Invalid responses request: model is required.";
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body,
      rejectedReason,
      validationErrors: ["model_required"],
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId
    );
  }

  const wantsStream = parsed.data.stream === true;
  const chatBody = responsesBodyToChatBody(parsed.data);
  if (
    !chatBody.messages?.length ||
    chatBody.messages.every(
      (message) =>
        typeof message.content !== "string" || message.content.trim() === ""
    )
  ) {
    const rejectedReason =
      "Invalid responses request: input produced empty messages.";
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body,
      rejectedReason,
      validationErrors: ["empty_messages_from_input"],
    });
    return respondApiError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId
    );
  }
  const chatParsed = ChatCompletionRequestSchema.safeParse({
    ...chatBody,
    stream: false,
  });
  if (!chatParsed.success) {
    const zodErrors = formatZodIssues(chatParsed.error);
    const rejectedReason = safeInvalidRequestMessage(
      zodErrors[0]
        ? `Invalid responses request: ${zodErrors[0]}`
        : "Invalid responses request."
    );
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body,
      rejectedReason,
      zodErrors,
      validationErrors: ["chat_schema_validation_failed"],
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

  if (wantsStream) {
    return respondResponsesEarlySse(c, {
      caller,
      requestId,
      body: chatParsed.data,
      limitKey,
      idempotencyKey,
      toResponsesPayload: (result) => {
        const response = isResponsesFormatResponse(result.response)
          ? result.response
          : chatCompletionResponseToResponses(
              result.response,
              result.requestId
            );
        if (
          !response ||
          typeof response !== "object" ||
          response.object !== "response"
        ) {
          throw ApiError.internal(
            "Failed to build responses payload.",
            "server_error"
          );
        }
        return response;
      },
    });
  }

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: chatParsed.data,
    limitKey,
    idempotencyKey,
    route: "/v1/responses",
    clientStream: false,
  });

  if (!result.ok) {
    if (result.httpStatus === 400) {
      logChatCompletionInvalidRequest({
        requestId: result.requestId || requestId,
        route,
        body,
        rejectedReason: safeInvalidRequestMessage(
          result.errorMessage,
          "Invalid responses request."
        ),
        validationErrors: [result.errorCode || "invalid_request_error"],
      });
    }
    return respondExecuteChatCompletionFailure(c, result);
  }

  const response = isResponsesFormatResponse(result.response)
    ? result.response
    : chatCompletionResponseToResponses(result.response, result.requestId);

  // Never return an empty / non-response payload on the success path.
  if (
    !response ||
    typeof response !== "object" ||
    response.object !== "response"
  ) {
    throw ApiError.internal(
      "Failed to build responses payload.",
      "server_error"
    );
  }

  c.header("X-Request-Id", result.requestId);
  return c.json(response);
});
