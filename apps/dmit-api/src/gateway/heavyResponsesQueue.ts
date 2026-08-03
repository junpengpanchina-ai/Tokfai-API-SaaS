/**
 * P1001 — In-process bounded FIFO queue for Heavy /v1/responses permits.
 *
 * Default-off. When disabled, delegates to tryAcquireHeavyResponses fail-fast.
 * When enabled: concurrency slots + per-key / global waiter caps, wait timeout,
 * AbortSignal removal, idempotent release. No Redis; single PM2 process only.
 *
 * Never stores client prompt text, tool payloads, outputs, or API key material.
 */

import { randomUUID } from "node:crypto";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  releaseHeavyResponses,
  tryAcquireHeavyResponses,
} from "./concurrency.js";

export type HeavyQueueAcquireResult = {
  queued: boolean;
  waitedMs: number;
  release: () => void;
};

export type AcquireHeavyQueueOptions = {
  limitKey: string;
  concurrencyLimit: number;
  queueEnabled: boolean;
  maxWaitersPerKey: number;
  maxWaitersGlobal: number;
  waitTimeoutMs: number;
  signal?: AbortSignal;
  requestId?: string;
  /** Optional route for structured logs only. */
  route?: string;
  /** Optional model id for structured logs only (never prompt text). */
  model?: string;
};

type Waiter = {
  id: string;
  enqueuedAt: number;
  resolve: (result: HeavyQueueAcquireResult) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  onAbort: (() => void) | null;
  signal: AbortSignal | undefined;
  settled: boolean;
  requestId: string | undefined;
  route: string | undefined;
  model: string | undefined;
};

type KeyBucket = {
  active: number;
  waiters: Waiter[];
};

const buckets = new Map<string, KeyBucket>();
let globalWaiterCount = 0;

function getOrCreateBucket(limitKey: string): KeyBucket {
  let bucket = buckets.get(limitKey);
  if (!bucket) {
    bucket = { active: 0, waiters: [] };
    buckets.set(limitKey, bucket);
  }
  return bucket;
}

function maybeDeleteBucket(limitKey: string): void {
  const bucket = buckets.get(limitKey);
  if (!bucket) return;
  if (bucket.active <= 0 && bucket.waiters.length === 0) {
    buckets.delete(limitKey);
  }
}

function clearWaiterSideEffects(waiter: Waiter): void {
  if (waiter.timer) {
    clearTimeout(waiter.timer);
    waiter.timer = null;
  }
  if (waiter.onAbort && waiter.signal) {
    waiter.signal.removeEventListener("abort", waiter.onAbort);
    waiter.onAbort = null;
  }
}

function removeWaiterFromBucket(limitKey: string, waiter: Waiter): boolean {
  const bucket = buckets.get(limitKey);
  if (!bucket) return false;
  const idx = bucket.waiters.indexOf(waiter);
  if (idx < 0) return false;
  bucket.waiters.splice(idx, 1);
  globalWaiterCount = Math.max(0, globalWaiterCount - 1);
  maybeDeleteBucket(limitKey);
  return true;
}

function makePermit(
  limitKey: string,
  queued: boolean,
  waitedMs: number,
  meta: { requestId?: string; route?: string; model?: string }
): HeavyQueueAcquireResult {
  let released = false;
  return {
    queued,
    waitedMs,
    release: () => {
      if (released) return;
      released = true;
      releaseActiveSlot(limitKey, meta);
    },
  };
}

function releaseActiveSlot(
  limitKey: string,
  meta: { requestId?: string; route?: string; model?: string }
): void {
  const bucket = buckets.get(limitKey);
  if (!bucket) return;

  bucket.active = Math.max(0, bucket.active - 1);

  log.info("heavy_queue_released", {
    requestId: meta.requestId,
    route: meta.route,
    model: meta.model,
    queued: false,
    waitedMs: 0,
    queueDepthForKey: bucket.waiters.length,
    globalQueueDepth: globalWaiterCount,
    reason: "release",
  });

  wakeNextWaiter(limitKey);
  maybeDeleteBucket(limitKey);
}

function wakeNextWaiter(limitKey: string): void {
  const bucket = buckets.get(limitKey);
  if (!bucket) return;

  while (bucket.waiters.length > 0) {
    const waiter = bucket.waiters.shift()!;
    globalWaiterCount = Math.max(0, globalWaiterCount - 1);
    clearWaiterSideEffects(waiter);

    if (waiter.settled) {
      continue;
    }
    waiter.settled = true;

    bucket.active += 1;
    const waitedMs = Math.max(0, Date.now() - waiter.enqueuedAt);

    log.info("heavy_queue_acquired", {
      requestId: waiter.requestId,
      route: waiter.route,
      model: waiter.model,
      queued: true,
      waitedMs,
      queueDepthForKey: bucket.waiters.length,
      globalQueueDepth: globalWaiterCount,
      reason: "dequeued",
    });

    waiter.resolve(
      makePermit(limitKey, true, waitedMs, {
        requestId: waiter.requestId,
        route: waiter.route,
        model: waiter.model,
      })
    );
    return;
  }

  maybeDeleteBucket(limitKey);
}

function settleReject(
  limitKey: string,
  waiter: Waiter,
  err: unknown,
  reason: "timeout" | "aborted"
): void {
  if (waiter.settled) return;
  waiter.settled = true;
  clearWaiterSideEffects(waiter);
  removeWaiterFromBucket(limitKey, waiter);

  const logFn = reason === "timeout" ? log.warn : log.info;
  logFn(reason === "timeout" ? "heavy_queue_timeout" : "heavy_queue_aborted", {
    requestId: waiter.requestId,
    route: waiter.route,
    model: waiter.model,
    queued: true,
    waitedMs: Math.max(0, Date.now() - waiter.enqueuedAt),
    queueDepthForKey: buckets.get(limitKey)?.waiters.length ?? 0,
    globalQueueDepth: globalWaiterCount,
    reason,
  });

  waiter.reject(err);
}

/**
 * Acquire a Heavy /v1/responses concurrency permit (optional bounded FIFO wait).
 */
export async function acquireHeavyResponsesPermit(
  options: AcquireHeavyQueueOptions
): Promise<HeavyQueueAcquireResult> {
  const {
    limitKey,
    concurrencyLimit,
    queueEnabled,
    maxWaitersPerKey,
    maxWaitersGlobal,
    waitTimeoutMs,
    signal,
    requestId,
    route,
    model,
  } = options;

  if (!queueEnabled) {
    const acquired = await tryAcquireHeavyResponses(limitKey);
    if (!acquired) {
      throw ApiError.heavyResponsesRateLimited();
    }
    let released = false;
    return {
      queued: false,
      waitedMs: 0,
      release: () => {
        if (released) return;
        released = true;
        void releaseHeavyResponses(limitKey);
      },
    };
  }

  if (signal?.aborted) {
    throw ApiError.heavyQueueAborted();
  }

  const limit = Math.max(1, Math.trunc(concurrencyLimit));
  const bucket = getOrCreateBucket(limitKey);

  if (bucket.active < limit) {
    bucket.active += 1;
    log.info("heavy_queue_acquired", {
      requestId,
      route,
      model,
      queued: false,
      waitedMs: 0,
      queueDepthForKey: bucket.waiters.length,
      globalQueueDepth: globalWaiterCount,
      reason: "immediate",
    });
    return makePermit(limitKey, false, 0, { requestId, route, model });
  }

  if (bucket.waiters.length >= maxWaitersPerKey) {
    log.warn("heavy_queue_full", {
      requestId,
      route,
      model,
      queued: false,
      waitedMs: 0,
      queueDepthForKey: bucket.waiters.length,
      globalQueueDepth: globalWaiterCount,
      reason: "per_key_cap",
    });
    throw ApiError.heavyQueueFull();
  }

  if (globalWaiterCount >= maxWaitersGlobal) {
    log.warn("heavy_queue_full", {
      requestId,
      route,
      model,
      queued: false,
      waitedMs: 0,
      queueDepthForKey: bucket.waiters.length,
      globalQueueDepth: globalWaiterCount,
      reason: "global_cap",
    });
    throw ApiError.heavyQueueFull();
  }

  return new Promise<HeavyQueueAcquireResult>((resolve, reject) => {
    const waiter: Waiter = {
      id: randomUUID(),
      enqueuedAt: Date.now(),
      resolve,
      reject,
      timer: null,
      onAbort: null,
      signal,
      settled: false,
      requestId,
      route,
      model,
    };

    bucket.waiters.push(waiter);
    globalWaiterCount += 1;

    log.info("heavy_queue_enqueued", {
      requestId,
      route,
      model,
      queued: true,
      waitedMs: 0,
      queueDepthForKey: bucket.waiters.length,
      globalQueueDepth: globalWaiterCount,
      reason: "waiting",
    });

    waiter.timer = setTimeout(() => {
      settleReject(
        limitKey,
        waiter,
        ApiError.heavyQueueTimeout(waitTimeoutMs),
        "timeout"
      );
    }, waitTimeoutMs);

    if (signal) {
      const onAbort = () => {
        settleReject(limitKey, waiter, ApiError.heavyQueueAborted(), "aborted");
      };
      waiter.onAbort = onAbort;
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
    }
  });
}

/** Test-only: reset in-process queue state. */
export function __heavyQueueTestReset(): void {
  for (const [, bucket] of buckets) {
    for (const waiter of bucket.waiters) {
      clearWaiterSideEffects(waiter);
      if (!waiter.settled) {
        waiter.settled = true;
        // Use ApiError so executeChatCompletion acquire catch returns failureResult.
        waiter.reject(ApiError.heavyQueueAborted("heavy_queue_test_reset"));
      }
    }
    bucket.waiters.length = 0;
    bucket.active = 0;
  }
  buckets.clear();
  globalWaiterCount = 0;
}

/** Test-only snapshot (REAL SEMAPHORE TEST introspection). */
export function __heavyQueueTestSnapshot(): {
  globalWaiterCount: number;
  keys: Array<{ active: number; waiters: number }>;
  keyCount: number;
} {
  const keys: Array<{ active: number; waiters: number }> = [];
  for (const [, bucket] of buckets) {
    keys.push({ active: bucket.active, waiters: bucket.waiters.length });
  }
  return {
    globalWaiterCount,
    keys,
    keyCount: buckets.size,
  };
}
