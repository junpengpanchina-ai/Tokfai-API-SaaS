import { Hono } from "hono";
import { z } from "zod";

import {
  DEFAULT_IMAGE_MODEL_ID,
  isModelAllowedForImage,
  listAvailableImageModelIds,
  priceCreditsForImage,
} from "../catalog/modelCatalog.js";
import { isKnownChatModelKind } from "../catalog/modelRegistry.js";
import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  buildGrsaiImagePayload,
  buildImageGenerationPrompt,
  mapSizeToGrsai,
  type ImageGenerateDebugInfo,
  type ImageGenerateResult,
} from "../upstream/imageAdapter.js";
import { resolveImageModelId } from "../upstream/imageModelAliases.js";
import {
  normalizeImageInputs,
  primaryImageSourceType,
  resolveImageRequestMode,
  resolvePromptMode,
  summarizeImageInputsForLog,
  type NormalizedImageInput,
} from "../upstream/normalizeImageInputs.js";
import {
  resolveImageInputUrls,
  sanitizeImageUrlForLog,
  type ImageUrlResolveSource,
} from "../upstream/imageUrlResolver.js";

const ImageGenerationRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    prompt: z.string().optional(),
    n: z.number().int().positive().optional(),
    size: z.string().optional(),
    response_format: z.string().optional(),
    mode: z.string().optional(),
    // Image fields are normalized separately (images / image_urls / …).
    images: z.array(z.string()).max(4).optional(),
    image_urls: z.array(z.string()).max(4).optional(),
    reference_images: z.array(z.string()).max(4).optional(),
    input_images: z.array(z.string()).max(4).optional(),
  })
  .passthrough();

const UPSTREAM_ERROR_CODES = new Set([
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_error",
  "upstream_invalid_response",
  "upstream_timeout",
]);

const IMAGE_LEDGER_REASON = "Image generation usage";
const GRSAI_BASE = env.GRSAI_BASE_URL.replace(/\/+$/, "");
const UPSTREAM_BODY_PREVIEW_MAX = 1000;

/**
 * /v1/images/generations — OpenAI-compatible image generation, customer-facing.
 */
export const imageRoutes = new Hono();

imageRoutes.use("/v1/images/generations", requireApiKeyOrSupabaseJwt);

imageRoutes.post("/v1/images/generations", async (c) => {
  const startedAt = Date.now();
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;

  const body = await readJsonBody(c.req.json());
  const parsed = ImageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid image generation request.",
      "invalid_request_error"
    );
  }

  const requestedModel = parsed.data.model?.trim() || DEFAULT_IMAGE_MODEL_ID;
  const resolvedModel = resolveImageModelId(requestedModel);
  const prompt = parsed.data.prompt?.trim();
  const n = parsed.data.n ?? 1;
  const responseFormat = parsed.data.response_format ?? "url";

  const normalized = normalizeImageInputs(body);
  const mode = resolveImageRequestMode({
    bodyMode: parsed.data.mode,
    prompt: prompt ?? "",
    imagesCount: normalized.imagesCount,
  });
  const promptMode = resolvePromptMode({
    mode,
    prompt: prompt ?? "",
  });
  const imageSourceType = primaryImageSourceType(normalized);

  log.info("image_generation_requested", {
    requestId,
    model: resolvedModel,
    mode,
    imagesCount: normalized.imagesCount,
    upstreamImagesCount: null,
    imageSourceTypes: normalized.imageSourceTypes,
    promptMode,
    hasBlobBlocked: normalized.hasBlobBlocked,
  });

  if (!prompt) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "invalid_prompt",
        error_message: "Prompt is required.",
        latency_ms: Date.now() - startedAt,
      })
    );

    throw ApiError.badRequest("Prompt is required.", "invalid_prompt");
  }

  if (mode === "reference_edit" && normalized.imagesCount === 0) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "reference_image_missing",
        error_message: "需要上传参考图后才能进行保留主体改图。",
        latency_ms: Date.now() - startedAt,
      })
    );

    log.warn("image_generation_failed", {
      requestId,
      route: "/v1/images/generations",
      status: 400,
      code: "reference_image_missing",
      mode,
      imagesCount: 0,
      upstreamImagesCount: 0,
      imageSourceTypes: normalized.imageSourceTypes,
      promptMode,
      hasBlobBlocked: normalized.hasBlobBlocked,
    });

    throw new ApiError({
      status: 400,
      message: "需要上传参考图后才能进行保留主体改图。",
      code: "reference_image_missing",
      type: "validation_error",
    });
  }

  if (n > 1) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "unsupported_n",
        error_message: "Only n=1 is supported.",
        latency_ms: Date.now() - startedAt,
      })
    );

    throw ApiError.badRequest("Only n=1 is supported.", "unsupported_n");
  }

  if (responseFormat !== "url") {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "unsupported_response_format",
        error_message: "Only response_format=url is supported.",
        latency_ms: Date.now() - startedAt,
      })
    );

    throw ApiError.badRequest(
      "Only response_format=url is supported.",
      "unsupported_response_format"
    );
  }

  if (isKnownChatModelKind(resolvedModel) || !(await isModelAllowedForImage(resolvedModel))) {
    const suggestedModels = await listAvailableImageModelIds();
    const errorMessage = "当前图片模型不可用，请切换图片模型";

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "image_model_not_available",
        error_message: errorMessage,
        latency_ms: Date.now() - startedAt,
      })
    );

    return c.json(
      {
        error: {
          message: errorMessage,
          code: "image_model_not_available",
          type: "invalid_request_error",
        },
        suggestedModels,
      },
      400
    );
  }

  let aspectRatio: string;
  let imageSize: string;
  try {
    ({ aspectRatio, imageSize } = mapSizeToGrsai(parsed.data.size));
  } catch (err) {
    if (err instanceof ApiError) {
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          model: resolvedModel,
          status: "failed",
          request_id: requestId,
          error_code: err.code ?? "unsupported_size",
          error_message: err.publicMessage,
          latency_ms: Date.now() - startedAt,
        })
      );
      throw err;
    }
    throw err;
  }

  let resolvedImageUrls: string[] = [];
  let imageUrlSources: ImageUrlResolveSource[] = [];
  let upstreamImagesCount = 0;

  try {
    if (normalized.imagesCount > 0) {
      const prepared = await prepareResolvedImages(normalized.images);
      resolvedImageUrls = prepared.urls;
      imageUrlSources = prepared.sources;
    }

    await assertHasCredits(caller.userId);

    const { url, upstreamId, debug } = await callGrsaiImageUpstream({
      requestId,
      requestedModel,
      resolvedModel,
      prompt,
      aspectRatio,
      imageSize,
      imageUrls: resolvedImageUrls,
      imageUrlSources,
      mode,
      promptMode,
    });

    upstreamImagesCount =
      debug.upstream_images_count ??
      (debug.upstream_payload_keys.includes("images")
        ? resolvedImageUrls.length
        : 0);

    const creditsCharged = await priceCreditsForImage(resolvedModel);

    await recordImageUsageAndDebit({
      user_id: caller.userId,
      api_key_id: caller.apiKeyId,
      model: resolvedModel,
      status: "succeeded",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      credits_charged: creditsCharged,
      request_id: requestId,
      upstream_id: upstreamId,
      error_code: null,
      error_message: null,
      latency_ms: Date.now() - startedAt,
      billable: true,
      finish_reason: null,
      upstream_status: null,
      upstream_error_code: null,
      safety_reason: null,
    });

    log.info("image_generation_succeeded", {
      requestId,
      route: "/v1/images/generations",
      status: 200,
      code: "succeeded",
      message: "Image generation succeeded.",
      mode,
      promptMode,
      has_input_images: normalized.imagesCount > 0,
      imagesCount: normalized.imagesCount,
      input_images_count: normalized.imagesCount,
      resolved_images_count: resolvedImageUrls.length,
      upstreamImagesCount,
      imageSourceTypes: normalized.imageSourceTypes,
      image_source_type: imageSourceType,
      hasBlobBlocked: normalized.hasBlobBlocked,
      image_url_sources: imageUrlSources,
      upstream_payload_keys: debug.upstream_payload_keys,
      adapter_mode: debug.adapter_mode,
      input_image_hints: summarizeImageInputsForLog(normalized),
    });

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ url }],
      model: resolvedModel,
      request_id: requestId,
      upstream_id: upstreamId,
      credits_charged: creditsCharged,
      mode,
      prompt_mode: promptMode,
      reference_image_included: normalized.imagesCount > 0,
      images_count: normalized.imagesCount,
      input_images_count: normalized.imagesCount,
      resolved_images_count: resolvedImageUrls.length,
      upstream_images_count: upstreamImagesCount,
      image_source_type: imageSourceType,
      image_url_sources: imageUrlSources,
      ...(env.NODE_ENV !== "production"
        ? {
            debug: {
              resolved_images_count: debug.resolved_images_count,
              image_url_sources: debug.image_url_sources,
              upstream_payload_keys: debug.upstream_payload_keys,
              adapter_mode: debug.adapter_mode,
              upstream_images_count: upstreamImagesCount,
            },
          }
        : {}),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          model: resolvedModel,
          status:
            err.code === "upstream_rate_limited" ? "rate_limited" : "failed",
          request_id: requestId,
          error_code: err.code ?? null,
          error_message: err.publicMessage,
          latency_ms: Date.now() - startedAt,
          ...upstreamFailureFields(err),
        })
      );

      log.warn("image_generation_failed", {
        requestId,
        route: "/v1/images/generations",
        status: err.status,
        code: err.code ?? "failed",
        message: err.publicMessage,
        mode,
        promptMode,
        has_input_images: normalized.imagesCount > 0,
        imagesCount: normalized.imagesCount,
        input_images_count: normalized.imagesCount,
        resolved_images_count: resolvedImageUrls.length,
        upstreamImagesCount,
        imageSourceTypes: normalized.imageSourceTypes,
        image_source_type: imageSourceType,
        hasBlobBlocked: normalized.hasBlobBlocked,
        image_url_sources: imageUrlSources,
        input_image_hints: summarizeImageInputsForLog(normalized),
      });

      throw err;
    }

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "server_error",
        error_message: "Internal error.",
        latency_ms: Date.now() - startedAt,
      })
    );

    log.error("image_generation_failed", {
      requestId,
      route: "/v1/images/generations",
      status: 500,
      code: "server_error",
      message: "Internal error.",
      mode,
      promptMode,
      has_input_images: normalized.imagesCount > 0,
      imagesCount: normalized.imagesCount,
      input_images_count: normalized.imagesCount,
      resolved_images_count: resolvedImageUrls.length,
      upstreamImagesCount,
      imageSourceTypes: normalized.imageSourceTypes,
      image_source_type: imageSourceType,
      hasBlobBlocked: normalized.hasBlobBlocked,
      image_url_sources: imageUrlSources,
    });

    throw ApiError.internal(
      err instanceof Error ? err.message : "Image generation failed.",
      "server_error"
    );
  }
});

async function prepareResolvedImages(
  inputs: NormalizedImageInput[]
): Promise<{ urls: string[]; sources: ImageUrlResolveSource[] }> {
  const urls: string[] = [];
  const sources: ImageUrlResolveSource[] = [];

  const httpUrls: string[] = [];
  const httpIndexes: number[] = [];

  for (let i = 0; i < inputs.length; i += 1) {
    const item = inputs[i]!;
    if (item.sourceType === "data_url") {
      urls[i] = item.value;
      sources[i] = "data_url";
    } else {
      httpUrls.push(item.value);
      httpIndexes.push(i);
      urls[i] = item.value;
      sources[i] = "direct";
    }
  }

  if (httpUrls.length > 0) {
    const resolved = await resolveImageInputUrls(httpUrls);
    for (let j = 0; j < resolved.length; j += 1) {
      const index = httpIndexes[j]!;
      urls[index] = resolved[j]!.url;
      sources[index] = resolved[j]!.source;
    }
  }

  return { urls, sources };
}

async function readJsonBody(bodyPromise: Promise<unknown>): Promise<unknown> {
  try {
    return await bodyPromise;
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }
}

async function assertHasCredits(userId: string): Promise<void> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Credit precheck failed: ${error.message}`,
      "credit_precheck_failed"
    );
  }

  if (!data || toNumber(data.credits_balance) <= 0) {
    throw insufficientCreditsError();
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

type FailedUsageLogFields = Pick<
  UsageLogInsert,
  | "user_id"
  | "api_key_id"
  | "model"
  | "status"
  | "request_id"
  | "error_code"
  | "error_message"
  | "latency_ms"
> &
  Partial<Pick<UsageLogInsert, "upstream_status" | "upstream_error_code">>;

function failedUsageLog(fields: FailedUsageLogFields): UsageLogInsert {
  return {
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    upstream_id: null,
    billable: false,
    finish_reason: null,
    upstream_status: fields.upstream_status ?? null,
    upstream_error_code: fields.upstream_error_code ?? null,
    safety_reason: null,
    ...fields,
  };
}

function upstreamFailureFields(
  err: ApiError
): Pick<UsageLogInsert, "upstream_status" | "upstream_error_code"> {
  const code = err.code;
  if (!code || !UPSTREAM_ERROR_CODES.has(code)) {
    return { upstream_status: null, upstream_error_code: null };
  }

  const upstreamStatus =
    code === "upstream_rate_limited"
      ? 429
      : code === "upstream_timeout"
        ? 504
        : 502;

  return {
    upstream_status: upstreamStatus,
    upstream_error_code: code,
  };
}

async function recordImageUsageAndDebit(
  entry: UsageLogInsert
): Promise<void> {
  const creditsCharged = entry.credits_charged ?? 0;

  if (creditsCharged > 0) {
    const { error: debitError } = await supabase().rpc("debit_credits", {
      p_user_id: entry.user_id,
      p_amount: creditsCharged,
      p_reason: IMAGE_LEDGER_REASON,
      p_reference_id: entry.request_id,
    });

    if (debitError) {
      if (
        debitError.code === "P0001" ||
        debitError.message.toLowerCase().includes("insufficient_credits")
      ) {
        throw insufficientCreditsError();
      }

      throw ApiError.internal(
        `Usage billing failed: ${debitError.message}`,
        "usage_billing_failed"
      );
    }
  }

  const { error: logError } = await supabase().from("usage_logs").insert({
    ...entry,
    status: "succeeded",
  });

  if (logError) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/images/generations",
      status: 500,
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}

function insufficientCreditsError(): ApiError {
  return new ApiError({
    status: 402,
    message: "Insufficient credits.",
    code: "insufficient_credits",
    type: "billing_error",
  });
}

async function writeUsageLog(entry: UsageLogInsert): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert(entry);
  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/images/generations",
      status: 500,
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}

type GrsaiUpstreamCallParams = {
  requestId: string;
  requestedModel: string;
  resolvedModel: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  imageUrls: string[];
  imageUrlSources: ImageUrlResolveSource[];
  mode: "reference_edit" | "text_to_image";
  promptMode: "subject_preserve" | "normal";
};

type ParsedImageExtraction = {
  url: string;
  upstreamId: string | null;
  responseParseMode: string;
};

function grsaiImageUpstreamUrl(): string {
  const path = env.GRSAI_IMAGE_GENERATE_PATH;
  return `${GRSAI_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function previewUpstreamBody(text: string): string {
  const preview =
    text.length > UPSTREAM_BODY_PREVIEW_MAX
      ? `${text.slice(0, UPSTREAM_BODY_PREVIEW_MAX)}…`
      : text;
  const apiKey = env.GRSAI_API_KEY;
  if (!apiKey || !preview.includes(apiKey)) {
    return preview;
  }
  return preview.split(apiKey).join("[REDACTED]");
}

function logGrsaiImageUpstreamDiagnostic(fields: {
  requestId: string;
  requestedModel: string;
  resolvedModel: string;
  upstreamUrl: string;
  upstreamMethod: "POST";
  upstreamStatus: number;
  upstreamContentType: string | null;
  upstreamBodyPreview: string;
  latencyMs: number;
  responseParseMode: string;
}): void {
  log.info("grsai_image_upstream_diagnostic", fields);
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
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

function extractUpstreamErrorMessage(
  parsed: unknown,
  upstreamText: string
): string | null {
  const obj = asRecord(parsed);
  if (obj) {
    const error = asRecord(obj.error);
    if (error) {
      const message = error.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    }
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message.trim();
    }
  }

  const trimmed = upstreamText.trim();
  return trimmed ? truncateText(trimmed, 200) : null;
}

function extractImageFromContentString(
  content: string,
  parsed: Record<string, unknown>
): ParsedImageExtraction | null {
  const markdownMatch = content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownMatch?.[1]) {
    return {
      url: markdownMatch[1],
      upstreamId: extractUpstreamId(parsed),
      responseParseMode: "chat_completions_content_markdown",
    };
  }

  const dataUrlMatch = content.match(
    /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/i
  );
  if (dataUrlMatch?.[1]) {
    return {
      url: dataUrlMatch[1].replace(/\s+/g, ""),
      upstreamId: extractUpstreamId(parsed),
      responseParseMode: "chat_completions_content_base64",
    };
  }

  const plainUrlMatch = content.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (plainUrlMatch?.[1]) {
    return {
      url: plainUrlMatch[1],
      upstreamId: extractUpstreamId(parsed),
      responseParseMode: "chat_completions_content_url",
    };
  }

  return null;
}

function extractImageFromParsed(parsed: unknown): ParsedImageExtraction | null {
  const obj = asRecord(parsed);
  if (!obj) return null;

  const results = obj.results;
  if (Array.isArray(results)) {
    const first = asRecord(results[0]);
    if (first && typeof first.url === "string" && first.url.trim()) {
      return {
        url: first.url.trim(),
        upstreamId: extractUpstreamId(obj),
        responseParseMode: "grsai_results_url",
      };
    }
  }

  const data = obj.data;
  if (Array.isArray(data)) {
    const first = asRecord(data[0]);
    if (first) {
      if (typeof first.url === "string" && first.url.trim()) {
        return {
          url: first.url.trim(),
          upstreamId: extractUpstreamId(obj),
          responseParseMode: "openai_data_url",
        };
      }
      if (typeof first.b64_json === "string" && first.b64_json.trim()) {
        const mime =
          typeof first.mime_type === "string" && first.mime_type.trim()
            ? first.mime_type.trim()
            : "image/png";
        return {
          url: `data:${mime};base64,${first.b64_json.trim()}`,
          upstreamId: extractUpstreamId(obj),
          responseParseMode: "openai_data_b64",
        };
      }
    }
  }

  const choices = obj.choices;
  if (Array.isArray(choices)) {
    const firstChoice = asRecord(choices[0]);
    const message = firstChoice ? asRecord(firstChoice.message) : null;
    const content = message?.content;
    if (typeof content === "string" && content.trim()) {
      const fromContent = extractImageFromContentString(content.trim(), obj);
      if (fromContent) return fromContent;
    }
  }

  if (typeof obj.url === "string" && obj.url.trim()) {
    return {
      url: obj.url.trim(),
      upstreamId: extractUpstreamId(obj),
      responseParseMode: "top_level_url",
    };
  }

  return null;
}

function throwUpstreamError(params: {
  status: number;
  code: string;
  serverMessage: string;
  publicMessage: string;
  upstreamStatus?: number;
  upstreamErrorSnippet?: string;
}): never {
  throw new ApiError({
    status: params.status,
    message: params.serverMessage,
    code: params.code,
    type: "upstream_error",
    publicMessage: params.publicMessage,
    upstreamStatus: params.upstreamStatus,
    upstreamErrorSnippet: params.upstreamErrorSnippet,
  });
}

async function callGrsaiImageUpstream(
  params: GrsaiUpstreamCallParams
): Promise<ImageGenerateResult> {
  const upstreamUrl = grsaiImageUpstreamUrl();
  const upstreamMethod = "POST" as const;
  const upstreamStartedAt = Date.now();
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
  const upstreamImagesCount = upstreamImages.length;

  log.info("image_generation_upstream_request", {
    requestId: params.requestId,
    model: params.resolvedModel,
    requestedModel: params.requestedModel,
    mode: params.mode,
    promptMode: params.promptMode,
    has_input_images: params.imageUrls.length > 0,
    imagesCount: params.imageUrls.length,
    input_images_count: params.imageUrls.length,
    upstreamImagesCount,
    image_url_sources: params.imageUrlSources,
    upstream_payload_keys: upstreamPayloadKeys,
    adapter_mode: adapterMode,
    prompt_prefix: upstreamPrompt.slice(0, 120),
    input_image_url_hints: params.imageUrls.map((url) =>
      url.startsWith("data:")
        ? `data_url(len=${url.length})`
        : sanitizeImageUrlForLog(url)
    ),
  });

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      method: upstreamMethod,
      headers: {
        Authorization: `Bearer ${env.GRSAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.IMAGE_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const latencyMs = Date.now() - upstreamStartedAt;
    logGrsaiImageUpstreamDiagnostic({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      resolvedModel: params.resolvedModel,
      upstreamUrl,
      upstreamMethod,
      upstreamStatus: 0,
      upstreamContentType: null,
      upstreamBodyPreview: "",
      latencyMs,
      responseParseMode: isTimeoutError(err)
        ? "fetch_timeout"
        : "fetch_failed",
    });

    if (isTimeoutError(err)) {
      throwUpstreamError({
        status: 504,
        code: "upstream_timeout",
        serverMessage: "GRSAI image generation timed out.",
        publicMessage: "Upstream provider timed out.",
        upstreamStatus: 504,
      });
    }

    throw ApiError.internal(
      err instanceof Error ? err.message : "Image generation failed.",
      "server_error"
    );
  }

  const latencyMs = Date.now() - upstreamStartedAt;
  const upstreamStatus = response.status;
  const upstreamContentType = response.headers.get("content-type");
  const headerUpstreamId =
    response.headers.get("x-request-id") ?? response.headers.get("x-upstream-id");
  const upstreamText = await response.text();
  const upstreamBodyPreview = previewUpstreamBody(upstreamText);

  let parsed: unknown = null;
  let responseParseMode = "json_parse_failed";

  if (upstreamText.trim()) {
    try {
      parsed = JSON.parse(upstreamText);
      responseParseMode = "json";
    } catch {
      parsed = null;
      responseParseMode = "json_parse_failed";
    }
  } else {
    responseParseMode = "empty_body";
  }

  const upstreamErrorMessage = extractUpstreamErrorMessage(parsed, upstreamText);
  const errorObj = asRecord(parsed)?.error;
  const hasStructuredUpstreamError =
    errorObj !== undefined && errorObj !== null;

  if (hasStructuredUpstreamError) {
    logGrsaiImageUpstreamDiagnostic({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      resolvedModel: params.resolvedModel,
      upstreamUrl,
      upstreamMethod,
      upstreamStatus,
      upstreamContentType,
      upstreamBodyPreview,
      latencyMs,
      responseParseMode: "upstream_error_json",
    });

    throwUpstreamError({
      status: 502,
      code: "upstream_error",
      serverMessage: `GRSAI returned upstream error: ${upstreamErrorMessage ?? "unknown"}`,
      publicMessage:
        upstreamErrorMessage ?? "Upstream provider failed.",
      upstreamStatus,
      upstreamErrorSnippet: truncateText(upstreamText, 200),
    });
  }

  if (!response.ok) {
    logGrsaiImageUpstreamDiagnostic({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      resolvedModel: params.resolvedModel,
      upstreamUrl,
      upstreamMethod,
      upstreamStatus,
      upstreamContentType,
      upstreamBodyPreview,
      latencyMs,
      responseParseMode:
        responseParseMode === "json"
          ? "http_error_json"
          : responseParseMode,
    });

    throwUpstreamError({
      status: 502,
      code: "upstream_error",
      serverMessage: `GRSAI returned ${upstreamStatus}.`,
      publicMessage:
        upstreamErrorMessage ??
        (truncateText(upstreamText, 200) || "Upstream provider failed."),
      upstreamStatus,
      upstreamErrorSnippet: truncateText(upstreamText, 200),
    });
  }

  if (parsed === null) {
    logGrsaiImageUpstreamDiagnostic({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      resolvedModel: params.resolvedModel,
      upstreamUrl,
      upstreamMethod,
      upstreamStatus,
      upstreamContentType,
      upstreamBodyPreview,
      latencyMs,
      responseParseMode,
    });

    throwUpstreamError({
      status: 502,
      code: "upstream_invalid_response",
      serverMessage: "GRSAI returned invalid JSON.",
      publicMessage: "Upstream provider returned an invalid response.",
      upstreamStatus,
      upstreamErrorSnippet: upstreamBodyPreview,
    });
  }

  const extracted = extractImageFromParsed(parsed);
  if (!extracted) {
    logGrsaiImageUpstreamDiagnostic({
      requestId: params.requestId,
      requestedModel: params.requestedModel,
      resolvedModel: params.resolvedModel,
      upstreamUrl,
      upstreamMethod,
      upstreamStatus,
      upstreamContentType,
      upstreamBodyPreview,
      latencyMs,
      responseParseMode: "unexpected_format",
    });

    throwUpstreamError({
      status: 502,
      code: "upstream_invalid_response",
      serverMessage: "GRSAI image response missing image URL.",
      publicMessage: "Upstream provider returned an invalid response.",
      upstreamStatus,
      upstreamErrorSnippet: upstreamBodyPreview,
    });
  }

  logGrsaiImageUpstreamDiagnostic({
    requestId: params.requestId,
    requestedModel: params.requestedModel,
    resolvedModel: params.resolvedModel,
    upstreamUrl,
    upstreamMethod,
    upstreamStatus,
    upstreamContentType,
    upstreamBodyPreview,
    latencyMs,
    responseParseMode: extracted.responseParseMode,
  });

  const debug: ImageGenerateDebugInfo = {
    resolved_images_count: params.imageUrls.length,
    image_url_sources: params.imageUrlSources,
    upstream_payload_keys: upstreamPayloadKeys,
    adapter_mode: adapterMode,
    upstream_images_count: upstreamImagesCount,
  };

  return {
    url: extracted.url,
    upstreamId: extracted.upstreamId ?? headerUpstreamId,
    debug,
  };
}
