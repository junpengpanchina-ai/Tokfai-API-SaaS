import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import {
  fetchImageAsDataUrl,
  sanitizeImageUrlForLog,
  type ImageUrlResolveSource,
} from "./imageUrlResolver.js";

const IMAGE_TO_IMAGE_PROMPT_PREFIX =
  "You are editing a reference image. Strictly preserve the same person/product subject: same face or product identity, proportions, pose, camera angle, and subject count. Do not invent a new person/product. Do not create dual-person, side-by-side comparison, or multi-version collage. Only change what the user explicitly requests. Output a single complete image.";

const BASE = env.GRSAI_BASE_URL.replace(/\/+$/, "");

export type GrsaiImageInputMode =
  | "images_url"
  | "image_url"
  | "imageUrl"
  | "input_image"
  | "referenceImages"
  | "images_data_url";

export type GrsaiAdapterMode = GrsaiImageInputMode | "legacy_draw";

export interface ImageGenerateRequest {
  model: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  imageUrls?: string[];
  imageUrlSources?: ImageUrlResolveSource[];
}

export interface GrsaiImageGenerateResponse {
  id?: string;
  status?: string;
  results?: Array<{ url?: string }>;
  progress?: number;
}

export interface ImageGenerateDebugInfo {
  resolved_images_count: number;
  image_url_sources: ImageUrlResolveSource[];
  upstream_payload_keys: string[];
  adapter_mode: GrsaiAdapterMode;
}

export interface ImageGenerateResult {
  url: string;
  upstreamId: string | null;
  debug: ImageGenerateDebugInfo;
}

export interface BuildGrsaiImagePayloadParams {
  model: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  resolvedImageUrls: string[];
}

export interface GrsaiImagePayloadResult {
  payload: Record<string, unknown>;
  adapterMode: GrsaiAdapterMode;
  upstreamPayloadKeys: string[];
  inputImagesForLog: string[];
}

export function mapSizeToGrsai(size: string | undefined): {
  aspectRatio: string;
  imageSize: string;
} {
  switch (size ?? "1024x1024") {
    case "1024x1024":
      return { aspectRatio: "1:1", imageSize: "1K" };
    case "1792x1024":
      return { aspectRatio: "16:9", imageSize: "1K" };
    case "1024x1792":
      return { aspectRatio: "9:16", imageSize: "1K" };
    default:
      throw ApiError.badRequest(
        `Unsupported image size \`${size}\`.`,
        "unsupported_size"
      );
  }
}

export function buildImageGenerationPrompt(
  prompt: string,
  imageUrlCount: number
): string {
  if (imageUrlCount <= 0) return prompt;
  return `${IMAGE_TO_IMAGE_PROMPT_PREFIX}\n\n${prompt}`;
}

export async function buildGrsaiImagePayload(
  params: BuildGrsaiImagePayloadParams
): Promise<GrsaiImagePayloadResult> {
  const { model, prompt, aspectRatio, imageSize, resolvedImageUrls } = params;
  const mode = env.GRSAI_IMAGE_INPUT_MODE;

  const base: Record<string, unknown> = {
    model,
    prompt,
    aspectRatio,
    imageSize,
    replyType: "json",
  };

  if (resolvedImageUrls.length === 0) {
    return {
      payload: base,
      adapterMode: "legacy_draw",
      upstreamPayloadKeys: Object.keys(base),
      inputImagesForLog: [],
    };
  }

  switch (mode) {
    case "images_url":
      return finishPayload(base, "images_url", {
        images: resolvedImageUrls,
      }, resolvedImageUrls);

    case "image_url":
      return finishPayload(base, "image_url", {
        image: resolvedImageUrls[0],
      }, resolvedImageUrls);

    case "imageUrl":
      return finishPayload(base, "imageUrl", {
        imageUrl: resolvedImageUrls[0],
      }, resolvedImageUrls);

    case "input_image":
      return finishPayload(base, "input_image", {
        input_image: resolvedImageUrls[0],
      }, resolvedImageUrls);

    case "referenceImages":
      return finishPayload(base, "referenceImages", {
        referenceImages: resolvedImageUrls,
      }, resolvedImageUrls);

    case "images_data_url": {
      const dataUrls: string[] = [];
      for (const imageUrl of resolvedImageUrls) {
        dataUrls.push(await fetchImageAsDataUrl(imageUrl));
      }
      return finishPayload(base, "images_data_url", {
        images: dataUrls,
      }, dataUrls);
    }

    default: {
      const _exhaustive: never = mode;
      throw ApiError.internal(
        `Unsupported GRSAI_IMAGE_INPUT_MODE: ${String(_exhaustive)}`,
        "server_error"
      );
    }
  }
}

function finishPayload(
  base: Record<string, unknown>,
  adapterMode: GrsaiAdapterMode,
  imageFields: Record<string, unknown>,
  inputImagesForLog: string[]
): GrsaiImagePayloadResult {
  const payload = { ...base, ...imageFields };
  return {
    payload,
    adapterMode,
    upstreamPayloadKeys: Object.keys(payload),
    inputImagesForLog,
  };
}

function describeFirstImageForLog(imageRef: string | undefined): {
  first_image_host: string | null;
  first_image_path_prefix: string | null;
  is_data_url: boolean;
} {
  if (!imageRef) {
    return {
      first_image_host: null,
      first_image_path_prefix: null,
      is_data_url: false,
    };
  }

  if (imageRef.startsWith("data:")) {
    return {
      first_image_host: null,
      first_image_path_prefix: imageRef.slice(0, 80),
      is_data_url: true,
    };
  }

  try {
    const parsed = new URL(imageRef);
    const pathWithQuery = `${parsed.pathname}${parsed.search}`;
    return {
      first_image_host: parsed.host,
      first_image_path_prefix: pathWithQuery.slice(0, 80),
      is_data_url: false,
    };
  } catch {
    return {
      first_image_host: null,
      first_image_path_prefix: sanitizeImageUrlForLog(imageRef).slice(0, 80),
      is_data_url: false,
    };
  }
}

export async function generateImage(
  request: ImageGenerateRequest
): Promise<ImageGenerateResult> {
  const path = env.GRSAI_IMAGE_GENERATE_PATH;
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const imageUrls = request.imageUrls ?? [];
  const imageUrlSources = request.imageUrlSources ?? [];
  const upstreamPrompt = buildImageGenerationPrompt(
    request.prompt,
    imageUrls.length
  );

  const { payload, adapterMode, upstreamPayloadKeys, inputImagesForLog } =
    await buildGrsaiImagePayload({
      model: request.model,
      prompt: upstreamPrompt,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      resolvedImageUrls: imageUrls,
    });

  const firstImage = inputImagesForLog[0];
  const firstImageMeta = describeFirstImageForLog(firstImage);

  log.info("image_generation_upstream_request", {
    model: request.model,
    has_input_images: imageUrls.length > 0,
    input_images_count: imageUrls.length,
    image_url_sources: imageUrlSources,
    upstream_payload_keys: upstreamPayloadKeys,
    adapter_mode: adapterMode,
    ...firstImageMeta,
    prompt_prefix: upstreamPrompt.slice(0, 120),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GRSAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.IMAGE_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new ApiError({
        status: 504,
        message: "GRSAI image generation timed out.",
        code: "upstream_timeout",
        type: "upstream_error",
        publicMessage: "Upstream provider timed out.",
      });
    }

    throw ApiError.internal(
      err instanceof Error ? err.message : "Image generation failed.",
      "server_error"
    );
  }

  const headerUpstreamId =
    res.headers.get("x-request-id") ?? res.headers.get("x-upstream-id");

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError({
      status: 502,
      message: `GRSAI returned ${res.status}.`,
      code: "upstream_error",
      type: "upstream_error",
      publicMessage: truncate(text, 200) || "Upstream provider failed.",
    });
  }

  let data: GrsaiImageGenerateResponse;
  try {
    data = (await res.json()) as GrsaiImageGenerateResponse;
  } catch {
    throw new ApiError({
      status: 502,
      message: "GRSAI returned invalid JSON.",
      code: "upstream_invalid_response",
      type: "upstream_error",
      publicMessage: "Upstream provider returned an invalid response.",
    });
  }

  const upstreamId = data.id ?? headerUpstreamId;
  const imageUrl = data.results?.[0]?.url;

  if (data.status !== "succeeded" || typeof imageUrl !== "string" || !imageUrl) {
    throw new ApiError({
      status: 502,
      message: "GRSAI image response missing image URL.",
      code: "upstream_invalid_response",
      type: "upstream_error",
      publicMessage: "Upstream provider returned an invalid response.",
    });
  }

  return {
    url: imageUrl,
    upstreamId,
    debug: {
      resolved_images_count: imageUrls.length,
      image_url_sources: imageUrlSources,
      upstream_payload_keys: upstreamPayloadKeys,
      adapter_mode: adapterMode,
    },
  };
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
