import type { ImageGenerationResponse } from "@/lib/dmit/client";

type LooseImageResult = ImageGenerationResponse & Record<string, unknown>;

function readUrl(value: unknown): string | null {
  if (typeof value !== "object" || value == null) return null;
  const url = (value as { url?: unknown }).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** Compatible parsing for image URL fields across upstream response shapes. */
export function resolveGeneratedImageUrl(
  result: ImageGenerationResponse | null | undefined
): string | null {
  if (!result) return null;

  const loose = result as LooseImageResult;
  const fromData = readUrl(Array.isArray(loose.data) ? loose.data[0] : null);
  if (fromData) return fromData;

  if (typeof loose.image_url === "string" && loose.image_url.trim()) {
    return loose.image_url.trim();
  }

  const fromOutput = readUrl(Array.isArray(loose.output) ? loose.output[0] : null);
  if (fromOutput) return fromOutput;

  const fromImages = readUrl(Array.isArray(loose.images) ? loose.images[0] : null);
  if (fromImages) return fromImages;

  return null;
}

/** True when the response includes base64 image data but no displayable URL. */
export function hasGeneratedImageBase64(
  result: ImageGenerationResponse | null | undefined
): boolean {
  if (!result) return false;
  const loose = result as LooseImageResult;
  const first = Array.isArray(loose.data) ? loose.data[0] : null;
  if (typeof first !== "object" || first == null) return false;
  const b64 = (first as { b64_json?: unknown }).b64_json;
  return typeof b64 === "string" && b64.trim().length > 0;
}

export function resolveImageCreatedAt(
  result: ImageGenerationResponse | null | undefined
): string | null {
  if (!result) return null;

  const loose = result as LooseImageResult;
  if (typeof loose.created_at === "string" && loose.created_at.trim()) {
    const fromField = new Date(loose.created_at.trim());
    if (!Number.isNaN(fromField.getTime())) {
      return fromField.toISOString();
    }
  }

  if (!result.created) return null;
  const ms =
    result.created > 1_000_000_000_000
      ? result.created
      : result.created * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function imagePlaygroundErrorMessage(
  status: number,
  code: string | undefined,
  t: (key: string) => string,
  fallback?: string
): string {
  const normalized = (code ?? "").toLowerCase();

  const codeMap: Record<string, string> = {
    missing_token: "dashboard.imagePlayground.errors.missingToken",
    missing_api_key: "dashboard.imagePlayground.errors.missingToken",
    no_api_key: "dashboard.imagePlayground.errors.missingToken",
    key_not_revealable: "dashboard.imagePlayground.errors.keyNotRetrievable",
    invalid_token: "dashboard.imagePlayground.errors.invalidToken",
    invalid_api_key: "dashboard.imagePlayground.errors.invalidToken",
    insufficient_credits: "dashboard.imagePlayground.errors.insufficientCredits",
    upstream_timeout: "dashboard.imagePlayground.errors.upstreamTimeout",
    upstream_error: "dashboard.imagePlayground.errors.upstreamError",
    image_generation_failed:
      "dashboard.imagePlayground.errors.imageGenerationFailed",
    missing_prompt: "dashboard.imagePlayground.errors.missingPrompt",
  };

  if (status === 402 || normalized === "insufficient_credits") {
    return t("dashboard.imagePlayground.errors.insufficientCredits");
  }

  if (
    normalized === "upstream_error" ||
    normalized === "upstream_timeout" ||
    normalized === "image_generation_failed" ||
    status === 502 ||
    status >= 500
  ) {
    const key = codeMap[normalized];
    return key ? t(key) : t("dashboard.imagePlayground.errors.upstreamError");
  }

  if (status === 401 && !codeMap[normalized]) {
    return t("dashboard.imagePlayground.errors.invalidToken");
  }

  const key = codeMap[normalized];
  if (key) {
    return t(key);
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  return t("dashboard.imagePlayground.errors.unknown");
}
