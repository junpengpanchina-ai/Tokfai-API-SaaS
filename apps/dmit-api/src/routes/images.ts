import { Hono } from "hono";
import { z } from "zod";

import {
  DEFAULT_IMAGE_MODEL_ID,
  isModelAllowedForImage,
  listAvailableImageModelIds,
} from "../catalog/modelCatalog.js";
import { isKnownChatModelKind } from "../catalog/modelRegistry.js";
import { ApiError } from "../errors.js";
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import {
  buildPublicImageApiResultResponse,
  buildPublicImageTaskResponse,
} from "../images/publicResponse.js";
import {
  insertImageTask,
  loadOwnedImageTask,
  lookupImageTaskByIdempotency,
} from "../images/tasksDb.js";
import { enqueueImageGeneration } from "../images/worker.js";
import type { ImageGenerationTaskInputSnapshot } from "../types.js";
import {
  resolveImageSizeFields,
} from "../upstream/imageAsyncProvider.js";
import { resolveImageModelId } from "../upstream/imageModelAliases.js";
import {
  normalizeImageInputs,
  primaryImageSourceType,
  resolveImageRequestMode,
  resolvePromptMode,
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
    image: z.union([z.string(), z.array(z.string()).max(4)]).optional(),
    images: z.array(z.string()).max(4).optional(),
    image_urls: z.array(z.string()).max(4).optional(),
    reference_images: z.array(z.string()).max(4).optional(),
    input_images: z.array(z.string()).max(4).optional(),
  })
  .passthrough();

/**
 * /v1/images/generations — OpenAI-compatible image generation, customer-facing.
 * POST accepts the job and returns a task id; poll GET for progress + result.
 */
export const imageRoutes = new Hono();

imageRoutes.use("/v1/images/generations", requireApiKeyOrSupabaseJwt);
imageRoutes.use("/v1/images/generations/*", requireApiKeyOrSupabaseJwt);

imageRoutes.post("/v1/images/generations", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const idempotencyKey = parseIdempotencyKey(
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key")
  );

  if (idempotencyKey && caller.apiKeyId) {
    const existing = await lookupImageTaskByIdempotency({
      apiKeyId: caller.apiKeyId,
      idempotencyKey,
    });
    if (existing) {
      if (existing.status === "queued") {
        enqueueImageGeneration(existing.request_id);
      }
      return c.json(buildPublicImageTaskResponse(existing), 200);
    }
  }

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
    throw ApiError.badRequest("Prompt is required.", "invalid_prompt");
  }

  if (mode === "reference_edit" && normalized.imagesCount === 0) {
    log.warn("image_generation_failed", {
      requestId,
      route: "/v1/images/generations",
      status: 400,
      code: "reference_image_required",
      mode,
      imagesCount: 0,
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
    throw ApiError.badRequest("Only n=1 is supported.", "unsupported_n");
  }

  if (responseFormat !== "url") {
    throw ApiError.badRequest(
      "Only response_format=url is supported.",
      "unsupported_response_format"
    );
  }

  if (
    isKnownChatModelKind(resolvedModel) ||
    !(await isModelAllowedForImage(resolvedModel))
  ) {
    const suggestedModels = await listAvailableImageModelIds();
    const errorMessage = "当前图片模型不可用，请切换图片模型";

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
    if (err instanceof ApiError) throw err;
    throw err;
  }

  let resolvedImageUrls: string[] = [];
  let imageUrlSources: ImageUrlResolveSource[] = [];

  if (normalized.imagesCount > 0) {
    const prepared = await prepareResolvedImages(normalized.images);
    resolvedImageUrls = prepared.urls;
    imageUrlSources = prepared.sources;
  }

  const inputSnapshot: ImageGenerationTaskInputSnapshot = {
    prompt,
    aspectRatio,
    imageSize,
    imageUrls: resolvedImageUrls,
    imageUrlSources,
    mode,
    promptMode,
    imagesCount: normalized.imagesCount,
    imageSourceType,
    imageSourceTypes: normalized.imageSourceTypes,
    hasBlobBlocked: normalized.hasBlobBlocked,
    n,
    responseFormat,
    requestedModel,
  };

  let task;
  try {
    task = await insertImageTask({
      requestId,
      userId: caller.userId,
      apiKeyId: caller.apiKeyId,
      tenantId: caller.tenantId,
      model: resolvedModel,
      idempotencyKey,
      inputSnapshot,
      mode,
      promptMode,
    });
  } catch (err) {
    // Race on idempotency unique index — return the existing task.
    if (idempotencyKey && caller.apiKeyId) {
      const existing = await lookupImageTaskByIdempotency({
        apiKeyId: caller.apiKeyId,
        idempotencyKey,
      });
      if (existing) {
        return c.json(buildPublicImageTaskResponse(existing), 200);
      }
    }
    throw err;
  }

  enqueueImageGeneration(task.request_id);

  log.info("image_generation_accepted", {
    requestId: task.request_id,
    route: "/v1/images/generations",
    status: 202,
    model: resolvedModel,
    mode,
  });

  return c.json(buildPublicImageTaskResponse(task), 202);
});

/**
 * GET /v1/images/generations/:id — progress + result for the caller's own task.
 * tenant_id is derived from API key / login host — never from query/body.
 */
imageRoutes.get("/v1/images/generations/:id", async (c) => {
  const caller = getChatCaller(c);
  const pollRequestId = c.get("requestId" as never) as string;
  const id = c.req.param("id")?.trim();

  if (!id) {
    throw ApiError.badRequest("Generation id is required.", "invalid_request_error");
  }

  // Explicitly ignore any client-supplied tenant_id.
  void c.req.query("tenant_id");

  const task = await loadOwnedImageTask({
    requestId: id,
    userId: caller.userId,
    tenantId: caller.tenantId,
  });

  return c.json(buildPublicImageTaskResponse(task, pollRequestId));
});

/**
 * GET /v1/api/result?id=<request_id> — OpenAI-compat async poll alias.
 */
imageRoutes.use("/v1/api/result", requireApiKeyOrSupabaseJwt);
imageRoutes.get("/v1/api/result", async (c) => {
  const caller = getChatCaller(c);
  const pollRequestId = c.get("requestId" as never) as string;
  const id = c.req.query("id")?.trim();

  if (!id) {
    throw ApiError.badRequest("Query parameter id is required.", "invalid_request_error");
  }

  void c.req.query("tenant_id");

  const task = await loadOwnedImageTask({
    requestId: id,
    userId: caller.userId,
    tenantId: caller.tenantId,
  });

  return c.json(buildPublicImageApiResultResponse(task, pollRequestId));
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
