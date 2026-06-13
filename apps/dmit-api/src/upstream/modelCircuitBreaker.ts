/** Circuit breaker — shared via Redis when enabled, else process-local. */

import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

interface BreakerState {
  failures: number;
  openUntil: number;
}

const states = new Map<string, BreakerState>();

const CIRCUIT_FAILURE_CODES = new Set([
  "upstream_model_busy",
  "model_not_available",
  "upstream_timeout",
  "upstream_error",
  "upstream_rate_limited",
]);

export function isCircuitFailureCode(code: string | undefined): boolean {
  return Boolean(code && CIRCUIT_FAILURE_CODES.has(code));
}

export async function isCircuitOpen(model: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return await isCircuitOpenRedis(redis, model);
    } catch (err) {
      log.warn("redis_circuit_open_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return isCircuitOpenMemory(model);
}

export async function recordModelFailure(
  model: string,
  code: string | undefined
): Promise<void> {
  if (!isCircuitFailureCode(code)) return;

  const redis = getRedisClient();
  if (redis) {
    try {
      await recordModelFailureRedis(redis, model);
      return;
    } catch (err) {
      log.warn("redis_circuit_failure_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  recordModelFailureMemory(model);
}

export async function recordModelSuccess(model: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(redisKey("circuit", model));
      states.delete(model);
      return;
    } catch (err) {
      log.warn("redis_circuit_success_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  states.delete(model);
}

export async function filterAttemptsByCircuitBreaker(
  attempts: string[]
): Promise<string[]> {
  const openChecks = await Promise.all(
    attempts.map(async (model) => ({
      model,
      open: await isCircuitOpen(model),
    }))
  );
  return openChecks.filter((entry) => !entry.open).map((entry) => entry.model);
}

function isCircuitOpenMemory(model: string): boolean {
  const state = states.get(model);
  if (!state) return false;
  if (Date.now() >= state.openUntil) {
    states.delete(model);
    return false;
  }
  return state.openUntil > 0;
}

function recordModelFailureMemory(model: string): void {
  const now = Date.now();
  const prev = states.get(model);
  const failures =
    prev && now < prev.openUntil ? prev.failures + 1 : (prev?.failures ?? 0) + 1;

  if (failures >= FAILURE_THRESHOLD) {
    states.set(model, { failures, openUntil: now + COOLDOWN_MS });
    return;
  }

  states.set(model, { failures, openUntil: 0 });
}

async function isCircuitOpenRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  model: string
): Promise<boolean> {
  const key = redisKey("circuit", model);
  const raw = await redis.get(key);
  if (!raw) return false;

  const state = parseBreakerState(raw);
  if (!state) {
    await redis.del(key);
    return false;
  }

  if (state.openUntil > 0 && Date.now() >= state.openUntil) {
    await redis.del(key);
    return false;
  }

  return state.openUntil > 0;
}

async function recordModelFailureRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  model: string
): Promise<void> {
  const key = redisKey("circuit", model);
  const now = Date.now();
  const raw = await redis.get(key);
  const prev = raw ? parseBreakerState(raw) : null;
  const failures =
    prev && now < prev.openUntil
      ? prev.failures + 1
      : (prev?.failures ?? 0) + 1;

  const next: BreakerState =
    failures >= FAILURE_THRESHOLD
      ? { failures, openUntil: now + COOLDOWN_MS }
      : { failures, openUntil: 0 };

  if (next.openUntil > 0) {
    await redis.set(key, serializeBreakerState(next), {
      PX: COOLDOWN_MS,
    });
  } else {
    await redis.set(key, serializeBreakerState(next));
  }

  states.set(model, next);
}

function parseBreakerState(raw: string): BreakerState | null {
  try {
    const parsed = JSON.parse(raw) as BreakerState;
    if (
      typeof parsed.failures !== "number" ||
      typeof parsed.openUntil !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function serializeBreakerState(state: BreakerState): string {
  return JSON.stringify(state);
}
