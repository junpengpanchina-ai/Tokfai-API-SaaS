/**
 * P8/P10 — Provider-level health memory + short circuit breaker.
 *
 * Tracks per-provider success / timeout / gateway errors. After 3
 * upstream_timeout or 502/503/504 failures within 2 minutes, open the
 * circuit for 60s so auto-* can skip the unhealthy provider.
 *
 * Does not record invalid_token / client_aborted / ordinary 4xx.
 * Audio paths must not call into this module.
 */

import { env } from "../env.js";
import { log } from "../logger.js";
import { listEnabledProviders, type UpstreamProvider } from "./providers.js";

const FAILURE_WINDOW_MS = 120_000;
const CIRCUIT_OPEN_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const LAST_ERROR_MESSAGE_MAX = 160;

export type ProviderHealthStatus = "healthy" | "degraded" | "open";

export type ProviderHealthSnapshot = {
  providerId: string;
  success_count: number;
  timeout_count: number;
  error_count: number;
  last_success_at: number | null;
  last_error_at: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  circuit_open_until: number;
};

/** Admin API row — camelCase, no secrets / keys. */
export type ProviderHealthAdminRow = {
  providerId: string;
  status: ProviderHealthStatus;
  successCount: number;
  timeoutCount: number;
  errorCount: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  circuitOpenUntil: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  windowMs: number;
};

type FailureKind = "timeout" | "gateway";

type FailureEvent = {
  at: number;
  kind: FailureKind;
};

type ProviderHealthState = {
  success_count: number;
  timeout_count: number;
  error_count: number;
  last_success_at: number | null;
  last_error_at: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  circuit_open_until: number;
  recentFailures: FailureEvent[];
};

function truncateErrorMessage(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.length <= LAST_ERROR_MESSAGE_MAX) return trimmed;
  return `${trimmed.slice(0, LAST_ERROR_MESSAGE_MAX - 1)}…`;
}

const states = new Map<string, ProviderHealthState>();

/** Apply TOKFAI_PROVIDER_HEALTH_FORCE_OPEN once at module load (ops acceptance). */
function applyForcedOpenFromEnv(): void {
  const forced = env.TOKFAI_PROVIDER_HEALTH_FORCE_OPEN ?? [];
  if (forced.length === 0) return;
  const until = Date.now() + CIRCUIT_OPEN_MS;
  for (const providerId of forced) {
    const state = getOrCreate(providerId);
    state.circuit_open_until = until;
    state.last_error_at = Date.now();
    state.last_error_code = "forced_open";
    log.warn("provider_circuit_open", {
      providerId,
      circuit_open_until: until,
      cooldownMs: CIRCUIT_OPEN_MS,
      windowMs: FAILURE_WINDOW_MS,
      reason: "TOKFAI_PROVIDER_HEALTH_FORCE_OPEN",
      billing_status: "not_billable",
    });
  }
}

applyForcedOpenFromEnv();

const AUTO_ROUTING_ALIASES = new Set([
  "auto-fast",
  "auto-pro",
  "auto-cheap",
]);

export function isAutoRoutingAlias(canonicalId: string): boolean {
  return AUTO_ROUTING_ALIASES.has(canonicalId.trim().toLowerCase());
}

function emptyState(): ProviderHealthState {
  return {
    success_count: 0,
    timeout_count: 0,
    error_count: 0,
    last_success_at: null,
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
    circuit_open_until: 0,
    recentFailures: [],
  };
}

function getOrCreate(providerId: string): ProviderHealthState {
  let state = states.get(providerId);
  if (!state) {
    state = emptyState();
    states.set(providerId, state);
  }
  return state;
}

function pruneWindow(state: ProviderHealthState, now: number): void {
  const cutoff = now - FAILURE_WINDOW_MS;
  state.recentFailures = state.recentFailures.filter((f) => f.at >= cutoff);
  if (state.circuit_open_until > 0 && now >= state.circuit_open_until) {
    state.circuit_open_until = 0;
  }
}

export function getProviderHealth(
  providerId: string
): ProviderHealthSnapshot {
  const state = getOrCreate(providerId);
  pruneWindow(state, Date.now());
  return {
    providerId,
    success_count: state.success_count,
    timeout_count: state.timeout_count,
    error_count: state.error_count,
    last_success_at: state.last_success_at,
    last_error_at: state.last_error_at,
    last_error_code: state.last_error_code,
    last_error_message: state.last_error_message,
    circuit_open_until: state.circuit_open_until,
  };
}

function deriveProviderHealthStatus(
  snap: ProviderHealthSnapshot,
  recentFailureCount: number,
  now: number
): ProviderHealthStatus {
  if (snap.circuit_open_until > now) return "open";
  if (recentFailureCount > 0) return "degraded";
  if (
    snap.last_error_at != null &&
    now - snap.last_error_at < FAILURE_WINDOW_MS
  ) {
    return "degraded";
  }
  return "healthy";
}

/** Snapshot for GET /v1/admin/provider-health (no upstream keys). */
export function listProviderHealthAdmin(): ProviderHealthAdminRow[] {
  const now = Date.now();
  const ids = new Set<string>();
  for (const p of listEnabledProviders()) {
    ids.add(p.id);
  }
  // Always surface primary chat pool entry for ops.
  ids.add("grsai-primary");
  for (const id of states.keys()) {
    ids.add(id);
  }

  const rows: ProviderHealthAdminRow[] = [];
  for (const providerId of ids) {
    const state = getOrCreate(providerId);
    pruneWindow(state, now);
    const snap = getProviderHealth(providerId);
    rows.push({
      providerId,
      status: deriveProviderHealthStatus(
        snap,
        state.recentFailures.length,
        now
      ),
      successCount: snap.success_count,
      timeoutCount: snap.timeout_count,
      errorCount: snap.error_count,
      lastSuccessAt: snap.last_success_at,
      lastFailureAt: snap.last_error_at,
      circuitOpenUntil: snap.circuit_open_until,
      lastErrorCode: snap.last_error_code,
      lastErrorMessage: snap.last_error_message,
      windowMs: FAILURE_WINDOW_MS,
    });
  }

  return rows.sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export function isProviderCircuitOpen(providerId: string): boolean {
  const state = getOrCreate(providerId);
  const now = Date.now();
  pruneWindow(state, now);
  return state.circuit_open_until > now;
}

/**
 * Classify whether a chat/completions failure should affect provider health.
 * Auth / client abort / validation must never trip the circuit.
 */
export function isProviderHealthFailureEligible(err: {
  code?: string | null;
  status?: number | null;
  upstreamStatus?: number | null;
  type?: string | null;
}): boolean {
  const code = (err.code ?? "").toLowerCase();
  if (
    code === "client_aborted" ||
    code === "invalid_token" ||
    code === "missing_token" ||
    code === "upstream_auth_error"
  ) {
    return false;
  }
  const status = err.status ?? null;
  const upstreamStatus = err.upstreamStatus ?? null;
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    upstreamStatus === 400 ||
    upstreamStatus === 401 ||
    upstreamStatus === 403
  ) {
    return false;
  }
  if (code === "upstream_timeout") return true;
  if (
    upstreamStatus === 502 ||
    upstreamStatus === 503 ||
    upstreamStatus === 504 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }
  return false;
}

function failureKind(err: {
  code?: string | null;
  status?: number | null;
  upstreamStatus?: number | null;
}): FailureKind {
  if ((err.code ?? "") === "upstream_timeout") return "timeout";
  return "gateway";
}

export function recordProviderHealthSuccess(
  providerId: string,
  extras?: {
    requestId?: string;
    route?: string;
    attemptModel?: string;
  }
): ProviderHealthSnapshot {
  const state = getOrCreate(providerId);
  const now = Date.now();
  pruneWindow(state, now);
  state.success_count += 1;
  state.last_success_at = now;
  // Closing an open circuit on success (half-open recovery).
  // Do NOT erase in-window failure history while the circuit is closed —
  // P8 trips on 3 timeouts/502-504 within 2 minutes even if a same-provider
  // retry later succeeds on the same request.
  if (state.circuit_open_until > now) {
    state.circuit_open_until = 0;
    state.recentFailures = [];
  }

  const snap = getProviderHealth(providerId);
  log.info("provider_health_success", {
    requestId: extras?.requestId,
    route: extras?.route,
    providerId,
    attemptModel: extras?.attemptModel,
    success_count: snap.success_count,
    timeout_count: snap.timeout_count,
    error_count: snap.error_count,
    circuit_open_until: snap.circuit_open_until,
    billing_status: "not_billable",
  });
  return snap;
}

export function recordProviderHealthFailure(
  providerId: string,
  err: {
    code?: string | null;
    status?: number | null;
    upstreamStatus?: number | null;
    message?: string | null;
    publicMessage?: string | null;
    upstreamErrorSnippet?: string | null;
  },
  extras?: {
    requestId?: string;
    route?: string;
    attemptModel?: string;
  }
): { snapshot: ProviderHealthSnapshot; circuitOpened: boolean } {
  if (!isProviderHealthFailureEligible(err)) {
    return { snapshot: getProviderHealth(providerId), circuitOpened: false };
  }

  const state = getOrCreate(providerId);
  const now = Date.now();
  pruneWindow(state, now);
  const kind = failureKind(err);
  if (kind === "timeout") state.timeout_count += 1;
  else state.error_count += 1;
  state.last_error_at = now;
  state.last_error_code = err.code ?? `http_${err.upstreamStatus ?? err.status}`;
  state.last_error_message = truncateErrorMessage(
    err.upstreamErrorSnippet ??
      err.publicMessage ??
      err.message ??
      state.last_error_code
  );
  state.recentFailures.push({ at: now, kind });

  const timeoutInWindow = state.recentFailures.filter(
    (f) => f.kind === "timeout"
  ).length;
  const gatewayInWindow = state.recentFailures.filter(
    (f) => f.kind === "gateway"
  ).length;
  const wasOpen = state.circuit_open_until > now;
  let circuitOpened = false;
  if (
    !wasOpen &&
    (timeoutInWindow >= FAILURE_THRESHOLD ||
      gatewayInWindow >= FAILURE_THRESHOLD)
  ) {
    state.circuit_open_until = now + CIRCUIT_OPEN_MS;
    circuitOpened = true;
  }

  const snap = getProviderHealth(providerId);
  log.warn("provider_health_failure", {
    requestId: extras?.requestId,
    route: extras?.route,
    providerId,
    attemptModel: extras?.attemptModel,
    code: err.code ?? null,
    upstreamStatus: err.upstreamStatus ?? null,
    status: err.status ?? null,
    failureKind: kind,
    success_count: snap.success_count,
    timeout_count: snap.timeout_count,
    error_count: snap.error_count,
    timeoutInWindow,
    gatewayInWindow,
    circuit_open_until: snap.circuit_open_until,
    billing_status: "not_billable",
  });

  if (circuitOpened) {
    log.warn("provider_circuit_open", {
      requestId: extras?.requestId,
      route: extras?.route,
      providerId,
      attemptModel: extras?.attemptModel,
      circuit_open_until: snap.circuit_open_until,
      cooldownMs: CIRCUIT_OPEN_MS,
      windowMs: FAILURE_WINDOW_MS,
      timeoutInWindow,
      gatewayInWindow,
      last_error_code: snap.last_error_code,
      billing_status: "not_billable",
    });
  }

  return { snapshot: snap, circuitOpened };
}

/**
 * For auto-fast / auto-pro / auto-cheap: drop providers whose circuit is open.
 * Explicit models keep unhealthy providers (still attempt; error may hint).
 */
export function filterProvidersByHealth(args: {
  providers: UpstreamProvider[];
  canonicalRequestedModel: string;
  requestId?: string;
  route?: string;
  attemptModel?: string;
}): {
  providers: UpstreamProvider[];
  skippedUnhealthy: UpstreamProvider[];
  allUnhealthy: boolean;
} {
  const { providers } = args;
  if (providers.length === 0) {
    return { providers: [], skippedUnhealthy: [], allUnhealthy: false };
  }

  if (!isAutoRoutingAlias(args.canonicalRequestedModel)) {
    return {
      providers: [...providers],
      skippedUnhealthy: [],
      allUnhealthy: false,
    };
  }

  const skippedUnhealthy: UpstreamProvider[] = [];
  const healthy: UpstreamProvider[] = [];
  for (const provider of providers) {
    if (isProviderCircuitOpen(provider.id)) {
      skippedUnhealthy.push(provider);
      log.info("provider_circuit_skip", {
        requestId: args.requestId,
        route: args.route,
        requestedModel: args.canonicalRequestedModel,
        attemptModel: args.attemptModel,
        providerId: provider.id,
        circuit_open_until: getProviderHealth(provider.id).circuit_open_until,
        billing_status: "not_billable",
      });
    } else {
      healthy.push(provider);
    }
  }

  return {
    providers: healthy,
    skippedUnhealthy,
    allUnhealthy: healthy.length === 0 && skippedUnhealthy.length > 0,
  };
}

/** Ops / tests — reset in-memory health (not used on hot path). */
export function resetProviderHealthForTests(): void {
  states.clear();
}

export const PROVIDER_HEALTH = {
  FAILURE_WINDOW_MS,
  CIRCUIT_OPEN_MS,
  FAILURE_THRESHOLD,
  AUTO_ROUTING_ALIASES,
} as const;

/** Public error copy when timeout and no secondary provider is configured. */
export const NO_FALLBACK_PROVIDER_TIMEOUT_PUBLIC_MESSAGE =
  "Upstream provider timed out and no fallback provider is configured.";

export const PROVIDER_TEMPORARILY_UNHEALTHY_HINT =
  "Provider temporarily unhealthy.";
