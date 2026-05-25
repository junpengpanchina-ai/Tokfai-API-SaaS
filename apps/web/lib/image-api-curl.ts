import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export interface ImageGenerationCurlParams {
  model: string;
  prompt: string;
  size: string;
  n?: number;
  response_format?: "url";
  image_urls?: string[];
}

/** Build a copyable curl for POST /v1/images/generations. Never embeds a real API key. */
export function buildImageGenerationCurl(
  params: ImageGenerationCurlParams
): string {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    n: params.n ?? 1,
    response_format: params.response_format ?? "url",
  };

  if (params.image_urls && params.image_urls.length > 0) {
    body.image_urls = params.image_urls;
  }

  const json = JSON.stringify(body, null, 2);

  return `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '${json}'`;
}
