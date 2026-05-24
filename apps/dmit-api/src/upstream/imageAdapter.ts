import { env } from "../env.js";
import { ApiError } from "../errors.js";

const BASE = env.GRSAI_BASE_URL.replace(/\/+$/, "");

export interface ImageGenerateRequest {
  model: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  imageUrls?: string[];
}

export interface GrsaiImageGenerateResponse {
  id?: string;
  status?: string;
  results?: Array<{ url?: string }>;
  progress?: number;
}

export interface ImageGenerateResult {
  url: string;
  upstreamId: string | null;
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

export async function generateImage(
  request: ImageGenerateRequest
): Promise<ImageGenerateResult> {
  const path = env.GRSAI_IMAGE_GENERATE_PATH;
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GRSAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        images: request.imageUrls ?? [],
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        replyType: "json",
      }),
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

  return { url: imageUrl, upstreamId };
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
