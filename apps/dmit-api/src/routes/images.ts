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
  generateImage,
  mapSizeToGrsai,
} from "../upstream/imageAdapter.js";
import { resolveImageModelId } from "../upstream/imageModelAliases.js";
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
    image_urls: z
      .array(
        z
          .string()
          .url()
          .max(2048)
          .refine(isHttpOrHttpsUrl, {
            message: "Each image URL must use http or https.",
          })
      )
      .max(4)
      .optional(),
  })
  .passthrough();

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const UPSTREAM_ERROR_CODES = new Set([
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_error",
  "upstream_invalid_response",
  "upstream_timeout",
]);

const IMAGE_LEDGER_REASON = "Image generation usage";

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

  const resolvedModel = resolveImageModelId(
    parsed.data.model?.trim() || DEFAULT_IMAGE_MODEL_ID
  );
  const prompt = parsed.data.prompt?.trim();
  const n = parsed.data.n ?? 1;
  const responseFormat = parsed.data.response_format ?? "url";
  const imageUrls = parsed.data.image_urls ?? [];

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

  try {
    if (imageUrls.length > 0) {
      const resolved = await resolveImageInputUrls(imageUrls);
      resolvedImageUrls = resolved.map((item) => item.url);
      imageUrlSources = resolved.map((item) => item.source);
    }

    await assertHasCredits(caller.userId);

    const { url, upstreamId, debug } = await generateImage({
      model: resolvedModel,
      prompt,
      aspectRatio,
      imageSize,
      imageUrls: resolvedImageUrls,
      imageUrlSources,
    });

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
      has_input_images: imageUrls.length > 0,
      input_images_count: imageUrls.length,
      resolved_images_count: resolvedImageUrls.length,
      image_url_sources: imageUrlSources,
      upstream_payload_keys: debug.upstream_payload_keys,
      adapter_mode: debug.adapter_mode,
      input_image_url_hints: imageUrls.map(sanitizeImageUrlForLog),
    });

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ url }],
      model: resolvedModel,
      request_id: requestId,
      upstream_id: upstreamId,
      credits_charged: creditsCharged,
      input_images_count: imageUrls.length,
      resolved_images_count: resolvedImageUrls.length,
      image_url_sources: imageUrlSources,
      ...(env.NODE_ENV !== "production"
        ? {
            debug: {
              resolved_images_count: debug.resolved_images_count,
              image_url_sources: debug.image_url_sources,
              upstream_payload_keys: debug.upstream_payload_keys,
              adapter_mode: debug.adapter_mode,
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
        has_input_images: imageUrls.length > 0,
        input_images_count: imageUrls.length,
        resolved_images_count: resolvedImageUrls.length,
        image_url_sources: imageUrlSources,
        input_image_url_hints: imageUrls.map(sanitizeImageUrlForLog),
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
      has_input_images: imageUrls.length > 0,
      input_images_count: imageUrls.length,
      resolved_images_count: resolvedImageUrls.length,
      image_url_sources: imageUrlSources,
      input_image_url_hints: imageUrls.map(sanitizeImageUrlForLog),
    });

    throw ApiError.internal(
      err instanceof Error ? err.message : "Image generation failed.",
      "server_error"
    );
  }
});

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
