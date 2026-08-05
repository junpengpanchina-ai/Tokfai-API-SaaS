export function remainingBudget(totalMs, startedAtMs, nowMs) {
  const remaining = totalMs - (nowMs - startedAtMs);
  return Math.max(5000, remaining);
}
