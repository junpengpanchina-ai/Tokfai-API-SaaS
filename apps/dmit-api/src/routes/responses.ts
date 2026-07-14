import { Hono } from "hono";

import { ApiError } from "../errors.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
} from "../gateway/concurrency.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import { respondExecuteChatCompletionFailure } from "../lib/handleExecuteChatCompletionResult.js";
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { readJsonBodyWithLimit } from "../lib/readJsonBodyWithLimit.js";
import { responsesToSseBody } from "../lib/responsesSse.js";
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
 * stream=true  → OpenAI Responses SSE (synthesized from completed response)
 */
export const responsesRoutes = new Hono();

responsesRoutes.use("/v1/responses", requireApiKeyOrSupabaseJwt);
responsesRoutes.use("/v1/responses", chatGatewayMiddleware);

responsesRoutes.post("/v1/responses", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);

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
    throw ApiError.badRequest(
      "Invalid responses request: use `input` (string or message array), not `messages`.",
      "invalid_request_error"
    );
  }

  const parsed = ResponsesRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid responses request.",
      "invalid_request_error"
    );
  }

  if (
    typeof parsed.data.model !== "string" ||
    !parsed.data.model.trim()
  ) {
    throw ApiError.badRequest(
      "Invalid responses request: model is required.",
      "invalid_request_error"
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
    throw ApiError.badRequest(
      "Invalid responses request: input produced empty messages.",
      "invalid_request_error"
    );
  }
  const chatParsed = ChatCompletionRequestSchema.safeParse({
    ...chatBody,
    stream: false,
  });
  if (!chatParsed.success) {
    throw ApiError.badRequest(
      "Invalid responses request.",
      "invalid_request_error"
    );
  }

  const rawIdempotencyKey =
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key");
  const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
  if (rawIdempotencyKey && !idempotencyKey) {
    throw ApiError.badRequest(
      "Invalid Idempotency-Key header.",
      "invalid_idempotency_key"
    );
  }

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: chatParsed.data,
    limitKey,
    idempotencyKey,
    route: "/v1/responses",
  });

  if (!result.ok) {
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

  if (wantsStream) {
    const sseBody = responsesToSseBody(response);
    return c.newResponse(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": result.requestId,
      },
    });
  }

  c.header("X-Request-Id", result.requestId);
  return c.json(response);
});
