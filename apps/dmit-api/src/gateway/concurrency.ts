import { env } from "../env.js";

/** Per-key in-flight chat requests (entire handler, including fallback). */
const keyInflight = new Map<string, number>();

/** Global in-flight upstream chat fetches. */
let globalUpstreamInflight = 0;

export function gatewayLimitKey(apiKeyId: string | null, userId: string): string {
  return apiKeyId ?? `user:${userId}`;
}

export function getKeyInflight(limitKey: string): number {
  return keyInflight.get(limitKey) ?? 0;
}

export function getGlobalUpstreamInflight(): number {
  return globalUpstreamInflight;
}

export function tryAcquireKeyConcurrency(limitKey: string): boolean {
  const current = keyInflight.get(limitKey) ?? 0;
  if (current >= env.TOKFAI_MAX_CONCURRENCY_PER_KEY) {
    return false;
  }
  keyInflight.set(limitKey, current + 1);
  return true;
}

export function releaseKeyConcurrency(limitKey: string): void {
  const current = keyInflight.get(limitKey) ?? 0;
  if (current <= 1) {
    keyInflight.delete(limitKey);
    return;
  }
  keyInflight.set(limitKey, current - 1);
}

export function tryAcquireGlobalUpstream(): boolean {
  if (globalUpstreamInflight >= env.TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY) {
    return false;
  }
  globalUpstreamInflight += 1;
  return true;
}

export function releaseGlobalUpstream(): void {
  globalUpstreamInflight = Math.max(0, globalUpstreamInflight - 1);
}
