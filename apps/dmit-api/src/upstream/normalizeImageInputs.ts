import { ApiError } from "../errors.js";

export type NormalizedImageSourceType =
  | "data_url"
  | "https_url"
  | "http_url"
  | "blob_blocked"
  | "invalid";

export type NormalizedImageInput = {
  value: string;
  sourceType: "data_url" | "https_url" | "http_url";
  mimeHint: string | null;
  length: number;
};

export type NormalizeImageInputsResult = {
  images: NormalizedImageInput[];
  imagesCount: number;
  imageSourceTypes: NormalizedImageSourceType[];
  hasBlobBlocked: boolean;
  rejectedCount: number;
};

const MAX_IMAGES = 4;
const MAX_DATA_URL_CHARS = 14 * 1024 * 1024; // ~10MB binary + base64 overhead
const MAX_HTTP_URL_CHARS = 4096;
const DATA_IMAGE_RE = /^data:image\/([a-zA-Z0-9.+-]+);base64,/i;

/**
 * Normalize client image inputs for /v1/images/generations.
 * Accepts images / image_urls / reference_images / input_images.
 * Allows http(s) URLs and data:image/*;base64 — never blob:.
 */
export function normalizeImageInputs(body: unknown): NormalizeImageInputsResult {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const rawCandidates = [
    ...asStringArray(record.images),
    ...asStringArray(record.image_urls),
    ...asStringArray(record.reference_images),
    ...asStringArray(record.input_images),
  ];

  const images: NormalizedImageInput[] = [];
  const imageSourceTypes: NormalizedImageSourceType[] = [];
  let hasBlobBlocked = false;
  let rejectedCount = 0;
  const seen = new Set<string>();

  for (const raw of rawCandidates) {
    if (images.length >= MAX_IMAGES) break;

    const trimmed = raw.trim();
    if (!trimmed) {
      rejectedCount += 1;
      continue;
    }

    if (seen.has(trimmed)) continue;

    if (/^blob:/i.test(trimmed) || /^file:/i.test(trimmed)) {
      hasBlobBlocked = true;
      rejectedCount += 1;
      imageSourceTypes.push("blob_blocked");
      throw new ApiError({
        status: 400,
        message: "blob: and file: URLs are not supported.",
        code: "invalid_image_url",
        type: "validation_error",
        publicMessage:
          "不支持 blob: 或本地文件地址，请先上传图片，再使用 https 或 data URL。",
      });
    }

    if (DATA_IMAGE_RE.test(trimmed)) {
      if (trimmed.length > MAX_DATA_URL_CHARS) {
        rejectedCount += 1;
        imageSourceTypes.push("invalid");
        throw ApiError.badRequest(
          "Reference image data URL exceeds the size limit.",
          "image_too_large"
        );
      }
      const mimeMatch = trimmed.match(DATA_IMAGE_RE);
      const mime = mimeMatch?.[1] ? `image/${mimeMatch[1].toLowerCase()}` : null;
      if (mime && !isAllowedImageMime(mime)) {
        rejectedCount += 1;
        imageSourceTypes.push("invalid");
        throw ApiError.badRequest(
          "Only PNG, JPG, and WEBP data URLs are supported.",
          "unsupported_image_content_type"
        );
      }
      seen.add(trimmed);
      images.push({
        value: trimmed,
        sourceType: "data_url",
        mimeHint: mime,
        length: trimmed.length,
      });
      imageSourceTypes.push("data_url");
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      rejectedCount += 1;
      imageSourceTypes.push("invalid");
      throw ApiError.badRequest(
        "Each image must be an http(s) URL or a data:image/*;base64 value.",
        "invalid_image_url"
      );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      rejectedCount += 1;
      imageSourceTypes.push("invalid");
      throw ApiError.badRequest(
        "Each image must be an http(s) URL or a data:image/*;base64 value.",
        "invalid_image_url"
      );
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    ) {
      rejectedCount += 1;
      imageSourceTypes.push("invalid");
      throw new ApiError({
        status: 400,
        message: "localhost image URLs are not supported.",
        code: "invalid_image_url",
        type: "validation_error",
        publicMessage:
          "不支持 localhost 图片地址，请先上传图片，再使用可公网访问的 https URL。",
      });
    }

    if (trimmed.length > MAX_HTTP_URL_CHARS) {
      rejectedCount += 1;
      imageSourceTypes.push("invalid");
      throw ApiError.badRequest(
        "Image URL exceeds the length limit.",
        "invalid_image_url"
      );
    }

    const sourceType = parsed.protocol === "https:" ? "https_url" : "http_url";
    seen.add(trimmed);
    images.push({
      value: trimmed,
      sourceType,
      mimeHint: null,
      length: trimmed.length,
    });
    imageSourceTypes.push(sourceType);
  }

  return {
    images,
    imagesCount: images.length,
    imageSourceTypes,
    hasBlobBlocked,
    rejectedCount,
  };
}

export function summarizeImageInputsForLog(
  normalized: NormalizeImageInputsResult
): Array<{ sourceType: string; length: number; mimeHint: string | null }> {
  return normalized.images.map((item) => ({
    sourceType: item.sourceType,
    length: item.length,
    mimeHint: item.mimeHint,
  }));
}

export function primaryImageSourceType(
  normalized: NormalizeImageInputsResult
): "data_url" | "https_url" | "blob_blocked" | "none" {
  if (normalized.hasBlobBlocked && normalized.imagesCount === 0) {
    return "blob_blocked";
  }
  if (normalized.images.some((item) => item.sourceType === "data_url")) {
    return "data_url";
  }
  if (normalized.images.length > 0) {
    return "https_url";
  }
  return "none";
}

/** Prompt / mode hints that require a reference image. */
const REFERENCE_EDIT_INTENT_RE =
  /保留人物|保留主体|保留脸|不要换人|保持人物|只换衣服|换背景|换服装|换风格|参考图|按原图|照着这张|保留商品|不要换脸|同一张脸|基于原图|局部改图|改图|换成|替换成|改成|subject.?preserve|keep the (same )?person|same face/i;

export function promptImpliesReferenceEdit(prompt: string): boolean {
  return REFERENCE_EDIT_INTENT_RE.test(prompt.trim());
}

export function resolveImageRequestMode(options: {
  bodyMode?: unknown;
  prompt: string;
  imagesCount: number;
}): "reference_edit" | "text_to_image" {
  if (options.bodyMode === "reference_edit") return "reference_edit";
  if (options.imagesCount > 0) return "reference_edit";
  if (promptImpliesReferenceEdit(options.prompt)) return "reference_edit";
  return "text_to_image";
}

export function resolvePromptMode(options: {
  mode: "reference_edit" | "text_to_image";
  prompt: string;
}): "subject_preserve" | "normal" {
  if (options.mode !== "reference_edit") return "normal";
  if (
    /保留人物|保留主体|不要换人|换龙袍|换衣服|换西装|换服装|穿上|把衣服换成|同一张脸|subject.?preserve/i.test(
      options.prompt
    )
  ) {
    return "subject_preserve";
  }
  return "normal";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isAllowedImageMime(mime: string): boolean {
  return (
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/webp"
  );
}
