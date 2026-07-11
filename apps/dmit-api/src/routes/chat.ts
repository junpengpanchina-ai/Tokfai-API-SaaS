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
import { chatCompletionToSseBody } from "../lib/chatCompletionSse.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import { respondExecuteChatCompletionFailure } from "../lib/handleExecuteChatCompletionResult.js";
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { readJsonBodyWithLimit } from "../lib/readJsonBodyWithLimit.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKeyOrSupabaseJwt (sk-tokfai_ or Supabase JWT).
 * Non-stream requests return JSON; stream=true returns OpenAI-compatible SSE
 * (synthesized from a completed upstream response) ending with data: [DONE].
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKeyOrSupabaseJwt);
chatRoutes.use("/v1/chat/completions", chatGatewayMiddleware);

chatRoutes.post("/v1/chat/completions", async (c) => {
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

  const parsed = ChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid chat completion request.",
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

  const wantsStream = parsed.data.stream === true;

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: { ...parsed.data, stream: false },
    limitKey,
    idempotencyKey,
  });

  if (!result.ok) {
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
