/**
 * Internal image upstream adapter (async-capable).
 * Provider brand / host / path must never appear in public API responses.
 */
import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  buildGrsaiImagePayload,
  buildImageGenerationPrompt,
  type ImageGenerateDebugInfo,
  type ImageGenerateResult,
} from "./imageAdapter.js";
import { sanitizeImageUrlForLog, type ImageUrlResolveSource } from "./imageUrlResolver.js";

const PROVIDER_ID = "primary_image";

function imageProviderBaseUrl(): string {
  const raw =
    process.env.IMAGE_PROVIDER_BASE_URL?.trim() ||
    env.GRSAI_BASE_URL;
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function imageProviderApiKey(): string {
  return (
    process.env.IMAGE_PROVIDER_API_KEY?.trim() ||
    env.GRSAI_API_KEY
  );
}

function imageGeneratePath(): string {
  const path =
    process.env.IMAGE_PROVIDER_GENERATE_PATH?.trim() ||
    env.GRSAI_IMAGE_GENERATE_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function imageResultPath(): string {
  const path =
    process.env.IMAGE_PROVIDER_RESULT_PATH?.trim() || "/v1/draw/result";
  return path.startsWith("/") ? path : `/${path}`;
}

function requestTimeoutMs(): number {
  const fromEnv = Number(process.env.IMAGE_PROVIDER_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return env.IMAGE_REQUEST_TIMEOUT_MS;
}

function pollIntervalMs(): number {
  const fromEnv = Number(process.env.IMAGE_PROVIDER_POLL_INTERVAL_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 2_000;
}

function maxPollMs(): number {
  const fromEnv = Number(process.env.IMAGE_PROVIDER_MAX_POLL_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return Math.max(requestTimeoutMs(), 180_000);
}

function retryDelayMs(): number {
  return 1_500 + Math.floor(Math.random() * 1_501);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

function isRetryableImageError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (
    err.code === "image_generation_timeout" ||
    err.code === "upstream_timeout" ||
    err.code === "upstream_model_busy"
  ) {
    return true;
  }
  if (err.upstreamStatus === 429 || err.upstreamStatus === 503) {
    return true;
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractUpstreamId(parsed: Record<string, unknown>): string | null {
  if (typeof parsed.id === "string" && parsed.id.trim()) {
    return parsed.id.trim();
  }
  return null;
}

function extractImageUrl(parsed: unknown): {
  url: string;
  taskId: string | null;
  status: string | null;
} | null {
  const obj = asRecord(parsed);
  if (!obj) return null;

  const status =
    typeof obj.status === "string" ? obj.status.trim().toLowerCase() : null;
  const taskId = extractUpstreamId(obj);

  const results = obj.results;
  if (Array.isArray(results)) {
    const first = asRecord(results[0]);
    if (first && typeof first.url === "string" && first.url.trim()) {
      return { url: first.url.trim(), taskId, status };
    }
    if (first && typeof first.error === "string" && first.error.trim()) {
      throw friendlyUpstreamFailed(first.error.trim());
    }
  }

  const data = obj.data;
  if (Array.isArray(data)) {
    const first = asRecord(data[0]);
    if (first && typeof first.url === "string" && first.url.trim()) {
      return { url: first.url.trim(), taskId, status };
    }
  }

  if (typeof obj.url === "string" && obj.url.trim()) {
    return { url: obj.url.trim(), taskId, status };
  }

  return status || taskId ? { url: "", taskId, status } : null;
}

function friendlyTimeoutError(): ApiError {
  return new ApiError({
    status: 504,
    message: "Image generation timed out.",
    code: "image_generation_timeout",
    type: "upstream_error",
    publicMessage: "图片生成时间较长，请稍后重试或更换模型。",
    upstreamStatus: 504,
  });
}

function friendlyUpstreamFailed(
  detail?: string,
  upstreamStatus = 502
): ApiError {
  const busy = upstreamStatus === 429 || upstreamStatus === 503;
  return new ApiError({
    status: busy ? (upstreamStatus === 429 ? 429 : 503) : 502,
    message: detail ? `Image channel failed: ${detail}` : "Image channel failed.",
    code: busy ? "upstream_model_busy" : "upstream_error",
    type: "upstream_error",
    publicMessage: busy
      ? "图片生成服务繁忙，请稍后重试或更换模型。"
      : "图片生成失败，请稍后重试或更换模型。",
    upstreamStatus,
    upstreamErrorSnippet: detail ? detail.slice(0, 200) : undefined,
  });
}

function isPendingStatus(status: string | null): boolean {
  if (!status) return false;
  return [
    "pending",
    "processing",
    "running",
    "queued",
    "in_progress",
    "started",
  ].includes(status);
}

function isFailedStatus(status: string | null): boolean {
  if (!status) return false;
  return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function isSucceededStatus(status: string | null): boolean {
  if (!status) return false;
  return ["succeeded", "success", "completed", "done"].includes(status);
}

export type CreateImageTaskParams = {
  requestId: string;
  resolvedModel: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  imageUrls: string[];
  imageUrlSources: ImageUrlResolveSource[];
  mode: "reference_edit" | "text_to_image";
  promptMode: "subject_preserve" | "normal";
};

export type CreateImageTaskResult = {
  taskId: string | null;
  url: string | null;
  status: string | null;
  debug: ImageGenerateDebugInfo;
  latencyMs: number;
};

async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number
): Promise<{ res: Response; text: string; latencyMs: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${imageProviderApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { res, text, latencyMs: Date.now() - started };
  } catch (err) {
    if (isTimeoutError(err)) {
      throw friendlyTimeoutError();
    }
    throw ApiError.internal(
      err instanceof Error ? err.message : "Image generation failed.",
      "server_error"
    );
  }
}

export async function createImageGenerationTask(
  params: CreateImageTaskParams
): Promise<CreateImageTaskResult> {
  const base = imageProviderBaseUrl();
  const generateUrl = `${base}${imageGeneratePath()}`;
  const upstreamPrompt = buildImageGenerationPrompt(
    params.prompt,
    params.imageUrls.length
  );

  const { payload, adapterMode, upstreamPayloadKeys } =
    await buildGrsaiImagePayload({
      model: params.resolvedModel,
      prompt: upstreamPrompt,
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      resolvedImageUrls: params.imageUrls,
    });

  const upstreamImages = Array.isArray(payload.images)
    ? (payload.images as unknown[]).filter((item) => typeof item === "string")
    : [];

  log.info("image_generation_upstream_request", {
    requestId: params.requestId,
    providerId: PROVIDER_ID,
    model: params.resolvedModel,
    mode: params.mode,
    promptMode: params.promptMode,
    imagesCount: params.imageUrls.length,
    upstreamImagesCount: upstreamImages.length,
    adapter_mode: adapterMode,
    upstream_payload_keys: upstreamPayloadKeys,
    image_url_sources: params.imageUrlSources,
    input_image_hints: params.imageUrls.map((url) =>
      url.startsWith("data:")
        ? `data_url(len=${url.length})`
        : sanitizeImageUrlForLog(url)
    ),
  });

  const { res, text, latencyMs } = await postJson(
    generateUrl,
    payload,
    requestTimeoutMs()
  );

  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  log.info("image_provider_create_response", {
    requestId: params.requestId,
    providerId: PROVIDER_ID,
    upstreamStatus: res.status,
    latencyMs,
  });

  if (!res.ok) {
    throw friendlyUpstreamFailed(`http_${res.status}`, res.status);
  }

  if (parsed === null) {
    throw friendlyUpstreamFailed("invalid_json");
  }

  const extracted = extractImageUrl(parsed);
  if (!extracted) {
    throw friendlyUpstreamFailed("missing_image");
  }

  if (isFailedStatus(extracted.status)) {
    throw friendlyUpstreamFailed(extracted.status ?? "failed");
  }

  const debug: ImageGenerateDebugInfo = {
    resolved_images_count: params.imageUrls.length,
    image_url_sources: params.imageUrlSources,
    upstream_payload_keys: upstreamPayloadKeys,
    adapter_mode: adapterMode,
    upstream_images_count: upstreamImages.length,
  };

  if (extracted.url) {
    return {
      taskId: extracted.taskId,
      url: extracted.url,
      status: extracted.status ?? "succeeded",
      debug,
      latencyMs,
    };
  }

  if (extracted.taskId && isPendingStatus(extracted.status)) {
    return {
      taskId: extracted.taskId,
      url: null,
      status: extracted.status,
      debug,
      latencyMs,
    };
  }

  // Some providers return id without status while still pending.
  if (extracted.taskId && !extracted.url) {
    return {
      taskId: extracted.taskId,
      url: null,
      status: extracted.status ?? "pending",
      debug,
      latencyMs,
    };
  }

  throw friendlyUpstreamFailed("unexpected_response");
}

export async function pollImageGenerationTask(args: {
  requestId: string;
  taskId: string;
}): Promise<{ url: string | null; status: string | null; latencyMs: number }> {
  const base = imageProviderBaseUrl();
  const resultUrl = `${base}${imageResultPath()}`;
  const started = Date.now();

  const { res, text, latencyMs } = await postJson(
    resultUrl,
    { id: args.taskId },
    requestTimeoutMs()
  );

  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  log.info("image_provider_poll_response", {
    requestId: args.requestId,
    providerId: PROVIDER_ID,
    upstreamStatus: res.status,
    latencyMs,
    elapsedMs: Date.now() - started,
  });

  if (!res.ok) {
    throw friendlyUpstreamFailed(`poll_http_${res.status}`, res.status);
  }
  if (parsed === null) {
    throw friendlyUpstreamFailed("poll_invalid_json");
  }

  const extracted = extractImageUrl(parsed);
  if (!extracted) {
    return { url: null, status: "pending", latencyMs };
  }
  if (isFailedStatus(extracted.status)) {
    throw friendlyUpstreamFailed(extracted.status ?? "failed");
  }
  if (extracted.url) {
    return {
      url: extracted.url,
      status: extracted.status ?? "succeeded",
      latencyMs,
    };
  }
  return {
    url: null,
    status: extracted.status ?? "pending",
    latencyMs,
  };
}

/**
 * Create an image task and, when the private channel is async, poll until
 * success / fail / timeout. Retries once on timeout / busy.
 */
export async function runImageGenerationWithPolling(
  params: CreateImageTaskParams
): Promise<ImageGenerateResult> {
  const startedAt = Date.now();
  let retryCount = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await runImageGenerationAttempt(params);
      if (retryCount > 0) {
        log.info("image_generation_retry_succeeded", {
          requestId: params.requestId,
          providerId: PROVIDER_ID,
          model: params.resolvedModel,
          retryCount,
          elapsedMs: Date.now() - startedAt,
        });
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt === 0 && isRetryableImageError(err)) {
        retryCount = 1;
        const delay = retryDelayMs();
        log.warn("image_generation_retrying", {
          requestId: params.requestId,
          providerId: PROVIDER_ID,
          model: params.resolvedModel,
          retryCount,
          delayMs: delay,
          elapsedMs: Date.now() - startedAt,
          code: err instanceof ApiError ? err.code : undefined,
        });
        await sleep(delay);
        continue;
      }
      break;
    }
  }

  if (lastError instanceof ApiError) {
    log.warn("image_generation_failed_after_retries", {
      requestId: params.requestId,
      providerId: PROVIDER_ID,
      model: params.resolvedModel,
      retryCount,
      elapsedMs: Date.now() - startedAt,
      code: lastError.code,
    });
    throw lastError;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Image generation failed.");
}

async function runImageGenerationAttempt(
  params: CreateImageTaskParams
): Promise<ImageGenerateResult> {
  const created = await createImageGenerationTask(params);
  if (created.url) {
    return {
      url: created.url,
      upstreamId: created.taskId,
      debug: created.debug,
    };
  }

  if (!created.taskId) {
    throw friendlyUpstreamFailed("missing_task_id");
  }

  const deadline = Date.now() + maxPollMs();
  const interval = pollIntervalMs();

  while (Date.now() < deadline) {
    await sleep(interval);
    const polled = await pollImageGenerationTask({
      requestId: params.requestId,
      taskId: created.taskId,
    });

    if (polled.url) {
      return {
        url: polled.url,
        upstreamId: created.taskId,
        debug: created.debug,
      };
    }

    if (isSucceededStatus(polled.status) && !polled.url) {
      throw friendlyUpstreamFailed("succeeded_without_url");
    }
  }

  throw friendlyTimeoutError();
}

/**
 * Normalize public size / aspect fields into upstream aspectRatio + imageSize.
 */
export function resolveImageSizeFields(input: {
  size?: string;
  aspect_ratio?: string;
  aspectRatio?: string;
}): { aspectRatio: string; imageSize: string; publicSize: string } {
  const sizeRaw = input.size?.trim();
  const aspectRatioRaw = input.aspect_ratio?.trim() || input.aspectRatio?.trim();

  const asSizeToken = (value: string | undefined): string | null => {
    if (!value) return null;
    if (/^\d+x\d+$/i.test(value)) return value.toLowerCase();
    return null;
  };

  const asAspectToken = (value: string | undefined): string | null => {
    if (!value) return null;
    if (/^\d+:\d+$/.test(value)) return value;
    return null;
  };

  const sizeToken = asSizeToken(sizeRaw) ?? asSizeToken(aspectRatioRaw);
  const aspectToken = asAspectToken(aspectRatioRaw) ?? asAspectToken(sizeRaw);

  if (sizeToken === "1024x1024" || aspectToken === "1:1" || (!sizeToken && !aspectToken)) {
    return { aspectRatio: "1:1", imageSize: "1K", publicSize: "1024x1024" };
  }
  if (sizeToken === "1792x1024" || aspectToken === "16:9") {
    return { aspectRatio: "16:9", imageSize: "1K", publicSize: "1792x1024" };
  }
  if (sizeToken === "1024x1792" || aspectToken === "9:16") {
    return { aspectRatio: "9:16", imageSize: "1K", publicSize: "1024x1792" };
  }

  throw ApiError.badRequest(
    `Unsupported image size \`${sizeRaw ?? aspectRatioRaw}\`.`,
    "unsupported_size"
  );
}
