/**
 * P957 — Image async wait-window / timeout policy.
 *
 * Soft wait: past client/API wait window while still in-flight →
 *   processing + task_timeout, keep task_id, not billed, poll continues.
 * Hard wait: absolute stop → retryable_timeout + image_task_timeout, not_billable.
 *
 * Does not touch Chat / chatGateway.
 */

/** Soft wait window (ms). Past this while upstream still pending → soft timeout. */
export const IMAGE_SOFT_WAIT_MS = 120_000;

/** Absolute hard stop (ms). Only then terminalize as retryable_timeout. */
export const IMAGE_HARD_WAIT_MS = 600_000;

/** Soft marker stored on in-flight tasks (not a terminal status). */
export const IMAGE_SOFT_TIMEOUT_CODE = "processing_timeout" as const;

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
    c === IMAGE_HARD_TIMEOUT_CODE ||
    c === "image_generation_timeout"
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

export const SOFT_TIMEOUT_MESSAGES = {
  en: "Still generating (wait window exceeded). Keep polling with task_id — not billed yet.",
  zh: "仍在生成中（已超过等待窗口）。请继续用 task_id 轮询，尚未扣费。",
} as const;
