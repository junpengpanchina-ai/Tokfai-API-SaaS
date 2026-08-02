import type { ImageGenerationTaskRow } from "../types.js";
import {
  isTerminalImageStatus,
  STATUS_PROGRESS,
  type ImageTaskStatus,
} from "./progressMessages.js";
import {
  IMAGE_SOFT_TIMEOUT_CODE,
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

  // Billable only when completed AND charged (url success path requires url).
  const hasUrl =
    isCompleted &&
    resultData.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const url = (item as Record<string, unknown>).url;
      return typeof url === "string" && url.trim().length > 0;
    });
  // Top-level P993 contract uses charged/not_billable; tokfai keeps
  // billable for existing Cherry / smoke clients.
  const charged =
    isCompleted && hasUrl && creditsCharged > 0;
  const billingStatusTop = charged
    ? "charged"
    : isCompleted ||
        task.status === "failed" ||
        task.status === "retryable_timeout"
      ? "not_billable"
      : "pending";
  const billingStatusTokfai = charged ? "billable" : "not_billable";

  const usage =
    isCompleted &&
    task.usage &&
    typeof task.usage === "object" &&
    !Array.isArray(task.usage)
      ? (task.usage as Record<string, unknown>)
      : { credits_charged: charged ? creditsCharged : 0 };

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
    // Always prefer pending copy — never look like a hard failure.
    message.en = SOFT_TIMEOUT_MESSAGES.en;
    message.zh = SOFT_TIMEOUT_MESSAGES.zh;
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
          task.error_code === "processing_timeout" ||
          task.error_code === "image_task_timeout_pending" ||
          task.error_code === "provider_asset_unavailable" ||
          task.error_code === "provider_asset_invalid" ||
          task.error_code === "asset_persist_failed" ||
          task.error_code === "asset_verify_failed" ||
          task.error_code === "missing_url" ||
          task.error_code === "all_image_upstreams_unavailable" ||
          task.error_code === "breaker_half_open_busy"
            ? "upstream_error"
            : "server_error",
        request_id: task.request_id,
        message_en: message.en,
        message_zh: message.zh,
      }
    : null;

  const providerTaskId =
    (typeof task.provider_task_id === "string" && task.provider_task_id.trim()
      ? task.provider_task_id.trim()
      : null) ||
    (typeof task.upstream_id === "string" && task.upstream_id.trim()
      ? task.upstream_id.trim()
      : null);

  // Keep granular async status (queued/generating/…) for Workbench.
  // Tokfai media contract also exposes task_id + tokfai.billing_status.
  const usageObj =
    usage && typeof usage === "object" && !Array.isArray(usage)
      ? (usage as Record<string, unknown>)
      : {};
  const snapshot =
    task.input_snapshot &&
    typeof task.input_snapshot === "object" &&
    !Array.isArray(task.input_snapshot)
      ? (task.input_snapshot as Record<string, unknown>)
      : {};
  const requestedModel =
    (typeof usageObj.requested_model === "string" && usageObj.requested_model) ||
    (typeof snapshot.requestedModel === "string" && snapshot.requestedModel) ||
    task.model;
  const resolvedModel =
    (typeof usageObj.resolved_model === "string" && usageObj.resolved_model) ||
    task.model;
  const attemptModel =
    (typeof usageObj.attempt_model === "string" && usageObj.attempt_model) ||
    (isCompleted ? task.model : null);
  const provider =
    (typeof usageObj.provider === "string" && usageObj.provider) || null;
  const fallbackUsed = Boolean(usageObj.fallback_used);
  const attempts = Array.isArray(usageObj.attempts) ? usageObj.attempts : [];

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
    billing_status: billingStatusTop,
    processing: !(isCompleted || isFailed),
    provider_task_id: providerTaskId,
    requested_model: requestedModel,
    resolved_model: resolvedModel,
    attempt_model: attemptModel,
    provider,
    fallback_used: fallbackUsed,
    attempts,
    tokfai: {
      request_id: task.request_id,
      billing_status: billingStatusTokfai,
      credits_charged: charged ? creditsCharged : 0,
      mode: task.mode ?? null,
      prompt_mode: task.prompt_mode ?? null,
      requested_model: requestedModel,
      resolved_model: resolvedModel,
      attempt_model: attemptModel,
      provider,
      fallback_used: fallbackUsed,
      ...(pollRequestId ? { poll_request_id: pollRequestId } : {}),
      ...(softTimedOut
        ? {
            timeout_pending: true,
            task_timeout: true,
            timeout_code: IMAGE_SOFT_TIMEOUT_CODE,
          }
        : {}),
    },
    request_id: task.request_id,
    credits_charged: charged ? creditsCharged : 0,
  };

  // P957: past wait window while still in-flight — soft signal, poll continues.
  if (softTimedOut) {
    base.timeout_pending = true;
    base.task_timeout = true;
    base.timeout_code = IMAGE_SOFT_TIMEOUT_CODE;
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
    timeout_pending: full.timeout_pending,
    timeout_code: full.timeout_code,
    tokfai: full.tokfai,
    request_id: task.request_id,
  };
}

export function isImageTaskDone(task: ImageGenerationTaskRow): boolean {
  return isTerminalImageStatus(task.status);
}
