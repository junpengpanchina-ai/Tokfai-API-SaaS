import type { ImageGenerationTaskRow } from "../types.js";
import {
  isTerminalImageStatus,
  STATUS_PROGRESS,
  type ImageTaskStatus,
} from "./progressMessages.js";
import {
  IMAGE_SOFT_WAIT_MS,
  isPastImageSoftWait,
  isSoftTimeoutCode,
  SOFT_TIMEOUT_MESSAGES,
} from "./imageTimeoutPolicy.js";

/**
 * Public poll / POST-accepted response. Never includes upstream provider,
 * upstream URL, or upstream raw error text.
 */
export function buildPublicImageTaskResponse(
  task: ImageGenerationTaskRow,
  pollRequestId?: string
): Record<string, unknown> {
  const createdAt =
    typeof task.created_at === "string"
      ? Math.floor(new Date(task.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

  const resultData = Array.isArray(task.result_data) ? task.result_data : [];
  const isCompleted = task.status === "completed";
  const creditsCharged = isCompleted
    ? Number(task.credits_charged ?? 0)
    : 0;

  // Billable only when completed AND charged (url success path).
  const billingStatus = isCompleted
    ? creditsCharged > 0
      ? "billable"
      : "not_billable"
    : "not_billable";

  const usage =
    isCompleted &&
    task.usage &&
    typeof task.usage === "object" &&
    !Array.isArray(task.usage)
      ? (task.usage as Record<string, unknown>)
      : { credits_charged: creditsCharged };

  const message = {
    en: task.message_en ?? "",
    zh: task.message_zh ?? "",
  };

  const progress = publicProgressForStatus(task.status, task.progress);
  const isFailed =
    task.status === "failed" || task.status === "retryable_timeout";

  const softTimedOut =
    !isCompleted &&
    !isFailed &&
    (isSoftTimeoutCode(task.error_code) ||
      isPastImageSoftWait(task.created_at, Date.now(), IMAGE_SOFT_WAIT_MS));

  if (softTimedOut) {
    if (!message.en) message.en = SOFT_TIMEOUT_MESSAGES.en;
    if (!message.zh) message.zh = SOFT_TIMEOUT_MESSAGES.zh;
  }

  const publicData = isCompleted
    ? resultData.map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = item as Record<string, unknown>;
          return {
            ...row,
            revised_prompt:
              row.revised_prompt === undefined ? null : row.revised_prompt,
          };
        }
        return item;
      })
    : [];

  // Hard terminal failures only — soft wait-window does not set error.
  const error = isFailed
    ? {
        message:
          task.error_message ||
          message.en ||
          "Image generation is temporarily unavailable. Please retry shortly.",
        code: task.error_code || task.status || "upstream_image_error",
        type:
          task.error_code === "image_task_timeout" ||
          task.error_code === "image_generation_timeout" ||
          task.error_code === "retryable_timeout" ||
          task.error_code === "processing_timeout"
            ? "upstream_error"
            : "server_error",
        request_id: task.request_id,
        message_en: message.en,
        message_zh: message.zh,
      }
    : null;

  // Keep granular async status (queued/generating/…) for Workbench.
  // Tokfai media contract also exposes task_id + tokfai.billing_status.
  const base: Record<string, unknown> = {
    id: task.request_id,
    task_id: task.request_id,
    object: "image.generation",
    created: Number.isFinite(createdAt) ? createdAt : Math.floor(Date.now() / 1000),
    model: task.model,
    status: task.status,
    progress,
    message,
    data: publicData,
    usage,
    tokfai: {
      request_id: task.request_id,
      billing_status: billingStatus,
      credits_charged: creditsCharged,
      mode: task.mode ?? null,
      prompt_mode: task.prompt_mode ?? null,
      ...(pollRequestId ? { poll_request_id: pollRequestId } : {}),
      ...(softTimedOut ? { task_timeout: true } : {}),
    },
    request_id: task.request_id,
    credits_charged: creditsCharged,
  };

  if (!isCompleted && !isFailed) {
    base.processing = true;
  }

  // P957: past wait window while still in-flight — soft signal, poll continues.
  if (softTimedOut) {
    base.task_timeout = true;
  }

  if (error) {
    base.error = error;
  }

  if (isCompleted) {
    base.mode = task.mode;
    base.prompt_mode = task.prompt_mode;
    base.reference_image_included = task.mode === "reference_edit";
  }

  return base;
}

function publicProgressForStatus(
  status: string,
  stored: number | null | undefined
): number {
  if (status === "completed") return 100;
  const fromMap = STATUS_PROGRESS[status as ImageTaskStatus];
  if (typeof fromMap === "number") {
    return Math.min(fromMap, 99);
  }
  const n = typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
  return Math.max(0, Math.min(99, n));
}

/** OpenAI-compat alias shape for GET /v1/api/result */
export function buildPublicImageApiResultResponse(
  task: ImageGenerationTaskRow,
  pollRequestId: string
): Record<string, unknown> {
  const full = buildPublicImageTaskResponse(task, pollRequestId);
  return {
    id: full.id,
    task_id: full.task_id,
    status: full.status,
    progress: full.progress,
    message: full.message,
    model: full.model,
    data: full.data,
    results: full.data,
    usage: full.usage,
    error: full.error ?? null,
    processing: full.processing,
    task_timeout: full.task_timeout,
    tokfai: full.tokfai,
    request_id: task.request_id,
  };
}

export function isImageTaskDone(task: ImageGenerationTaskRow): boolean {
  return isTerminalImageStatus(task.status);
}
