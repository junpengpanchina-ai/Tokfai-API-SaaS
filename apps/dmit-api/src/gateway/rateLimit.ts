import { env } from "../env.js";

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

/** Process-local fixed-window rate limiter keyed by api_key_id or user id. */
const windows = new Map<string, WindowState>();

export function checkRateLimit(limitKey: string): RateLimitResult {
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

export function setRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}
