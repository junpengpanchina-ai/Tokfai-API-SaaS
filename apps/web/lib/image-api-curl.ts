import {
  buildImageApiCurlMultiline,
  buildImageApiCurlOneLine,
  type ImageApiCurlParams,
} from "@/lib/customer-image-api-chapter";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export interface ImageGenerationCurlParams {
  model: string;
  prompt: string;
  size: string;
  n?: number;
  response_format?: "url";
  image_urls?: string[];
}

function toChapterParams(params: ImageGenerationCurlParams): ImageApiCurlParams {
  return {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    n: params.n,
    response_format: params.response_format,
    image_urls: params.image_urls,
  };
}

/** Readable multiline curl for display. Never embeds a real API key unless provided. */
export function buildImageGenerationCurl(params: ImageGenerationCurlParams): string {
  return buildImageApiCurlMultiline(TOKFAI_API_KEY_PLACEHOLDER, toChapterParams(params));
}

/** One-line curl for terminal paste — optional real API key when provided. */
export function buildImageGenerationCurlOneLine(
  params: ImageGenerationCurlParams,
  apiKey?: string
): string {
  const key = apiKey?.trim() || TOKFAI_API_KEY_PLACEHOLDER;
  return buildImageApiCurlOneLine(key, toChapterParams(params));
}
