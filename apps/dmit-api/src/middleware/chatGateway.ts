import type { MiddlewareHandler } from "hono";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
  releaseKeyConcurrency,
  tryAcquireKeyConcurrency,
} from "../gateway/concurrency.js";
import { checkRateLimit } from "../gateway/rateLimit.js";
import { getChatCaller } from "./chatAuth.js";
import { respondApiError } from "./error.js";
import { logGatewayRejection } from "../routes/chatGatewayLogs.js";

function bodyTooLargeError(): ApiError {
  return ApiError.payloadTooLarge();
}

function assertBodySizeWithinLimit(contentLengthHeader: string | undefined): void {
  if (!contentLengthHeader) return;

  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength < 0) return;

  if (contentLength > env.TOKFAI_CHAT_BODY_MAX_BYTES) {
    throw bodyTooLargeError();
  }
}

async function rejectGatewayGuard(
  c: Parameters<MiddlewareHandler>[0],
  args: {
    caller: ReturnType<typeof getChatCaller>;
    requestId: string;
    err: ApiError;
    limitKey: string;
  }
) {
  const { caller, requestId, err, limitKey } = args;

  await logGatewayRejection({
    caller,
    requestId,
    err,
    limitKey,
    keyInflight: await getKeyInflight(limitKey),
    globalInflight: await getGlobalUpstreamInflight(),
  });

  return respondApiError(c, err, requestId);
}

/**
 * Per-key RPM limit, per-key concurrency cap, and Content-Length body guard.
 * Runs after auth on /v1/chat/completions only.
 */
export const chatGatewayMiddleware: MiddlewareHandler = async (c, next) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);

  try {
    assertBodySizeWithinLimit(c.req.header("content-length"));
  } catch (err) {
    if (err instanceof ApiError && err.code === "request_body_too_large") {
      return rejectGatewayGuard(c, { caller, requestId, err, limitKey });
    }
    throw err;
  }

  const rate = await checkRateLimit(limitKey);
  c.header("X-RateLimit-Limit", String(rate.limit));
  c.header("X-RateLimit-Remaining", String(rate.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));

  if (!rate.allowed) {
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyRequests(),
      limitKey,
    });
  }

  if (!(await tryAcquireKeyConcurrency(limitKey))) {
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyConcurrentRequests(),
      limitKey,
    });
  }

  try {
    await next();
  } finally {
    await releaseKeyConcurrency(limitKey);
  }
};
