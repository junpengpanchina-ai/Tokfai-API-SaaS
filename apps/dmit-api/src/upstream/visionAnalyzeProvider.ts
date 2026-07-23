/**
 * Dedicated vision analyze upstream — multimodal body only.
 *
 * Never uses buildUpstreamChatBody / executeChatCompletion / Cherry compat.
 * Never routes through image generation adapters.
 */

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { buildVisionUserContentParts } from "../lib/visionContentParts.js";
import { providerFetch } from "./grsai.js";
import {
  resolveProviderAttempts,
  type UpstreamProvider,
} from "./providers.js";

/** Route-local alias — not registered in modelAliases.ts. */
export const VISION_AUTO_MODEL_ID = "vision-auto";
export const VISION_AUTO_RESOLVED_MODEL = "gemini-2.5-flash";

const ALLOWED_VISION_MODELS = new Set([
  VISION_AUTO_MODEL_ID,
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
]);

export function resolveVisionModelId(requested: string | undefined): {
  requestedModel: string;
  resolvedModel: string;
} {
  const requestedModel =
    typeof requested === "string" && requested.trim()
      ? requested.trim()
      : VISION_AUTO_MODEL_ID;

  if (!ALLOWED_VISION_MODELS.has(requestedModel)) {
    throw ApiError.badRequest(
      "This model is not available for vision analyze. Use vision-auto or a supported multimodal model.",
      "model_not_available"
    );
  }

  const resolvedModel =
    requestedModel === VISION_AUTO_MODEL_ID
      ? VISION_AUTO_RESOLVED_MODEL
      : requestedModel;

  return { requestedModel, resolvedModel };
}

export interface VisionUpstreamResult {
  outputText: string;
  upstreamId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  providerId: string;
}

interface ChatCompletionLike {
  choices?: Array<{
    message?: { content?: unknown };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function extractOutputText(data: ChatCompletionLike): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        if (typeof rec.text === "string") parts.push(rec.text);
      }
    }
    return parts.join("").trim();
  }
  return "";
}

function toTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

/**
 * Call the multimodal chat completions path with image_url parts.
 * Uses provider.chatPath — never image generate path.
 */
export async function callVisionAnalyzeUpstream(args: {
  resolvedModel: string;
  requestedModel: string;
  prompt: string;
  imageUrl: string;
  requestId: string;
  timeoutMs?: number;
}): Promise<VisionUpstreamResult> {
  const providers = resolveProviderAttempts(args.resolvedModel);
  const provider: UpstreamProvider | undefined = providers[0];
  if (!provider) {
    throw new ApiError({
      status: 503,
      message: "No upstream provider available for vision analyze.",
      code: "all_upstreams_unavailable",
      type: "upstream_error",
      publicMessage: "Vision analyze is temporarily unavailable. Please retry.",
    });
  }

  const path = provider.chatPath || env.GRSAI_CHAT_COMPLETIONS_PATH;
  // Route-local timeout only — does not edit upstreamTimeoutPolicy.
  const timeoutMs =
    args.timeoutMs ??
    provider.timeoutMs ??
    env.GRSAI_CHAT_TIMEOUT_MS ??
    90_000;

  const body = {
    model: args.resolvedModel,
    stream: false,
    messages: [
      {
        role: "user",
        content: buildVisionUserContentParts({
          prompt: args.prompt,
          imageUrl: args.imageUrl,
        }),
      },
    ],
  };

  const { data, upstreamId } = await providerFetch<ChatCompletionLike>(
    provider,
    path,
    { json: body, timeoutMs },
    {
      requestId: args.requestId,
      route: "/v1/vision/analyze",
      model: args.resolvedModel,
      requestedModel: args.requestedModel,
      resolvedModel: args.resolvedModel,
      providerId: provider.id,
    }
  );

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new ApiError({
      status: 502,
      message: "Vision upstream returned empty content.",
      code: "upstream_error",
      type: "upstream_error",
      publicMessage: "Vision analyze failed. Please retry.",
    });
  }

  return {
    outputText,
    upstreamId,
    promptTokens: toTokenCount(data.usage?.prompt_tokens),
    completionTokens: toTokenCount(data.usage?.completion_tokens),
    totalTokens: toTokenCount(data.usage?.total_tokens),
    providerId: provider.id,
  };
}
