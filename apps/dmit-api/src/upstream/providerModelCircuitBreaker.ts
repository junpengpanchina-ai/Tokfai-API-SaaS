/**
 * Provider+model circuit breaker for upstream timeouts.
 *
 * After N consecutive timeouts on the same provider/model, mark the pair
 * degraded for a short cooldown. Callers may skip to the next *configured*
 * provider, or return timeout with suggestedModels — never invent a more
 * expensive model switch outside alias config.
 */

import { log } from "../logger.js";
import { getRedisClient, redisKey } from "../redis/client.js";
import type { UpstreamProvider } from "./providers.js";

const TIMEOUT_FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

interface BreakerState {
  failures: number;
  openUntil: number;
}

const states = new Map<string, BreakerState>();

function circuitKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

export async function isProviderModelDegraded(
  providerId: string,
  model: string
): Promise<boolean> {
  const key = circuitKey(providerId, model);
  const redis = getRedisClient();
  if (redis) {
    try {
      return await isOpenRedis(redis, key);
    } catch (err) {
      log.warn("redis_provider_circuit_open_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return isOpenMemory(key);
}

export async function recordProviderModelTimeout(
  providerId: string,
  model: string
): Promise<{ degraded: boolean; failures: number }> {
  const key = circuitKey(providerId, model);
  const redis = getRedisClient();
  if (redis) {
    try {
      return await recordFailureRedis(redis, key, providerId, model);
    } catch (err) {
      log.warn("redis_provider_circuit_failure_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return recordFailureMemory(key, providerId, model);
}

export async function recordProviderModelSuccess(
  providerId: string,
  model: string
): Promise<void> {
  const key = circuitKey(providerId, model);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(redisKey("provider_circuit", key));
      states.delete(key);
      return;
    } catch (err) {
      log.warn("redis_provider_circuit_success_fallback", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  states.delete(key);
}

/**
 * Prefer non-degraded providers when alternatives exist.
 * If every provider is degraded, keep the original order (still attempt /
 * fail with suggestions) — do not invent unconfigured providers.
 */
export async function filterProvidersByTimeoutCircuit(
  providers: UpstreamProvider[],
  model: string
): Promise<{
  providers: UpstreamProvider[];
  skippedDegraded: UpstreamProvider[];
  allDegraded: boolean;
}> {
  if (providers.length === 0) {
    return { providers: [], skippedDegraded: [], allDegraded: false };
  }

  const checks = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      degraded: await isProviderModelDegraded(provider.id, model),
    }))
  );

  const healthy = checks.filter((c) => !c.degraded).map((c) => c.provider);
  const skippedDegraded = checks.filter((c) => c.degraded).map((c) => c.provider);
  const allDegraded = healthy.length === 0;

  return {
    providers: allDegraded ? providers : healthy,
    skippedDegraded,
    allDegraded,
  };
}

function isOpenMemory(key: string): boolean {
  const state = states.get(key);
  if (!state) return false;
  if (Date.now() >= state.openUntil) {
    states.delete(key);
    return false;
  }
  return state.openUntil > 0;
}

function recordFailureMemory(
  key: string,
  providerId: string,
  model: string
): { degraded: boolean; failures: number } {
  const now = Date.now();
  const prev = states.get(key);
  const failures =
    prev && now < prev.openUntil ? prev.failures + 1 : (prev?.failures ?? 0) + 1;

  if (failures >= TIMEOUT_FAILURE_THRESHOLD) {
    states.set(key, { failures, openUntil: now + COOLDOWN_MS });
    log.warn("provider_model_circuit_degraded", {
      providerId,
      model,
      failures,
      cooldownMs: COOLDOWN_MS,
    });
    return { degraded: true, failures };
  }

  states.set(key, { failures, openUntil: 0 });
  return { degraded: false, failures };
}

async function isOpenRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  key: string
): Promise<boolean> {
  const raw = await redis.get(redisKey("provider_circuit", key));
  if (!raw) return false;
  const state = parseBreakerState(raw);
  if (!state) {
    await redis.del(redisKey("provider_circuit", key));
    return false;
  }
  if (state.openUntil > 0 && Date.now() >= state.openUntil) {
    await redis.del(redisKey("provider_circuit", key));
    return false;
  }
  return state.openUntil > 0;
}

async function recordFailureRedis(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  key: string,
  providerId: string,
  model: string
): Promise<{ degraded: boolean; failures: number }> {
  const redisKeyName = redisKey("provider_circuit", key);
  const now = Date.now();
  const raw = await redis.get(redisKeyName);
  const prev = raw ? parseBreakerState(raw) : null;
  const failures =
    prev && now < prev.openUntil
      ? prev.failures + 1
      : (prev?.failures ?? 0) + 1;

  const next: BreakerState =
    failures >= TIMEOUT_FAILURE_THRESHOLD
      ? { failures, openUntil: now + COOLDOWN_MS }
      : { failures, openUntil: 0 };

  if (next.openUntil > 0) {
    await redis.set(redisKeyName, serializeBreakerState(next), {
      PX: COOLDOWN_MS,
    });
    log.warn("provider_model_circuit_degraded", {
      providerId,
      model,
      failures,
      cooldownMs: COOLDOWN_MS,
    });
  } else {
    await redis.set(redisKeyName, serializeBreakerState(next));
  }

  states.set(key, next);
  return { degraded: next.openUntil > 0, failures };
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

/** Test / ops helpers — not used on the hot path. */
export const PROVIDER_TIMEOUT_CIRCUIT = {
  FAILURE_THRESHOLD: TIMEOUT_FAILURE_THRESHOLD,
  COOLDOWN_MS,
} as const;
