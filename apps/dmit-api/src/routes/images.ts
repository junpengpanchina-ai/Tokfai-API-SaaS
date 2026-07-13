import { Hono } from "hono";
import { z } from "zod";

import {
  DEFAULT_IMAGE_MODEL_ID,
  isModelAllowedForImage,
  listAvailableImageModelIds,
  priceCreditsForImage,
} from "../catalog/modelCatalog.js";
import { isKnownChatModelKind } from "../catalog/modelRegistry.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  resolveImageSizeFields,
  runImageGenerationWithPolling,
} from "../upstream/imageAsyncProvider.js";
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
  type ImageUrlResolveSource,
} from "../upstream/imageUrlResolver.js";

const ImageGenerationRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    prompt: z.string().optional(),
    n: z.number().int().positive().optional(),
    size: z.string().optional(),
    aspect_ratio: z.string().optional(),
    aspectRatio: z.string().optional(),
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
  "image_generation_timeout",
]);

const IMAGE_LEDGER_REASON = "Image generation usage";

/**
 * /v1/images/generations — OpenAI-compatible image generation, customer-facing.
 */
export const imageRoutes = new Hono();

imageRoutes.use("/v1/images/generations", requireApiKeyOrSupabaseJwt);
imageRoutes.use("/v1/images/generations/*", requireApiKeyOrSupabaseJwt);

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

  if (normalized.hasBlobBlocked) {
    throw new ApiError({
      status: 400,
      message: "blob: URLs are not supported.",
      code: "invalid_image_url",
      type: "validation_error",
      publicMessage:
        "不支持 blob: 或本地文件地址，请先上传图片，再使用 https 或 data URL。",
    });
  }

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
        error_code: "reference_image_required",
        error_message: "请先上传参考图片，或改用文生图模式。",
        latency_ms: Date.now() - startedAt,
      })
    );

    log.warn("image_generation_failed", {
      requestId,
      route: "/v1/images/generations",
      status: 400,
      code: "reference_image_required",
      mode,
      imagesCount: 0,
      upstreamImagesCount: 0,
      imageSourceTypes: normalized.imageSourceTypes,
      promptMode,
      hasBlobBlocked: normalized.hasBlobBlocked,
    });

    throw new ApiError({
      status: 400,
      message: "Reference image required.",
      code: "reference_image_required",
      type: "validation_error",
      publicMessage: "请先上传参考图片，或改用文生图模式。",
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
    ({ aspectRatio, imageSize } = resolveImageSizeFields({
      size: parsed.data.size,
      aspect_ratio: parsed.data.aspect_ratio,
      aspectRatio: parsed.data.aspectRatio,
    }));
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

    const { url, upstreamId, debug } = await runImageGenerationWithPolling({
      requestId,
      resolvedModel,
      prompt,
      aspectRatio,
      imageSize,
      imageUrls: resolvedImageUrls,
      imageUrlSources,
      mode,
      promptMode,
    });

    // Keep for internal logs only — never return provider task id publicly.
    void upstreamId;

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

    return c.json(
      buildPublicImageSuccessResponse({
        requestId,
        model: resolvedModel,
        url,
        creditsCharged,
        mode,
        promptMode,
        imagesCount: normalized.imagesCount,
        resolvedImagesCount: resolvedImageUrls.length,
        imageSourceType,
      })
    );
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

/**
 * GET /v1/images/generations/:id — beta status lookup via usage_logs (no new schema).
 * Image URLs are not persisted; this returns request status / billing fields only.
 */
imageRoutes.get("/v1/images/generations/:id", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const id = c.req.param("id")?.trim();

  if (!id) {
    throw ApiError.badRequest("Generation id is required.", "invalid_request_error");
  }

  const { data, error } = await supabase()
    .from("usage_logs")
    .select(
      "request_id, model, status, credits_charged, error_code, error_message, created_at, latency_ms"
    )
    .eq("user_id", caller.userId)
    .eq("request_id", id)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load image generation status: ${error.message}`,
      "server_error"
    );
  }

  if (!data) {
    throw ApiError.notFound("Image generation not found.", "not_found");
  }

  const createdAt =
    typeof data.created_at === "string"
      ? Math.floor(new Date(data.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

  const status =
    data.status === "succeeded"
      ? "succeeded"
      : data.status === "rate_limited"
        ? "failed"
        : data.status === "failed"
          ? "failed"
          : String(data.status ?? "unknown");

  return c.json({
    id: data.request_id,
    object: "image.generation",
    created: Number.isFinite(createdAt) ? createdAt : Math.floor(Date.now() / 1000),
    model: data.model,
    status,
    data: [],
    usage: {
      credits_charged: data.credits_charged ?? 0,
    },
    tokfai: {
      request_id: data.request_id,
      beta: true,
      result_available: false,
      note:
        "Async result polling is beta. Image URLs are not persisted; use the original POST response for the image URL.",
      latency_ms: data.latency_ms ?? null,
      error_code: data.error_code ?? null,
    },
    request_id: requestId,
  });
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
      : code === "upstream_timeout" || code === "image_generation_timeout"
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
    publicMessage: "算力积分不足，请充值后再试。",
  });
}

function buildPublicImageSuccessResponse(args: {
  requestId: string;
  model: string;
  url: string;
  creditsCharged: number;
  mode: "reference_edit" | "text_to_image";
  promptMode: "subject_preserve" | "normal";
  imagesCount: number;
  resolvedImagesCount: number;
  imageSourceType: string;
}): Record<string, unknown> {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: args.requestId,
    object: "image.generation",
    created,
    model: args.model,
    status: "succeeded",
    data: [{ url: args.url }],
    usage: {
      credits_charged: args.creditsCharged,
    },
    tokfai: {
      request_id: args.requestId,
      mode: args.mode,
      prompt_mode: args.promptMode,
      reference_image_included: args.imagesCount > 0,
    },
    // Playground / dashboard compat fields (no provider / upstream host).
    request_id: args.requestId,
    credits_charged: args.creditsCharged,
    mode: args.mode,
    prompt_mode: args.promptMode,
    reference_image_included: args.imagesCount > 0,
    images_count: args.imagesCount,
    input_images_count: args.imagesCount,
    resolved_images_count: args.resolvedImagesCount,
    image_source_type: args.imageSourceType,
  };
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
