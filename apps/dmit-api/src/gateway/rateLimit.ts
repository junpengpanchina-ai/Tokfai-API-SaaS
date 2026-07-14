import { env } from "../env.js";
import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/** Process-local fallback when Redis is disabled or unavailable. */
const windows = new Map<string, WindowState>();

export async function checkRateLimit(
  limitKey: string,
  limitOverride?: number
): Promise<RateLimitResult> {
  const limit = limitOverride ?? env.TOKFAI_RATE_LIMIT_RPM;
  const redis = getRedisClient();
  if (redis) {
    try {
      return await checkRateLimitRedis(redis, limitKey, limit);
    } catch (err) {
      log.warn("redis_rate_limit_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return checkRateLimitMemory(limitKey, limit);
}

/** Per API key / caller identity RPM. */
export function checkApiKeyRateLimit(limitKey: string): Promise<RateLimitResult> {
  return checkRateLimit(limitKey, env.TOKFAI_RATE_LIMIT_RPM);
}

/** Per client IP RPM (short-window abuse guard). */
export function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
  const key = `ip:${ip.trim() || "unknown"}`;
  return checkRateLimit(key, env.TOKFAI_RATE_LIMIT_IP_RPM);
}

/** Per tenant RPM (shared quota across keys on a subsite). */
export function checkTenantRateLimit(
  tenantId: string | null | undefined
): Promise<RateLimitResult> {
  if (!tenantId) {
    return Promise.resolve({
      allowed: true,
      limit: env.TOKFAI_RATE_LIMIT_TENANT_RPM,
      remaining: env.TOKFAI_RATE_LIMIT_TENANT_RPM,
      resetAt: Date.now() + env.TOKFAI_RATE_LIMIT_WINDOW_MS,
    });
  }
  return checkRateLimit(`tenant:${tenantId}`, env.TOKFAI_RATE_LIMIT_TENANT_RPM);
}

function checkRateLimitMemory(
  limitKey: string,
  limit: number
): RateLimitResult {
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const now = Date.now();

  let state = windows.get(limitKey);
  if (!state || now - state.windowStart >= windowMs) {
    state = { count: 0, windowStart: now };
    windows.set(limitKey, state);
  }

  const resetAt = state.windowStart + windowMs;

  if (state.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  state.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - state.count),
    resetAt,
  };
}

async function checkRateLimitRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  limitKey: string,
  limit: number
): Promise<RateLimitResult> {
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const now = Date.now();
  const windowBucket = Math.floor(now / windowMs);
  const key = redisKey("rate", limitKey, String(windowBucket));
  const resetAt = (windowBucket + 1) * windowMs;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pExpire(key, windowMs);
  }

  if (count > limit) {
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export function setRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}
