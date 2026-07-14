/**
 * Consumer image workbench API — session-driven via server actions.
 * Browser never receives or sends sk-tokfai secrets / X-Tokfai-Host.
 */

import {
  consumerChatCompletionsAction,
  consumerImageGenerationStatusAction,
  consumerImageGenerationsAction,
  type ConsumerWorkbenchErrorPayload,
} from "./consumer-workbench-actions";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./chat-api";
import { DashboardDmitApiError } from "./dmit-fetch";
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
} from "./image-api";
import { isImageGenerationTerminal } from "./image-api";

function throwFromActionError(err: ConsumerWorkbenchErrorPayload): never {
  throw new DashboardDmitApiError({
    status: err.status,
    message: err.message,
    code: err.code,
  });
}

export async function consumerChatCompletions(
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const result = await consumerChatCompletionsAction(body);
  if (!result.ok) throwFromActionError(result);
  return result.data;
}

export async function consumerImageGenerations(
  body: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const result = await consumerImageGenerationsAction(body);
  if (!result.ok) throwFromActionError(result);
  return result.data;
}

export async function consumerGetImageGenerationStatus(
  id: string
): Promise<ImageGenerationResponse> {
  const result = await consumerImageGenerationStatusAction(id);
  if (!result.ok) throwFromActionError(result);
  return result.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit image generation and poll until terminal status (session-driven).
 */
export async function consumerImageGenerationsWithProgress(
  body: ImageGenerationRequest,
  options?: {
    onProgress?: (state: ImageGenerationResponse) => void;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }
): Promise<ImageGenerationResponse> {
  const accepted = await consumerImageGenerations(body);
  options?.onProgress?.(accepted);

  const taskId = accepted.id ?? accepted.request_id;
  if (!taskId) {
    throw new DashboardDmitApiError({
      status: 500,
      message: "Missing generation id.",
      code: "server_error",
    });
  }

  if (
    isImageGenerationTerminal(accepted.status) &&
    (accepted.data?.length ?? 0) > 0
  ) {
    return accepted;
  }

  if (
    (accepted.status === "succeeded" || accepted.status === "completed") &&
    (accepted.data?.length ?? 0) > 0
  ) {
    return accepted;
  }

  const interval = options?.pollIntervalMs ?? 1500;
  let latest = accepted;

  while (!isImageGenerationTerminal(latest.status)) {
    if (options?.signal?.aborted) {
      throw new DashboardDmitApiError({
        status: 499,
        message: "Aborted.",
        code: "aborted",
      });
    }
    await sleep(interval);
    latest = await consumerGetImageGenerationStatus(taskId);
    options?.onProgress?.(latest);
  }

  if (latest.status === "failed" || latest.status === "retryable_timeout") {
    const code =
      latest.status === "retryable_timeout"
        ? "retryable_timeout"
        : (latest.error?.code ?? latest.status);
    const msgObj =
      latest.message && typeof latest.message === "object"
        ? latest.message
        : null;
    const message =
      latest.error?.message_en ??
      latest.error?.message ??
      (typeof latest.message === "string" ? latest.message : undefined) ??
      msgObj?.en ??
      "Image generation failed.";
    throw new DashboardDmitApiError({
      status: latest.status === "retryable_timeout" ? 504 : 502,
      message,
      code,
      body: latest,
    });
  }

  return latest;
}

export { DashboardDmitApiError as DmitApiError };
