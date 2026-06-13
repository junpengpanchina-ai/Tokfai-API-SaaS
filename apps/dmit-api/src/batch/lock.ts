import { randomUUID } from "node:crypto";

import { env } from "../env.js";
import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";

const lockTokens = new Map<string, string>();

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export async function tryAcquireBatchLock(batchId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return true;
  }

  try {
    const lockKey = redisKey("batch", "lock", batchId);
    const token = randomUUID();
    const ttlSeconds = Math.max(
      1,
      Math.ceil(env.TOKFAI_BATCH_LOCK_TTL_MS / 1000)
    );
    const result = await redis.set(lockKey, token, {
      NX: true,
      EX: ttlSeconds,
    });

    if (result !== "OK") {
      return false;
    }

    lockTokens.set(batchId, token);
    return true;
  } catch (err) {
    log.warn("redis_batch_lock_fallback", {
      batchId,
      message: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

export async function releaseBatchLock(batchId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    lockTokens.delete(batchId);
    return;
  }

  const token = lockTokens.get(batchId);
  if (!token) return;

  try {
    const lockKey = redisKey("batch", "lock", batchId);
    await redis.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lockKey],
      arguments: [token],
    });
  } catch (err) {
    log.warn("redis_batch_lock_release_failed", {
      batchId,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    lockTokens.delete(batchId);
  }
}
