/** Process-local circuit breaker — skip hot models during auto-* fallback. */

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

export function isCircuitOpen(model: string): boolean {
  const state = states.get(model);
  if (!state) return false;
  if (Date.now() >= state.openUntil) {
    states.delete(model);
    return false;
  }
  return state.openUntil > 0;
}

export function recordModelFailure(model: string, code: string | undefined): void {
  if (!isCircuitFailureCode(code)) return;

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

export function recordModelSuccess(model: string): void {
  states.delete(model);
}

export function filterAttemptsByCircuitBreaker(attempts: string[]): string[] {
  return attempts.filter((model) => !isCircuitOpen(model));
}
