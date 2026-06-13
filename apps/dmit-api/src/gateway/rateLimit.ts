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

export async function checkRateLimit(limitKey: string): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return await checkRateLimitRedis(redis, limitKey);
    } catch (err) {
      log.warn("redis_rate_limit_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return checkRateLimitMemory(limitKey);
}

function checkRateLimitMemory(limitKey: string): RateLimitResult {
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const limit = env.TOKFAI_RATE_LIMIT_RPM;
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
  limitKey: string
): Promise<RateLimitResult> {
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const limit = env.TOKFAI_RATE_LIMIT_RPM;
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
