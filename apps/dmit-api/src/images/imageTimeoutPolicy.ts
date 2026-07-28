/**
 * P957 — Image async wait-window / timeout policy.
 * P961 — Soft timeout_pending must enter background reconcile (orphan cost guard);
 *         hard wait → retryable_timeout + image_task_timeout, not_billable, still
 *         reconcilable when provider_task_id was persisted on upstream submit.
 *
 * Soft wait: past client/API wait window while still in-flight →
 *   processing + timeout_pending (image_task_timeout_pending), keep task_id,
 *   not billed, poll continues. Frontend shows “still generating, check later”
 *   — never a hard failure. Not counted in bad_billing_failures.
 * Hard wait: absolute stop → retryable_timeout + image_task_timeout, not_billable.
 *
 * Does not touch Chat / chatGateway / P954 isolation.
 */

/** Soft wait window (ms). Past this while upstream still pending → soft timeout. */
export const IMAGE_SOFT_WAIT_MS = 120_000;

/** Absolute hard stop (ms). Only then terminalize as retryable_timeout. */
export const IMAGE_HARD_WAIT_MS = 600_000;

/**
 * Soft marker on in-flight tasks (not a terminal status).
 * Public/load alias: timeout_pending.
 */
export const IMAGE_SOFT_TIMEOUT_CODE = "image_task_timeout_pending" as const;

/** Legacy soft code — still recognized for in-flight tasks. */
export const IMAGE_SOFT_TIMEOUT_CODE_LEGACY = "processing_timeout" as const;

/** Hard / public timeout code (terminal retryable_timeout path). */
export const IMAGE_HARD_TIMEOUT_CODE = "image_task_timeout" as const;

const IN_FLIGHT = new Set([
  "queued",
  "validating",
  "billing_check",
  "requesting_model",
  "generating",
  "saving_result",
]);

export function isInFlightImageTaskStatus(status: string | null | undefined): boolean {
  return IN_FLIGHT.has(String(status ?? "").toLowerCase());
}

export function isSoftTimeoutCode(code: string | null | undefined): boolean {
  const c = String(code ?? "").toLowerCase();
  return (
    c === IMAGE_SOFT_TIMEOUT_CODE ||
    c === IMAGE_SOFT_TIMEOUT_CODE_LEGACY ||
    c === "timeout_pending"
  );
}

/** True when an in-flight task has passed the soft wait window. */
export function isPastImageSoftWait(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
  softWaitMs: number = IMAGE_SOFT_WAIT_MS
): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= softWaitMs;
}

/** Frontend / poll copy — not a failure. */
export const SOFT_TIMEOUT_MESSAGES = {
  en: "Still generating — you can check again later with task_id. Not billed yet.",
  zh: "生成中，可稍后查询（保留 task_id）。尚未扣费。",
} as const;
