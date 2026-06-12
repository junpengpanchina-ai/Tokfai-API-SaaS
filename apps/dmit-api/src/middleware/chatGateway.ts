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
import { logGatewayRejection } from "../routes/chatGatewayLogs.js";

function assertBodySizeWithinLimit(contentLengthHeader: string | undefined): void {
  if (!contentLengthHeader) return;

  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength < 0) return;

  if (contentLength > env.TOKFAI_CHAT_BODY_MAX_BYTES) {
    throw ApiError.payloadTooLarge();
  }
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
      await logGatewayRejection({
        caller,
        requestId,
        err,
        limitKey,
        keyInflight: getKeyInflight(limitKey),
        globalInflight: getGlobalUpstreamInflight(),
      });
    }
    throw err;
  }

  const rate = checkRateLimit(limitKey);
  c.header("X-RateLimit-Limit", String(rate.limit));
  c.header("X-RateLimit-Remaining", String(rate.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));

  if (!rate.allowed) {
    const err = ApiError.tooManyRequests();
    await logGatewayRejection({
      caller,
      requestId,
      err,
      limitKey,
      keyInflight: getKeyInflight(limitKey),
      globalInflight: getGlobalUpstreamInflight(),
    });
    throw err;
  }

  if (!tryAcquireKeyConcurrency(limitKey)) {
    const err = ApiError.tooManyConcurrentRequests();
    await logGatewayRejection({
      caller,
      requestId,
      err,
      limitKey,
      keyInflight: getKeyInflight(limitKey),
      globalInflight: getGlobalUpstreamInflight(),
    });
    throw err;
  }

  try {
    await next();
  } finally {
    releaseKeyConcurrency(limitKey);
  }
};
