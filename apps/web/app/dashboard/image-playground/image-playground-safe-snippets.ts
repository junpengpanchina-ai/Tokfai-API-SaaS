import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/dashboard-safe/constants";

const API_ROOT = "https://api.tokfai.com/v1";

export interface ImageGenerationCurlParams {
  model: string;
  prompt: string;
  size: string;
  n?: number;
  response_format?: "url";
  mode?: "text_to_image" | "reference_edit";
  images?: string[];
  image_urls?: string[];
}

function imageApiCurlBody(params: ImageGenerationCurlParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    n: params.n ?? 1,
    response_format: params.response_format ?? "url",
  };

  if (params.mode) {
    body.mode = params.mode;
  }

  if (params.images && params.images.length > 0) {
    body.images = params.images;
  } else if (params.image_urls && params.image_urls.length > 0) {
    body.image_urls = params.image_urls;
  }

  return body;
}

/** One-line curl for terminal paste — optional real API key when provided. */
export function buildImageGenerationCurlOneLine(
  params: ImageGenerationCurlParams,
  apiKey?: string
): string {
  const key = apiKey?.trim() || TOKFAI_API_KEY_PLACEHOLDER;
  const body = JSON.stringify(imageApiCurlBody(params)).replace(/'/g, "'\\''");
  return `curl -sS ${API_ROOT}/images/generations -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${body}'`;
}
