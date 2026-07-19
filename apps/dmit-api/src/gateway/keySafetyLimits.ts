import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";
import { supabase } from "../supabase.js";

/**
 * Per-key / per-user safety limits for public beta (1000-user relay protection).
 *
 * - RPM: existing gateway rateLimit (separate)
 * - TPM: estimated tokens/min before upstream
 * - daily_credit_limit / monthly_credit_limit: sum of charged credits
 * - max_output_tokens: clamp in resolveMaxOutputTokens()
 *
 * Unlimited billing is NEVER granted to ordinary users. It requires:
 *   TOKFAI_UNLIMITED_BILLING_ENABLED=true
 *   AND userId ∈ TOKFAI_UNLIMITED_BILLING_USER_IDS
 * and is audit-logged with an explicit reason.
 *
 * Stream billing rule (chat/responses):
 * - Upstream is always invoked with stream:false; SSE is synthesized after success.
 * - Usage is therefore always known before finalize; success always debits via
 *   record_usage_and_debit.
 * - Upstream timeout / 4xx / 5xx / model_busy → billable:false, no finalize charge.
 * - There is no partial-stream path that can expose usage without finalize.
 */

interface TokenWindowState {
  tokens: number;
  windowStart: number;
}

const tokenWindows = new Map<string, TokenWindowState>();

export function resolveMaxOutputTokens(
  requested: number | undefined | null
): number {
  const cap = env.TOKFAI_MAX_OUTPUT_TOKENS;
  if (requested === undefined || requested === null || !Number.isFinite(requested)) {
    return cap;
  }
  const n = Math.trunc(requested);
  if (n <= 0) return cap;
  return Math.min(n, cap);
}

export function isUnlimitedBillingUser(userId: string): boolean {
  if (!env.TOKFAI_UNLIMITED_BILLING_ENABLED) return false;
  if (!userId) return false;
  return env.TOKFAI_UNLIMITED_BILLING_USER_IDS.includes(userId);
}

/** Audit when an allowlisted internal/test account uses unlimited billing. */
export function logUnlimitedBillingGranted(
  userId: string,
  reason: string,
  requestId: string
): void {
  log.warn("unlimited_billing_granted", {
    userId,
    reason,
    requestId,
    code: "unlimited_billing_allowlist",
  });
}

function checkTokenRateLimitMemory(
  limitKey: string,
  estimatedTokens: number
): { allowed: boolean; limit: number; remaining: number } {
  const limit = env.TOKFAI_RATE_LIMIT_TPM;
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const now = Date.now();
  const tokens = Math.max(1, Math.trunc(estimatedTokens));

  let state = tokenWindows.get(limitKey);
  if (!state || now - state.windowStart >= windowMs) {
    state = { tokens: 0, windowStart: now };
    tokenWindows.set(limitKey, state);
  }

  if (state.tokens + tokens > limit) {
    return {
      allowed: false,
      limit,
      remaining: Math.max(0, limit - state.tokens),
    };
  }

  state.tokens += tokens;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - state.tokens),
  };
}

async function checkTokenRateLimitRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  limitKey: string,
  estimatedTokens: number
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const limit = env.TOKFAI_RATE_LIMIT_TPM;
  const windowMs = env.TOKFAI_RATE_LIMIT_WINDOW_MS;
  const now = Date.now();
  const windowBucket = Math.floor(now / windowMs);
  const key = redisKey("tpm", limitKey, String(windowBucket));
  const tokens = Math.max(1, Math.trunc(estimatedTokens));

  const count = await redis.incrBy(key, tokens);
  if (count === tokens) {
    await redis.pExpire(key, windowMs);
  }

  if (count > limit) {
    // Best-effort rollback so a rejected request does not permanently burn TPM.
    try {
      await redis.incrBy(key, -tokens);
    } catch {
      // ignore
    }
    return { allowed: false, limit, remaining: 0 };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count),
  };
}

export async function checkTokenRateLimit(
  limitKey: string,
  estimatedTokens: number
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return await checkTokenRateLimitRedis(redis, limitKey, estimatedTokens);
    } catch (err) {
      log.warn("redis_tpm_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return checkTokenRateLimitMemory(limitKey, estimatedTokens);
}

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfUtcMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function sumChargedCreditsSince(
  userId: string,
  sinceIso: string
): Promise<number> {
  const { data, error } = await supabase()
    .from("usage_logs")
    .select("credits_charged")
    .eq("user_id", userId)
    .eq("billing_status", "charged")
    .gt("credits_charged", 0)
    .gte("created_at", sinceIso)
    .limit(5000);

  if (error) {
    log.warn("credit_period_sum_failed", {
      userId,
      message: "Failed to sum charged credits for period limit.",
    });
    // Fail open on read errors so a metrics glitch does not take the API down;
    // atomic debit still protects balance.
    return 0;
  }

  let sum = 0;
  for (const row of data ?? []) {
    const n = Number(row.credits_charged);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

export async function assertCreditPeriodLimits(userId: string): Promise<void> {
  if (isUnlimitedBillingUser(userId)) return;

  const [daily, monthly] = await Promise.all([
    sumChargedCreditsSince(userId, startOfUtcDayIso()),
    sumChargedCreditsSince(userId, startOfUtcMonthIso()),
  ]);

  if (daily >= env.TOKFAI_DAILY_CREDIT_LIMIT) {
    throw new ApiError({
      status: 429,
      message: "Daily credit limit exceeded.",
      code: "daily_credit_limit_exceeded",
      type: "rate_limit_error",
      publicMessage:
        "Daily credit limit exceeded. Please try again tomorrow or contact support.",
    });
  }

  if (monthly >= env.TOKFAI_MONTHLY_CREDIT_LIMIT) {
    throw new ApiError({
      status: 429,
      message: "Monthly credit limit exceeded.",
      code: "monthly_credit_limit_exceeded",
      type: "rate_limit_error",
      publicMessage:
        "Monthly credit limit exceeded. Please try again next month or contact support.",
    });
  }
}

export async function assertTokenBudget(
  limitKey: string,
  estimatedTokens: number
): Promise<void> {
  const tpm = await checkTokenRateLimit(limitKey, estimatedTokens);
  if (!tpm.allowed) {
    throw ApiError.tooManyRequests(
      "Token rate limit exceeded.",
      "请求 token 速率过高，请降低频率或缩短输出。"
    );
  }
}
