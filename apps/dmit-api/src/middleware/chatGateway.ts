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
import {
  checkApiKeyRateLimit,
  checkIpRateLimit,
  checkTenantRateLimit,
} from "../gateway/rateLimit.js";
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

function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function requestRoute(c: Parameters<MiddlewareHandler>[0]): string {
  const path = c.req.path?.trim();
  return path && path.length > 0 ? path : "/v1/chat/completions";
}

async function rejectGatewayGuard(
  c: Parameters<MiddlewareHandler>[0],
  args: {
    caller: ReturnType<typeof getChatCaller>;
    requestId: string;
    err: ApiError;
    limitKey: string;
    route: string;
    reason?: string;
    limit?: number;
    current?: number;
  }
) {
  const { caller, requestId, err, limitKey, route, reason, limit, current } =
    args;

  await logGatewayRejection({
    caller,
    requestId,
    err,
    limitKey,
    keyInflight: await getKeyInflight(limitKey),
    globalInflight: await getGlobalUpstreamInflight(),
    route,
    reason,
    limit,
    current,
  });

  return respondApiError(c, err, requestId);
}

/**
 * Per-key RPM, per-IP RPM, per-tenant RPM, per-key concurrency, body size guard.
 * Runs after auth on chat / responses / gemini gateways.
 * 429 rejections are logged as non-billable (no charge).
 */
export const chatGatewayMiddleware: MiddlewareHandler = async (c, next) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);
  const route = requestRoute(c);

  try {
    assertBodySizeWithinLimit(c.req.header("content-length"));
  } catch (err) {
    if (err instanceof ApiError && err.code === "request_body_too_large") {
      return rejectGatewayGuard(c, { caller, requestId, err, limitKey, route });
    }
    throw err;
  }

  const ipRate = await checkIpRateLimit(clientIp(c));
  if (!ipRate.allowed) {
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyRequests(),
      limitKey,
      route,
      reason: "ip_rpm",
      limit: ipRate.limit,
      current: ipRate.current,
    });
  }

  const tenantRate = await checkTenantRateLimit(caller.tenantId);
  if (!tenantRate.allowed) {
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyRequests(),
      limitKey,
      route,
      reason: "tenant_rpm",
      limit: tenantRate.limit,
      current: tenantRate.current,
    });
  }

  const rate = await checkApiKeyRateLimit(limitKey);
  c.header("X-RateLimit-Limit", String(rate.limit));
  c.header("X-RateLimit-Remaining", String(rate.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));

  if (!rate.allowed) {
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyRequests(),
      limitKey,
      route,
      reason: "key_rpm",
      limit: rate.limit,
      current: rate.current,
    });
  }

  if (!(await tryAcquireKeyConcurrency(limitKey))) {
    const keyInflight = await getKeyInflight(limitKey);
    return rejectGatewayGuard(c, {
      caller,
      requestId,
      err: ApiError.tooManyConcurrentRequests(),
      limitKey,
      route,
      reason: "key_concurrency",
      limit: env.TOKFAI_MAX_CONCURRENCY_PER_KEY,
      current: keyInflight,
    });
  }

  try {
    return await next();
  } finally {
    await releaseKeyConcurrency(limitKey);
  }
};
