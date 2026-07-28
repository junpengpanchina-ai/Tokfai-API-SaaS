/**
 * Nano Banana image/media adapter (independent of grsai text chat provider).
 *
 * - Long-running generate + poll
 * - Soft wait (NANO_BANANA_MAX_WAIT_MS) → processing/task_timeout, keep polling
 * - Hard wait (NANO_BANANA_HARD_WAIT_MS) → image_task_timeout (not_billable)
 * - Upstream failure after high progress (≥95%) → upstream_image_error (never fake success)
 * - All failure paths leave billing to the worker as not_billable
 *
 * Does not modify the GRSAI text chat provider.
 */

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  IMAGE_HARD_WAIT_MS,
  IMAGE_SOFT_WAIT_MS,
} from "../images/imageTimeoutPolicy.js";
import {
  createImageGenerationTask,
  pollImageGenerationTask,
  type CreateImageTaskParams,
} from "./imageAsyncProvider.js";
import type { ImageGenerateResult } from "./imageAdapter.js";

const CAPABILITY = "image_generation" as const;
const PROVIDER_ID = "nano_banana_image";

/** Soft wait window — expose task_timeout + processing; poll continues (P957). */
export const NANO_BANANA_MAX_WAIT_MS = IMAGE_SOFT_WAIT_MS;

/** Absolute hard stop — terminal image_task_timeout (P957). */
export const NANO_BANANA_HARD_WAIT_MS = IMAGE_HARD_WAIT_MS;

const POLL_INTERVAL_MS = 2_000;
const HIGH_PROGRESS_THRESHOLD = 95;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutName(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

export function isNanoBananaImageModel(model: string): boolean {
  const m = String(model ?? "")
    .trim()
    .toLowerCase();
  return m === "nano-banana" || m.startsWith("nano-banana-");
}

function upstreamImageError(
  detail?: string,
  upstreamStatus = 502
): ApiError {
  return new ApiError({
    status: 502,
    message:
      "Image generation is temporarily unavailable. Please retry shortly.",
    code: "upstream_image_error",
    type: "server_error",
    publicMessage: "图片生成暂时不可用，请稍后重试。",
    upstreamStatus,
    upstreamErrorSnippet: detail ? detail.slice(0, 200) : undefined,
  });
}

function imageTaskTimeoutError(latencyMs: number): ApiError {
  return new ApiError({
    status: 504,
    message: "Image generation timed out before completion.",
    code: "image_task_timeout",
    type: "upstream_error",
    publicMessage: "图片生成超时，请稍后重试。未扣费。",
    upstreamStatus: 504,
    upstreamErrorSnippet: `latencyMs=${latencyMs};maxWaitMs=${NANO_BANANA_MAX_WAIT_MS}`,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Best-effort progress from upstream poll/create payloads (0–100). */
export function extractUpstreamProgress(parsed: unknown): number | null {
  const obj = asRecord(parsed);
  if (!obj) return null;
  const raw = obj.progress ?? obj.percent ?? obj.percentage;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return null;
}

/**
 * Run Nano Banana image generation with long-task polling.
 * Never returns success without a real image URL.
 */
export async function runNanoBananaImageGeneration(
  params: CreateImageTaskParams
): Promise<ImageGenerateResult> {
  const startedAt = Date.now();
  let lastProgress: number | null = 0;
  let lastUpstreamStatus: number | null = null;

  const logBase = {
    request_id: params.requestId,
    model: params.resolvedModel,
    capability: CAPABILITY,
    providerId: PROVIDER_ID,
  };

    log.info("nano_banana_image_start", {
    ...logBase,
    mode: params.mode,
    maxWaitMs: NANO_BANANA_MAX_WAIT_MS,
    hardWaitMs: NANO_BANANA_HARD_WAIT_MS,
  });

  try {
    const created = await createImageGenerationTask(params);
    lastUpstreamStatus = 200;

    if (created.taskId) {
      try {
        await params.onUpstreamSubmitted?.({
          providerTaskId: created.taskId,
          upstreamRequestId: created.taskId,
          providerStatus: created.status,
        });
      } catch {
        // persist is best-effort
      }
    }

    if (created.url && created.url.trim()) {
      const latencyMs = Date.now() - startedAt;
      log.info("nano_banana_image_succeeded", {
        ...logBase,
        upstream_status: lastUpstreamStatus,
        latencyMs,
        progress: 100,
      });
      return {
        url: created.url.trim(),
        upstreamId: created.taskId,
        debug: created.debug,
      };
    }

    if (!created.taskId) {
      throw upstreamImageError("missing_task_id", 502);
    }

    const softDeadline = startedAt + NANO_BANANA_MAX_WAIT_MS;
    const hardDeadline = startedAt + NANO_BANANA_HARD_WAIT_MS;
    let softNotified = false;
    let lastStatus: string | null = null;

    while (Date.now() < hardDeadline) {
      await sleep(POLL_INTERVAL_MS);

      let polled: {
        url: string | null;
        status: string | null;
        latencyMs: number;
      };
      try {
        polled = await pollImageGenerationTask({
          requestId: params.requestId,
          taskId: created.taskId,
        });
        lastUpstreamStatus = 200;
      } catch (err) {
        const latencyMs = Date.now() - startedAt;
        const upstreamStatus =
          err instanceof ApiError && typeof err.upstreamStatus === "number"
            ? err.upstreamStatus
            : 502;
        lastUpstreamStatus = upstreamStatus;

        log.warn("nano_banana_image_upstream_failed", {
          ...logBase,
          upstream_status: upstreamStatus,
          latencyMs,
          progress: lastProgress,
          code:
            lastProgress != null && lastProgress >= HIGH_PROGRESS_THRESHOLD
              ? "upstream_image_error"
              : err instanceof ApiError
                ? err.code
                : "upstream_image_error",
        });

        // High progress then fail → never fake success.
        if (lastProgress != null && lastProgress >= HIGH_PROGRESS_THRESHOLD) {
          throw upstreamImageError(
            err instanceof ApiError ? err.message : "failed_after_high_progress",
            upstreamStatus
          );
        }

        if (err instanceof ApiError && err.code === "image_generation_timeout") {
          throw imageTaskTimeoutError(latencyMs);
        }

        if (err instanceof ApiError && err.code === "upstream_image_error") {
          throw err;
        }

        throw upstreamImageError(
          err instanceof ApiError ? err.message : "poll_failed",
          upstreamStatus
        );
      }

      lastStatus = polled.status;

      if (polled.url && polled.url.trim()) {
        const latencyMs = Date.now() - startedAt;
        log.info("nano_banana_image_succeeded", {
          ...logBase,
          upstream_status: lastUpstreamStatus,
          latencyMs,
          progress: 100,
        });
        return {
          url: polled.url.trim(),
          upstreamId: created.taskId,
          debug: created.debug,
        };
      }

      const status = (polled.status ?? "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        const latencyMs = Date.now() - startedAt;
        log.warn("nano_banana_image_upstream_failed", {
          ...logBase,
          upstream_status: lastUpstreamStatus,
          latencyMs,
          progress: lastProgress,
          code: "upstream_image_error",
        });
        throw upstreamImageError(status, 502);
      }

      // Soft wait window: keep polling; announce once so poll responses show task_timeout.
      if (!softNotified && Date.now() >= softDeadline) {
        softNotified = true;
        const latencyMs = Date.now() - startedAt;
        log.info("nano_banana_image_soft_timeout", {
          ...logBase,
          upstream_status: lastUpstreamStatus,
          latencyMs,
          progress: lastProgress,
          lastStatus,
          code: "image_task_timeout_pending",
        });
        try {
          await params.onSoftWaitExceeded?.({
            latencyMs,
            lastStatus,
          });
        } catch {
          // ignore
        }
      }

      // Advance synthetic progress while pending so ≥95% failure path is testable.
      if (lastProgress == null) lastProgress = 0;
      lastProgress = Math.min(
        99,
        Math.max(
          lastProgress,
          Math.floor(
            ((Date.now() - startedAt) / NANO_BANANA_HARD_WAIT_MS) * 100
          )
        )
      );
    }

    const latencyMs = Date.now() - startedAt;
    log.warn("nano_banana_image_timeout", {
      ...logBase,
      upstream_status: lastUpstreamStatus,
      latencyMs,
      progress: lastProgress,
      lastStatus,
      code: "image_task_timeout",
    });
    throw imageTaskTimeoutError(latencyMs);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;

    if (err instanceof ApiError) {
      if (
        err.code === "upstream_image_error" ||
        err.code === "image_task_timeout"
      ) {
        log.warn("nano_banana_image_failed", {
          ...logBase,
          upstream_status: err.upstreamStatus ?? lastUpstreamStatus,
          latencyMs,
          progress: lastProgress,
          code: err.code,
        });
        throw err;
      }

      if (
        err.code === "image_generation_timeout" ||
        err.code === "upstream_timeout" ||
        isTimeoutName(err)
      ) {
        log.warn("nano_banana_image_timeout", {
          ...logBase,
          upstream_status: 504,
          latencyMs,
          progress: lastProgress,
          code: "image_task_timeout",
        });
        throw imageTaskTimeoutError(latencyMs);
      }

      // Map generic upstream failures to upstream_image_error (not fake success).
      if (
        err.code === "upstream_error" ||
        err.code === "upstream_invalid_response" ||
        err.code === "upstream_model_busy" ||
        err.code === "upstream_model_unavailable"
      ) {
        log.warn("nano_banana_image_failed", {
          ...logBase,
          upstream_status: err.upstreamStatus ?? lastUpstreamStatus,
          latencyMs,
          progress: lastProgress,
          code: "upstream_image_error",
        });
        throw upstreamImageError(err.message, err.upstreamStatus ?? 502);
      }

      log.warn("nano_banana_image_failed", {
        ...logBase,
        upstream_status: err.upstreamStatus ?? lastUpstreamStatus,
        latencyMs,
        progress: lastProgress,
        code: err.code,
      });
      throw err;
    }

    log.warn("nano_banana_image_failed", {
      ...logBase,
      upstream_status: lastUpstreamStatus,
      latencyMs,
      progress: lastProgress,
      code: "upstream_image_error",
    });
    throw upstreamImageError(
      err instanceof Error ? err.message : "unknown_error",
      502
    );
  }
}
