import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
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
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKeyOrSupabaseJwt (sk-tokfai_ or Supabase JWT).
 * The route proxies non-streaming
 * OpenAI-compatible requests to GRSAI and records usage after completion.
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

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: parsed.data,
    limitKey,
    idempotencyKey,
  });

  if (!result.ok) {
    if (result.httpStatus === 404) {
      throw ApiError.notFound(result.errorMessage, result.errorCode);
    }
    if (result.httpStatus === 400) {
      return c.json(
        {
          error: {
            message: result.errorMessage,
            code: result.errorCode,
            type: "invalid_request_error",
          },
        },
        400
      );
    }
    if (result.httpStatus === 402) {
      throw new ApiError({
        status: 402,
        message: result.errorMessage,
        publicMessage: result.errorMessage,
        code: result.errorCode,
        type: "billing_error",
      });
    }
    throw new ApiError({
      status: result.httpStatus,
      message: result.errorMessage,
      publicMessage: result.errorMessage,
      code: result.errorCode,
    });
  }

  return c.json(result.response);
});

async function readJsonBodyWithLimit(c: {
  req: {
    text: () => Promise<string>;
    header: (name: string) => string | undefined;
  };
}): Promise<unknown> {
  const raw = await c.req.text().catch(() => {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  });

  if (raw.length > env.TOKFAI_CHAT_BODY_MAX_BYTES) {
    throw ApiError.payloadTooLarge();
  }

  if (!raw.trim()) {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }
}
