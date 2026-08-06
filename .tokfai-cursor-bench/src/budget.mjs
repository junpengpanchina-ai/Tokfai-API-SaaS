export function remainingBudget(totalTimeoutMs, startedAtMs, nowMs) {
  const elapsedMs = nowMs - startedAtMs;
  return Math.max(0, totalTimeoutMs - elapsedMs);
}
