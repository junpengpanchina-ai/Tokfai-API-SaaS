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

  const parsed = ResponsesRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid responses request.",
      "invalid_request_error"
    );
  }

  const chatBody = responsesBodyToChatBody(parsed.data);
  const chatParsed = ChatCompletionRequestSchema.safeParse(chatBody);
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

  return c.json(response);
});
