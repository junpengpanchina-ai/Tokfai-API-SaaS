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
  chatMessagesAreEmpty,
  isResponsesFormatResponse,
  ResponsesRequestSchema,
  responsesBodyToChatBody,
} from "../lib/responsesTransform.js";
import { normalizeOpenAiFinishReasonOnChatCompletion } from "../lib/openaiFinishReason.js";
import {
  applyRebuiltPreviousResponseBody,
  detectPreviousResponseToolOutputBridge,
  persistResponsesToolStateFromRound1,
  resolvePreviousResponseToolOutputBridge,
} from "../lib/responsesPreviousResponseBridge.js";
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

  // P1093 — previous_response_id + function_call_output state bridge.
  // Resolve before provider fetch / billing. On miss/mismatch: JSON error, no charge.
  let responsesRequestBody: Record<string, unknown> = {
    ...(parsed.data as Record<string, unknown>),
  };
  // Keep a copy of the pre-bridge body for round1 state persist (original input).
  const round1PersistBody: Record<string, unknown> = {
    ...responsesRequestBody,
  };
  try {
    const bridge = detectPreviousResponseToolOutputBridge(responsesRequestBody);
    if (bridge) {
      const resolved = await resolvePreviousResponseToolOutputBridge({
        bridge,
        userId: caller.userId,
        route,
      });
      if (!resolved.ok) {
        logChatCompletionInvalidRequest({
          requestId,
          route,
          body,
          rejectedReason: safeInvalidRequestMessage(
            resolved.error.publicMessage,
            "Invalid previous_response_id resume."
          ),
          validationErrors: [resolved.error.code || "previous_response_not_found"],
        });
        return respondApiError(c, resolved.error, requestId);
      }
      responsesRequestBody = applyRebuiltPreviousResponseBody(
        responsesRequestBody,
        resolved
      );
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      logChatCompletionInvalidRequest({
        requestId,
        route,
        body,
        rejectedReason: safeInvalidRequestMessage(
          err.publicMessage,
          "Invalid function_call_output."
        ),
        validationErrors: [err.code || "invalid_function_call_output"],
      });
      return respondApiError(c, err, requestId);
    }
    throw err;
  }

  const wantsStream = responsesRequestBody.stream === true;
  const chatBody = responsesBodyToChatBody(
    responsesRequestBody as Parameters<typeof responsesBodyToChatBody>[0]
  );
  if (
    !chatBody.messages?.length ||
    chatMessagesAreEmpty(
      chatBody.messages as Array<{
        role: string;
        content?: unknown;
        tool_calls?: unknown;
      }>
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

  // P1001/P1080 — client disconnect aborts Heavy queue wait + upstream fetch.
  const abortSignal = c.req.raw.signal;

  const persistRound1ToolState = async (
    response: Record<string, unknown>,
    opts?: { awaitDurable?: boolean }
  ) => {
    try {
      const tokfai = asTokfaiMeta(response.tokfai);
      await persistResponsesToolStateFromRound1({
        response,
        requestBody: round1PersistBody,
        userId: caller.userId,
        route,
        providerId:
          typeof tokfai?.routing_strategy === "string"
            ? tokfai.routing_strategy
            : undefined,
        requestedModel:
          typeof tokfai?.requested_model === "string"
            ? tokfai.requested_model
            : typeof round1PersistBody.model === "string"
              ? round1PersistBody.model
              : undefined,
        resolvedModel:
          typeof tokfai?.resolved_model === "string"
            ? tokfai.resolved_model
            : typeof response.model === "string"
              ? response.model
              : undefined,
        awaitDurable: opts?.awaitDurable !== false,
      });
    } catch {
      // State persist must never break the client response path.
    }
  };

  if (wantsStream) {
    return respondResponsesEarlySse(c, {
      caller,
      requestId,
      body: chatParsed.data,
      limitKey,
      idempotencyKey,
      abortSignal,
      toResponsesPayload: (result) => {
        const chatSnap = isResponsesFormatResponse(result.response)
          ? result.response
          : normalizeOpenAiFinishReasonOnChatCompletion(result.response, {
              route,
            });
        const response = isResponsesFormatResponse(chatSnap)
          ? chatSnap
          : chatCompletionResponseToResponses(chatSnap, result.requestId);
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
        // Memory sync inside; durable fire-and-forget (do not block SSE).
        void persistRound1ToolState(response, { awaitDurable: false });
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
    abortSignal,
  });

  if (!result.ok) {
    if (
      typeof result.retryAfterSeconds === "number" &&
      Number.isFinite(result.retryAfterSeconds)
    ) {
      c.header("Retry-After", String(Math.max(1, Math.trunc(result.retryAfterSeconds))));
    }
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
    : chatCompletionResponseToResponses(
        normalizeOpenAiFinishReasonOnChatCompletion(result.response, {
          route,
        }),
        result.requestId
      );

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

  await persistRound1ToolState(response, { awaitDurable: true });

  c.header("X-Request-Id", result.requestId);
  return c.json(response);
});

function asTokfaiMeta(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
