/**
 * P993-IMAGE-CIRCUIT — Image-only provider/model/operation circuit breaker.
 *
 * Key: provider:model:operation (text_to_image | image_to_image)
 * NEVER shares state with chat/responses modelCircuitBreaker.
 *
 * Store: process memory by default (PM2 single instance today).
 * When Redis is active, state is also mirrored under redisKey("image_circuit", key)
 * so multi-instance / restart can share later.
 *
 * Limits:
 * - PM2 restart without Redis → breaker state cleared (closed).
 * - Multi-instance without Redis → each process has its own breaker.
 */

export type ImageCircuitOperation = "text_to_image" | "image_to_image";
export type ImageCircuitStateName = "closed" | "open" | "half_open";

export type ImageFailureCategory =
  | "provider"
  | "client"
  | "internal"
  | "neutral";

export const IMAGE_CIRCUIT_PROVIDER_ID = "primary_image";

export const IMAGE_CIRCUIT_DEFAULTS = {
  consecutiveFailuresToOpen: 3,
  rollingWindowMs: 60_000,
  minimumRequests: 5,
  failureRateToOpen: 0.5,
  initialOpenMs: 60_000,
  maxOpenMs: 300_000,
  halfOpenMaxConcurrent: 1,
  successesToClose: 2,
} as const;

export type ImageCircuitConfig = typeof IMAGE_CIRCUIT_DEFAULTS;

export type ImageCircuitSnapshot = {
  key: string;
  state: ImageCircuitStateName;
  consecutive_failures: number;
  consecutive_successes: number;
  rolling_requests: number;
  rolling_failures: number;
  failure_rate: number;
  opened_at: number | null;
  retry_at: number | null;
  half_open_in_flight: number;
  last_failure_code: string | null;
  open_count: number;
  current_open_ms: number;
};

type RollingSample = { t: number; ok: boolean };

type BreakerRecord = {
  state: ImageCircuitStateName;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  rolling: RollingSample[];
  openedAt: number | null;
  retryAt: number | null;
  openCount: number;
  halfOpenInFlight: number;
  lastFailureCode: string | null;
  currentOpenMs: number;
};

export type AcquireResult = {
  allowed: boolean;
  stateBefore: ImageCircuitStateName;
  stateAfter: ImageCircuitStateName;
  skippedReason?: "circuit_open" | "breaker_half_open_busy";
};

export type RecordResultArgs = {
  key: string;
  success: boolean;
  code?: string | null;
  category: ImageFailureCategory;
  now?: number;
};

const memoryStore = new Map<string, BreakerRecord>();
let configOverride: Partial<ImageCircuitConfig> | null = null;
let nowFn: () => number = () => Date.now();

/** Test-only: override clock / config / clear store. */
export function __imageCircuitTestReset(opts?: {
  now?: () => number;
  config?: Partial<ImageCircuitConfig> | null;
  clear?: boolean;
}): void {
  if (opts?.now) nowFn = opts.now;
  else nowFn = () => Date.now();
  configOverride = opts?.config === undefined ? configOverride : opts.config;
  if (opts?.clear !== false) memoryStore.clear();
}

export function getImageCircuitConfig(): ImageCircuitConfig {
  return { ...IMAGE_CIRCUIT_DEFAULTS, ...configOverride };
}

export function operationFromImageMode(
  mode: string | null | undefined
): ImageCircuitOperation {
  return mode === "reference_edit" ? "image_to_image" : "text_to_image";
}

export function imageCircuitKey(
  provider: string,
  model: string,
  operation: ImageCircuitOperation
): string {
  const p = String(provider || IMAGE_CIRCUIT_PROVIDER_ID).trim() || IMAGE_CIRCUIT_PROVIDER_ID;
  const m = String(model || "").trim().toLowerCase();
  return `${p}:${m}:${operation}`;
}

/** Codes that lower provider health (count toward OPEN). */
const PROVIDER_FAILURE_CODES = new Set([
  "upstream_timeout",
  "image_generation_timeout",
  "image_task_timeout",
  "retryable_timeout",
  "upstream_error",
  "upstream_image_error",
  "upstream_model_busy",
  "upstream_model_unavailable",
  "upstream_rate_limited",
  "upstream_invalid_response",
  "missing_url",
  "provider_asset_unavailable",
  "provider_asset_invalid",
  "connection_error",
  "all_image_upstreams_unavailable",
]);

/** Client / policy — never count. */
const CLIENT_FAILURE_CODES = new Set([
  "invalid_request_error",
  "invalid_image_url",
  "invalid_prompt",
  "empty_prompt",
  "unsupported_model",
  "unsupported_size",
  "image_model_not_available",
  "model_not_image_capable",
  "image_model_not_for_chat",
  "insufficient_credits",
  "upstream_auth_error",
  "content_policy_violation",
  "content_policy_refusal",
  "safety_refusal",
  "user_cancelled",
  "canceled",
  "cancelled",
]);

/** Tokfai-internal — never lower provider health. */
const INTERNAL_FAILURE_CODES = new Set([
  "asset_persist_failed",
  "asset_verify_failed",
  "usage_billing_failed",
  "credit_precheck_failed",
  "server_error",
  "database_error",
  "ledger_failure",
]);

export function classifyImageFailureCode(
  code: string | undefined | null
): ImageFailureCategory {
  if (!code) return "neutral";
  if (INTERNAL_FAILURE_CODES.has(code)) return "internal";
  if (CLIENT_FAILURE_CODES.has(code)) return "client";
  if (PROVIDER_FAILURE_CODES.has(code)) return "provider";
  // Unknown upstream-ish codes: treat as provider if they look like upstream_*
  if (code.startsWith("upstream_") || code.startsWith("provider_")) {
    return "provider";
  }
  return "neutral";
}

export function isImageProviderCircuitFailure(
  code: string | undefined | null
): boolean {
  return classifyImageFailureCode(code) === "provider";
}

function emptyRecord(): BreakerRecord {
  return {
    state: "closed",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    rolling: [],
    openedAt: null,
    retryAt: null,
    openCount: 0,
    halfOpenInFlight: 0,
    lastFailureCode: null,
    currentOpenMs: getImageCircuitConfig().initialOpenMs,
  };
}

function pruneRolling(rec: BreakerRecord, now: number): void {
  const windowMs = getImageCircuitConfig().rollingWindowMs;
  rec.rolling = rec.rolling.filter((s) => now - s.t <= windowMs);
}

function snapshotOf(key: string, rec: BreakerRecord, now: number): ImageCircuitSnapshot {
  pruneRolling(rec, now);
  const rolling_requests = rec.rolling.length;
  const rolling_failures = rec.rolling.filter((s) => !s.ok).length;
  const failure_rate =
    rolling_requests > 0 ? rolling_failures / rolling_requests : 0;
  return {
    key,
    state: rec.state,
    consecutive_failures: rec.consecutiveFailures,
    consecutive_successes: rec.consecutiveSuccesses,
    rolling_requests,
    rolling_failures,
    failure_rate,
    opened_at: rec.openedAt,
    retry_at: rec.retryAt,
    half_open_in_flight: rec.halfOpenInFlight,
    last_failure_code: rec.lastFailureCode,
    open_count: rec.openCount,
    current_open_ms: rec.currentOpenMs,
  };
}

function getOrCreate(key: string): BreakerRecord {
  let rec = memoryStore.get(key);
  if (!rec) {
    rec = emptyRecord();
    memoryStore.set(key, rec);
  }
  return rec;
}

function transitionToOpen(rec: BreakerRecord, now: number, code: string | null): void {
  const cfg = getImageCircuitConfig();
  const nextOpenMs = Math.min(
    rec.openCount > 0
      ? Math.max(cfg.initialOpenMs, rec.currentOpenMs * 2)
      : cfg.initialOpenMs,
    cfg.maxOpenMs
  );
  rec.state = "open";
  rec.openedAt = now;
  rec.retryAt = now + nextOpenMs;
  rec.currentOpenMs = nextOpenMs;
  rec.openCount += 1;
  rec.halfOpenInFlight = 0;
  rec.consecutiveSuccesses = 0;
  rec.lastFailureCode = code;
}

function maybeOpenFromFailures(rec: BreakerRecord, now: number, code: string | null): boolean {
  const cfg = getImageCircuitConfig();
  pruneRolling(rec, now);
  const rolling_requests = rec.rolling.length;
  const rolling_failures = rec.rolling.filter((s) => !s.ok).length;
  const failure_rate =
    rolling_requests > 0 ? rolling_failures / rolling_requests : 0;

  const consecutiveHit =
    rec.consecutiveFailures >= cfg.consecutiveFailuresToOpen;
  const rateHit =
    rolling_requests >= cfg.minimumRequests &&
    failure_rate >= cfg.failureRateToOpen;

  if (consecutiveHit || rateHit) {
    transitionToOpen(rec, now, code);
    return true;
  }
  return false;
}

/** Non-mutating check — safe for POST preflight / GET diagnostics. */
export function peekImageCircuit(
  key: string,
  now = nowFn()
): AcquireResult {
  const rec = getOrCreate(key);
  const stateBefore = rec.state;

  if (rec.state === "open") {
    if (rec.retryAt != null && now >= rec.retryAt) {
      return {
        allowed: true,
        stateBefore,
        stateAfter: "half_open",
      };
    }
    return {
      allowed: false,
      stateBefore,
      stateAfter: "open",
      skippedReason: "circuit_open",
    };
  }

  if (rec.state === "half_open") {
    const max = getImageCircuitConfig().halfOpenMaxConcurrent;
    if (rec.halfOpenInFlight >= max) {
      return {
        allowed: false,
        stateBefore: "half_open",
        stateAfter: "half_open",
        skippedReason: "breaker_half_open_busy",
      };
    }
    return {
      allowed: true,
      stateBefore,
      stateAfter: "half_open",
    };
  }

  return {
    allowed: true,
    stateBefore: "closed",
    stateAfter: "closed",
  };
}

/**
 * Acquire a slot to call the provider for this breaker key.
 * OPEN → skip (circuit_open) unless cooldown elapsed → HALF_OPEN probe.
 * HALF_OPEN → only halfOpenMaxConcurrent probes; others → busy.
 */
export function acquireImageCircuit(key: string, now = nowFn()): AcquireResult {
  const rec = getOrCreate(key);
  const stateBefore = rec.state;

  if (rec.state === "open") {
    if (rec.retryAt != null && now >= rec.retryAt) {
      rec.state = "half_open";
      rec.halfOpenInFlight = 0;
      rec.consecutiveSuccesses = 0;
    } else {
      return {
        allowed: false,
        stateBefore,
        stateAfter: rec.state,
        skippedReason: "circuit_open",
      };
    }
  }

  if (rec.state === "half_open") {
    const max = getImageCircuitConfig().halfOpenMaxConcurrent;
    if (rec.halfOpenInFlight >= max) {
      return {
        allowed: false,
        stateBefore: "half_open",
        stateAfter: "half_open",
        skippedReason: "breaker_half_open_busy",
      };
    }
    rec.halfOpenInFlight += 1;
    void persistAsync(key, rec);
    return {
      allowed: true,
      stateBefore,
      stateAfter: rec.state,
    };
  }

  // closed
  void persistAsync(key, rec);
  return {
    allowed: true,
    stateBefore,
    stateAfter: rec.state,
  };
}

export function recordImageCircuitResult(args: RecordResultArgs): ImageCircuitSnapshot {
  const now = args.now ?? nowFn();
  const rec = getOrCreate(args.key);
  const cfg = getImageCircuitConfig();

  // Release half-open in-flight if we held a probe.
  if (rec.state === "half_open" && rec.halfOpenInFlight > 0) {
    rec.halfOpenInFlight = Math.max(0, rec.halfOpenInFlight - 1);
  }

  // Internal / client / neutral: do not change provider health scores.
  if (!args.success && args.category !== "provider") {
    // If half_open probe failed for non-provider reason, stay half_open
    // (do not re-open). Probe slot already released above.
    void persistAsync(args.key, rec);
    return snapshotOf(args.key, rec, now);
  }

  if (args.success) {
    rec.rolling.push({ t: now, ok: true });
    pruneRolling(rec, now);
    rec.consecutiveFailures = 0;
    rec.lastFailureCode = null;

    if (rec.state === "half_open") {
      rec.consecutiveSuccesses += 1;
      if (rec.consecutiveSuccesses >= cfg.successesToClose) {
        rec.state = "closed";
        rec.openedAt = null;
        rec.retryAt = null;
        rec.consecutiveSuccesses = 0;
        rec.halfOpenInFlight = 0;
        rec.currentOpenMs = cfg.initialOpenMs;
      }
    } else {
      rec.state = "closed";
      rec.consecutiveSuccesses = 0;
      rec.openedAt = null;
      rec.retryAt = null;
    }

    void persistAsync(args.key, rec);
    return snapshotOf(args.key, rec, now);
  }

  // Provider failure
  const code = args.code ?? null;
  rec.rolling.push({ t: now, ok: false });
  pruneRolling(rec, now);
  rec.consecutiveFailures += 1;
  rec.consecutiveSuccesses = 0;
  rec.lastFailureCode = code;

  if (rec.state === "half_open") {
    // One failure in half_open → immediately re-open.
    transitionToOpen(rec, now, code);
  } else if (rec.state === "closed") {
    maybeOpenFromFailures(rec, now, code);
  }

  void persistAsync(args.key, rec);
  return snapshotOf(args.key, rec, now);
}

export function listImageCircuitSnapshots(): ImageCircuitSnapshot[] {
  const now = nowFn();
  const out: ImageCircuitSnapshot[] = [];
  for (const [key, rec] of memoryStore.entries()) {
    // Advance open → half_open visually if cooldown elapsed (without acquiring).
    if (
      rec.state === "open" &&
      rec.retryAt != null &&
      now >= rec.retryAt
    ) {
      // Keep as open in snapshot until acquire; show retry_at past.
    }
    out.push(snapshotOf(key, rec, now));
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function getImageCircuitSnapshot(key: string): ImageCircuitSnapshot {
  const now = nowFn();
  return snapshotOf(key, getOrCreate(key), now);
}

function redisEnabledInEnv(): boolean {
  const raw = String(process.env.TOKFAI_REDIS_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

async function persistAsync(key: string, rec: BreakerRecord): Promise<void> {
  // Avoid importing redis/client (→ env) unless Redis is explicitly enabled.
  if (!redisEnabledInEnv()) return;
  try {
    const { getRedisClient, redisKey } = await import("../redis/client.js");
    const redis = getRedisClient();
    if (!redis) return;
    const payload = JSON.stringify({
      state: rec.state,
      consecutiveFailures: rec.consecutiveFailures,
      consecutiveSuccesses: rec.consecutiveSuccesses,
      rolling: rec.rolling.slice(-100),
      openedAt: rec.openedAt,
      retryAt: rec.retryAt,
      openCount: rec.openCount,
      halfOpenInFlight: rec.halfOpenInFlight,
      lastFailureCode: rec.lastFailureCode,
      currentOpenMs: rec.currentOpenMs,
    });
    const ttlMs = Math.max(
      getImageCircuitConfig().maxOpenMs * 2,
      getImageCircuitConfig().rollingWindowMs * 2
    );
    await redis.set(redisKey("image_circuit", key), payload, { PX: ttlMs });
  } catch {
    // best-effort only
  }
}

/** Best-effort hydrate from Redis (call on acquire miss if desired). */
export async function hydrateImageCircuitFromRedis(key: string): Promise<void> {
  if (!redisEnabledInEnv()) return;
  try {
    const { getRedisClient, redisKey } = await import("../redis/client.js");
    const redis = getRedisClient();
    if (!redis) return;
    if (memoryStore.has(key)) return;
    const raw = await redis.get(redisKey("image_circuit", key));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<BreakerRecord>;
    if (!parsed || typeof parsed !== "object") return;
    memoryStore.set(key, {
      ...emptyRecord(),
      ...parsed,
      rolling: Array.isArray(parsed.rolling) ? parsed.rolling : [],
    } as BreakerRecord);
  } catch {
    // ignore
  }
}
