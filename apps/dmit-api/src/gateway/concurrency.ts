import { env } from "../env.js";
import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";

/** Per-key in-flight chat requests (entire handler, including fallback). */
const keyInflight = new Map<string, number>();

/** Global in-flight upstream chat fetches. */
let globalUpstreamInflight = 0;

export function gatewayLimitKey(apiKeyId: string | null, userId: string): string {
  return apiKeyId ?? `user:${userId}`;
}

export async function getKeyInflight(limitKey: string): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(redisKey("inflight", "key", limitKey));
      if (!raw) return keyInflight.get(limitKey) ?? 0;
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      // fall through to memory
    }
  }

  return keyInflight.get(limitKey) ?? 0;
}

export async function getGlobalUpstreamInflight(): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(redisKey("inflight", "global"));
      if (!raw) return globalUpstreamInflight;
      const value = Number(raw);
      return Number.isFinite(value) ? value : globalUpstreamInflight;
    } catch {
      // fall through to memory
    }
  }

  return globalUpstreamInflight;
}

export async function tryAcquireKeyConcurrency(limitKey: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const acquired = await tryIncrementCounter(
        redis,
        redisKey("inflight", "key", limitKey),
        env.TOKFAI_MAX_CONCURRENCY_PER_KEY
      );
      if (acquired) return true;
      return false;
    } catch (err) {
      log.warn("redis_key_concurrency_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return tryAcquireKeyConcurrencyMemory(limitKey);
}

export async function releaseKeyConcurrency(limitKey: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await decrementCounter(redis, redisKey("inflight", "key", limitKey));
      return;
    } catch (err) {
      log.warn("redis_key_concurrency_release_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  releaseKeyConcurrencyMemory(limitKey);
}

export async function tryAcquireGlobalUpstream(): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return await tryIncrementCounter(
        redis,
        redisKey("inflight", "global"),
        env.TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY
      );
    } catch (err) {
      log.warn("redis_global_concurrency_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return tryAcquireGlobalUpstreamMemory();
}

export async function releaseGlobalUpstream(): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await decrementCounter(redis, redisKey("inflight", "global"));
      return;
    } catch (err) {
      log.warn("redis_global_concurrency_release_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  releaseGlobalUpstreamMemory();
}

function tryAcquireKeyConcurrencyMemory(limitKey: string): boolean {
  const current = keyInflight.get(limitKey) ?? 0;
  if (current >= env.TOKFAI_MAX_CONCURRENCY_PER_KEY) {
    return false;
  }
  keyInflight.set(limitKey, current + 1);
  return true;
}

function releaseKeyConcurrencyMemory(limitKey: string): void {
  const current = keyInflight.get(limitKey) ?? 0;
  if (current <= 1) {
    keyInflight.delete(limitKey);
    return;
  }
  keyInflight.set(limitKey, current - 1);
}

function tryAcquireGlobalUpstreamMemory(): boolean {
  if (globalUpstreamInflight >= env.TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY) {
    return false;
  }
  globalUpstreamInflight += 1;
  return true;
}

function releaseGlobalUpstreamMemory(): void {
  globalUpstreamInflight = Math.max(0, globalUpstreamInflight - 1);
}

async function tryIncrementCounter(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  key: string,
  limit: number
): Promise<boolean> {
  const count = await redis.incr(key);
  if (count > limit) {
    await redis.decr(key);
    return false;
  }
  return true;
}

async function decrementCounter(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  key: string
): Promise<void> {
  const next = await redis.decr(key);
  if (next <= 0) {
    await redis.del(key);
  }
}
