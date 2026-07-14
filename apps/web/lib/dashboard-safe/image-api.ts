/**
 * Dashboard image generations — sk-tokfai API key auth, no Supabase client.
 * POST accepts a job; poll GET until completed / failed / retryable_timeout.
 */

import { DashboardDmitApiError, dashboardDmitFetchWithHeaders } from "./dmit-fetch";

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  response_format?: "url";
  mode?: "text_to_image" | "reference_edit";
  /** Preferred field — data URLs or http(s) URLs for upstream `images`. */
  images?: string[];
  /** Legacy alias still accepted by DMIT. */
  image_urls?: string[];
}

export interface ImageGenerationDataItem {
  url?: string;
  b64_json?: string;
}

export type ImageUrlResolveSource =
  | "direct"
  | "data_url"
  | "google_imgres"
  | "html_og_image"
  | "html_twitter_image"
  | "html_first_image";

export type ImageGenerationTaskStatus =
  | "queued"
  | "validating"
  | "billing_check"
  | "requesting_model"
  | "generating"
  | "saving_result"
  | "completed"
  | "failed"
  | "retryable_timeout"
  | "succeeded"
  | "running";

export interface ImageProgressMessage {
  en?: string;
  zh?: string;
}

export interface ImageGenerationResponse {
  id?: string;
  created: number;
  data: ImageGenerationDataItem[];
  model: string;
  status?: ImageGenerationTaskStatus;
  progress?: number;
  message?: ImageProgressMessage | string;
  request_id?: string;
  upstream_id?: string;
  credits_charged?: number;
  usage?: { credits_charged?: number };
  mode?: "text_to_image" | "reference_edit";
  prompt_mode?: "subject_preserve" | "normal";
  reference_image_included?: boolean;
  images_count?: number;
  input_images_count?: number;
  resolved_images_count?: number;
  upstream_images_count?: number;
  image_source_type?: "data_url" | "https_url" | "blob_blocked" | "none";
  image_url_sources?: ImageUrlResolveSource[];
  error?: { code?: string; message?: string } | null;
  tokfai?: {
    request_id?: string;
    mode?: string | null;
    prompt_mode?: string | null;
  };
}

export { DashboardDmitApiError as DmitApiError };

const TERMINAL = new Set([
  "completed",
  "failed",
  "retryable_timeout",
  "succeeded",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function imageGenerations(
  apiKey: string,
  body: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  if (!apiKey) {
    throw new DashboardDmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  const res = await dashboardDmitFetchWithHeaders<ImageGenerationResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      json: body,
      accessToken: apiKey,
    }
  );
  const requestId = res.headers.get("x-request-id");
  return {
    ...res.data,
    request_id: res.data.request_id ?? res.data.id ?? requestId ?? undefined,
  };
}

export async function getImageGenerationStatus(
  apiKey: string,
  id: string
): Promise<ImageGenerationResponse> {
  if (!apiKey) {
    throw new DashboardDmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  const res = await dashboardDmitFetchWithHeaders<ImageGenerationResponse>(
    `/v1/images/generations/${encodeURIComponent(id)}`,
    {
      method: "GET",
      accessToken: apiKey,
    }
  );
  return {
    ...res.data,
    request_id: res.data.request_id ?? res.data.id ?? id,
  };
}

export function isImageGenerationTerminal(
  status: string | undefined | null
): boolean {
  if (!status) return false;
  return TERMINAL.has(status);
}

/**
 * Submit image generation and poll until terminal status.
 * Invokes onProgress on each poll (and once after accept).
 */
export async function imageGenerationsWithProgress(
  apiKey: string,
  body: ImageGenerationRequest,
  options?: {
    onProgress?: (state: ImageGenerationResponse) => void;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }
): Promise<ImageGenerationResponse> {
  const accepted = await imageGenerations(apiKey, body);
  options?.onProgress?.(accepted);

  const taskId = accepted.id ?? accepted.request_id;
  if (!taskId) {
    throw new DashboardDmitApiError({
      status: 500,
      message: "Missing generation id.",
      code: "server_error",
    });
  }

  if (isImageGenerationTerminal(accepted.status) && (accepted.data?.length ?? 0) > 0) {
    return accepted;
  }

  // Legacy sync success (status succeeded / completed with data).
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
    latest = await getImageGenerationStatus(apiKey, taskId);
    options?.onProgress?.(latest);
  }

  if (latest.status === "failed" || latest.status === "retryable_timeout") {
    const code = latest.error?.code ?? latest.status;
    const message =
      latest.error?.message ??
      (typeof latest.message === "string"
        ? latest.message
        : latest.message?.en) ??
      "Image generation failed.";
    throw new DashboardDmitApiError({
      status: latest.status === "retryable_timeout" ? 504 : 502,
      message,
      code,
    });
  }

  return latest;
}
