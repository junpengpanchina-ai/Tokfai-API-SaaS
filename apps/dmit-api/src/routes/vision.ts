/**
 * POST /v1/vision/analyze — isolated image understanding endpoint.
 *
 * Hard constraints:
 * - Does not change /v1/chat/completions text main path or Cherry compat
 * - Does not change image generation (/v1/images/generations)
 * - Does not change modelAliases / timeout policy
 * - Bills as usage_type=vision_analyze via endpoint /v1/vision/analyze
 * - Upstream failure → not_billable (no debit)
 */

import { Hono } from "hono";
import { z } from "zod";

import { priceCreditsFor } from "../catalog/modelPricing.js";
import { ApiError, sanitizePublicErrorMessage } from "../errors.js";
import {
  VISION_ANALYZE_ENDPOINT,
  VISION_ANALYZE_USAGE_TYPE,
  recordVisionAnalyzeFailure,
  recordVisionAnalyzeSuccess,
} from "../lib/visionUsage.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import {
  assertImageUrlNotSsrf,
  fetchImageAsDataUrl,
  sanitizeImageUrlForLog,
} from "../upstream/imageUrlResolver.js";
import {
  callVisionAnalyzeUpstream,
  resolveVisionModelId,
} from "../upstream/visionAnalyzeProvider.js";

const VisionAnalyzeRequestSchema = z.object({
  model: z.string().min(1).optional(),
  image_url: z.string().min(1),
  prompt: z.string().min(1).optional(),
});

const MAX_DATA_URL_BYTES = 10 * 1024 * 1024;
const DATA_IMAGE_RE =
  /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
const ALLOWED_DATA_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const visionRoutes = new Hono();

visionRoutes.use("/v1/vision/analyze", requireApiKeyOrSupabaseJwt);

visionRoutes.post("/v1/vision/analyze", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const startedAt = Date.now();

  const rawBody = await readJsonBody(c.req.json());
  const parsed = VisionAnalyzeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid vision analyze request. Provide image_url and optional prompt/model.",
      "invalid_request_error"
    );
  }

  const prompt =
    typeof parsed.data.prompt === "string" && parsed.data.prompt.trim()
      ? parsed.data.prompt.trim()
      : "请分析这张图";
  const imageUrlRaw = parsed.data.image_url.trim();
  const { requestedModel, resolvedModel } = resolveVisionModelId(
    parsed.data.model
  );

  let preparedImageUrl: string;
  try {
    preparedImageUrl = await prepareVisionImageUrl(imageUrlRaw);
  } catch (err) {
    await safeFailUsage({
      caller,
      requestId,
      resolvedModel,
      startedAt,
      err,
    });
    throw err;
  }

  try {
    await assertHasCredits(caller.userId);
  } catch (err) {
    await safeFailUsage({
      caller,
      requestId,
      resolvedModel,
      startedAt,
      err,
    });
    throw err;
  }

  let upstream;
  try {
    upstream = await callVisionAnalyzeUpstream({
      resolvedModel,
      requestedModel,
      prompt,
      imageUrl: preparedImageUrl,
      requestId,
    });
  } catch (err) {
    await safeFailUsage({
      caller,
      requestId,
      resolvedModel,
      startedAt,
      err,
    });
    throw err;
  }

  const promptTokens = upstream.promptTokens ?? 0;
  const completionTokens = upstream.completionTokens ?? 0;
  const totalTokens =
    upstream.totalTokens ?? promptTokens + completionTokens;
  const creditsCharged = await priceCreditsFor(
    resolvedModel,
    promptTokens,
    completionTokens,
    caller.tenantId
  );

  const latencyMs = Date.now() - startedAt;
  const analysisId = `vis_${requestId.replace(/^req_/, "")}`;

  let billingStatus: "charged" | "failed" = "charged";

  try {
    await recordVisionAnalyzeSuccess({
      entry: {
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: resolvedModel,
        status: "succeeded",
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        credits_charged: creditsCharged,
        request_id: requestId,
        upstream_id: upstream.upstreamId,
        error_code: null,
        error_message: null,
        latency_ms: latencyMs,
        billable: true,
        finish_reason: "stop",
        upstream_status: 200,
        upstream_error_code: null,
        safety_reason: `usage_type=${VISION_ANALYZE_USAGE_TYPE}`,
        billing_status: "charged",
        endpoint: VISION_ANALYZE_ENDPOINT,
      },
      responseSnapshot: {
        object: "vision.analysis",
        model: resolvedModel,
      },
    });
  } catch (err) {
    billingStatus = "failed";
    log.warn("vision_analyze_billing_failed", {
      requestId,
      route: VISION_ANALYZE_ENDPOINT,
      usageType: VISION_ANALYZE_USAGE_TYPE,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const responseBody = {
    id: analysisId,
    object: "vision.analysis" as const,
    model: resolvedModel,
    output_text: upstream.outputText,
    request_id: requestId,
    tokfai: {
      credits_charged: creditsCharged,
      billing_status: billingStatus,
      resolved_model: resolvedModel,
      requested_model: requestedModel,
      usage_type: VISION_ANALYZE_USAGE_TYPE,
    },
  };

  log.info("vision_analyze_succeeded", {
    requestId,
    route: VISION_ANALYZE_ENDPOINT,
    usageType: VISION_ANALYZE_USAGE_TYPE,
    requestedModel,
    resolvedModel,
    imageUrl: sanitizeImageUrlForLog(imageUrlRaw),
    latencyMs,
    creditsCharged,
    providerId: upstream.providerId,
  });

  c.header("X-Request-Id", requestId);
  return c.json(responseBody, 200);
});

async function prepareVisionImageUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) {
    throw ApiError.badRequest("image_url is required.", "invalid_image_url");
  }

  if (/^(blob:|file:)/i.test(rawUrl)) {
    throw new ApiError({
      status: 400,
      message: "blob: and file: URLs are not supported.",
      code: "invalid_image_url",
      type: "validation_error",
      publicMessage:
        "不支持 blob: 或本地文件地址，请使用 https 或 data URL。",
    });
  }

  if (/^data:/i.test(rawUrl)) {
    return validateDataImageUrl(rawUrl);
  }

  // SSRF gate before any fetch.
  assertImageUrlNotSsrf(rawUrl);

  // Fetch validates content-type (non-image reject) + size (too large reject).
  return fetchImageAsDataUrl(rawUrl);
}

function validateDataImageUrl(dataUrl: string): string {
  const match = DATA_IMAGE_RE.exec(dataUrl.trim());
  if (!match) {
    throw new ApiError({
      status: 400,
      message: "Unsupported data URL. Use data:image/png|jpeg|webp;base64,...",
      code: "unsupported_image_content_type",
      type: "validation_error",
      publicMessage:
        "URL does not point to a supported image (PNG, JPG, or WEBP).",
    });
  }

  const mime = match[1]!.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_DATA_MIME.has(mime)) {
    throw new ApiError({
      status: 400,
      message: `Unsupported image content type: ${mime}`,
      code: "unsupported_image_content_type",
      type: "validation_error",
      publicMessage:
        "URL does not point to a supported image (PNG, JPG, or WEBP).",
    });
  }

  const b64 = match[2]!.replace(/\s+/g, "");
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_DATA_URL_BYTES) {
    throw new ApiError({
      status: 400,
      message: "Image exceeds the 10 MB size limit.",
      code: "image_too_large",
      type: "validation_error",
      publicMessage: "Image exceeds the 10 MB size limit.",
    });
  }

  return `data:${mime};base64,${b64}`;
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

  const balance = Number(data?.credits_balance ?? 0);
  if (!data || !Number.isFinite(balance) || balance <= 0) {
    throw new ApiError({
      status: 402,
      message: "Insufficient credits.",
      code: "insufficient_credits",
      type: "billing_error",
      publicMessage:
        "Insufficient balance. Please top up credits in the Tokfai dashboard.",
    });
  }
}

async function safeFailUsage(args: {
  caller: ReturnType<typeof getChatCaller>;
  requestId: string;
  resolvedModel: string;
  startedAt: number;
  err: unknown;
}): Promise<void> {
  const apiErr =
    args.err instanceof ApiError
      ? args.err
      : new ApiError({
          status: 500,
          message: "Vision analyze failed.",
          code: "server_error",
          type: "server_error",
          publicMessage: "Internal error.",
        });

  const publicMessage = sanitizePublicErrorMessage(
    apiErr.publicMessage,
    "Vision analyze failed."
  );

  try {
    await recordVisionAnalyzeFailure({
      user_id: args.caller.userId,
      api_key_id: args.caller.apiKeyId,
      tenant_id: args.caller.tenantId,
      model: args.resolvedModel,
      status: "failed",
      request_id: args.requestId,
      error_code: apiErr.code ?? "upstream_error",
      error_message: publicMessage,
      latency_ms: Date.now() - args.startedAt,
      upstream_status: apiErr.upstreamStatus ?? apiErr.status,
      upstream_error_code: apiErr.code ?? null,
      billing_status: "not_billable",
    });
  } catch (logErr) {
    log.warn("vision_analyze_fail_usage_log_error", {
      requestId: args.requestId,
      message: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }
}

async function readJsonBody(
  promise: Promise<unknown>
): Promise<Record<string, unknown>> {
  try {
    const body = await promise;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON.", "invalid_json");
  }
}
