import type { ImageGenerationTaskRow } from "../types.js";
import { isTerminalImageStatus } from "./progressMessages.js";

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
  const usage =
    task.usage && typeof task.usage === "object" && !Array.isArray(task.usage)
      ? (task.usage as Record<string, unknown>)
      : { credits_charged: task.credits_charged ?? 0 };

  const message = {
    en: task.message_en ?? "",
    zh: task.message_zh ?? "",
  };

  const error =
    task.status === "failed" || task.status === "retryable_timeout"
      ? {
          code: task.error_code ?? "image_generation_failed",
          message: task.error_message ?? message.en,
        }
      : null;

  const base: Record<string, unknown> = {
    id: task.request_id,
    object: "image.generation",
    created: Number.isFinite(createdAt) ? createdAt : Math.floor(Date.now() / 1000),
    model: task.model,
    status: task.status,
    progress: task.progress,
    message,
    data: resultData,
    usage,
    tokfai: {
      request_id: task.request_id,
      mode: task.mode ?? null,
      prompt_mode: task.prompt_mode ?? null,
      ...(pollRequestId ? { poll_request_id: pollRequestId } : {}),
    },
    request_id: task.request_id,
    credits_charged: task.credits_charged ?? 0,
  };

  if (error) {
    base.error = error;
  }

  if (task.status === "completed") {
    base.mode = task.mode;
    base.prompt_mode = task.prompt_mode;
    base.reference_image_included = task.mode === "reference_edit";
  }

  return base;
}

/** OpenAI-compat alias shape for GET /v1/api/result */
export function buildPublicImageApiResultResponse(
  task: ImageGenerationTaskRow,
  pollRequestId: string
): Record<string, unknown> {
  const full = buildPublicImageTaskResponse(task, pollRequestId);
  return {
    id: full.id,
    status: full.status,
    progress: full.progress,
    message: full.message,
    model: full.model,
    data: full.data,
    results: full.data,
    usage: full.usage,
    error: full.error ?? null,
    tokfai: full.tokfai,
    request_id: task.request_id,
  };
}

export function isImageTaskDone(task: ImageGenerationTaskRow): boolean {
  return isTerminalImageStatus(task.status);
}
