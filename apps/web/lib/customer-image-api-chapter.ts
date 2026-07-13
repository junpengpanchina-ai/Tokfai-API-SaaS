import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

const API_ROOT = "https://api.tokfai.com/v1";

export const IMAGE_API_DEFAULT_MODEL = "gpt-image-2";
export const IMAGE_API_DEFAULT_SIZE = "1024x1024";
export const IMAGE_API_DEFAULT_PROMPT =
  "生成一张边牧与古牧正在直播间带货的电商主图";
export const IMAGE_API_REFERENCE_URL_EXAMPLE =
  "https://example.com/your-reference-image.jpg";

export type ImageApiCurlParams = {
  model?: string;
  prompt?: string;
  size?: string;
  n?: number;
  response_format?: "url";
  image_urls?: string[];
};

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

export function imageApiCurlBody(params?: ImageApiCurlParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params?.model ?? IMAGE_API_DEFAULT_MODEL,
    prompt: params?.prompt ?? IMAGE_API_DEFAULT_PROMPT,
    size: params?.size ?? IMAGE_API_DEFAULT_SIZE,
    n: params?.n ?? 1,
    response_format: params?.response_format ?? "url",
  };

  if (params?.image_urls && params.image_urls.length > 0) {
    body.image_urls = params.image_urls;
  }

  return body;
}

/** One-line curl for POST /v1/images/generations — paste into any terminal shell. */
export function buildImageApiCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  params?: ImageApiCurlParams
): string {
  const body = shellSingleQuotedJson(imageApiCurlBody(params));
  return `curl -sS ${API_ROOT}/images/generations -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

/** One-line curl with image_urls for optional reference-image docs. */
export function buildImageApiReferenceCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  imageUrl = IMAGE_API_REFERENCE_URL_EXAMPLE
): string {
  return buildImageApiCurlOneLine(apiKey, {
    image_urls: [imageUrl],
  });
}

function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

/** PowerShell curl.exe one-line for POST /v1/images/generations. */
export function buildImageApiCurlPowerShellOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  params?: ImageApiCurlParams
): string {
  const body = powershellJsonBody(imageApiCurlBody(params));
  return `curl.exe -sS "${API_ROOT}/images/generations" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${body}"`;
}

/** Readable multiline curl for docs display (copy uses one-line helper). */
export function buildImageApiCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  params?: ImageApiCurlParams
): string {
  const body = JSON.stringify(imageApiCurlBody(params), null, 2);
  return `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

export function buildImageApiReferenceCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  imageUrl = IMAGE_API_REFERENCE_URL_EXAMPLE
): string {
  return buildImageApiCurlMultiline(apiKey, { image_urls: [imageUrl] });
}
