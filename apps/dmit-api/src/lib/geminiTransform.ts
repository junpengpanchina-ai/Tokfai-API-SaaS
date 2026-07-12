import { z } from "zod";

import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";
import { extractAssistantTextFromChatResponse } from "./responsesTransform.js";

/**
 * Google Gemini Generative Language API ↔ OpenAI chat conversion (minimal MVP).
 *
 * Used by Cherry Studio Gemini Provider against Tokfai /v1beta/*.
 */

const GeminiPartSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough();

const GeminiContentSchema = z
  .object({
    role: z.string().optional(),
    parts: z.array(GeminiPartSchema).optional(),
  })
  .passthrough();

const GeminiGenerationConfigSchema = z
  .object({
    temperature: z.number().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  })
  .passthrough();

export const GeminiGenerateContentRequestSchema = z
  .object({
    contents: z.array(GeminiContentSchema).min(1),
    systemInstruction: z
      .union([
        z.string(),
        z
          .object({
            parts: z.array(GeminiPartSchema).optional(),
            role: z.string().optional(),
          })
          .passthrough(),
      ])
      .optional(),
    generationConfig: GeminiGenerationConfigSchema.optional(),
  })
  .passthrough();

export type GeminiGenerateContentRequest = z.infer<
  typeof GeminiGenerateContentRequestSchema
>;

/** Minimum Gemini models Cherry Studio connection checks expect. */
export const REQUIRED_GEMINI_MODEL_IDS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

export type GeminiModelAction =
  | "generateContent"
  | "streamGenerateContent";

export function normalizeGeminiModelId(raw: string): string {
  const trimmed = decodeURIComponent(raw.trim());
  if (trimmed.startsWith("models/")) {
    return trimmed.slice("models/".length);
  }
  return trimmed;
}

export function toGeminiModelName(modelId: string): string {
  const id = normalizeGeminiModelId(modelId);
  return id.startsWith("models/") ? id : `models/${id}`;
}

/**
 * Parse path segment after /v1beta/models/, e.g.
 *   gemini-2.5-flash:generateContent
 *   models/gemini-2.5-flash:streamGenerateContent
 *   gemini-2.5-flash%3AgenerateContent
 */
export function parseGeminiModelAction(
  modelAction: string
): { modelId: string; action: GeminiModelAction } | null {
  const decoded = decodeURIComponent(modelAction.trim());
  const match =
    /^(?:models\/)?(.+):(generateContent|streamGenerateContent)$/.exec(
      decoded
    );
  if (!match) return null;
  const modelId = match[1]!.trim();
  if (!modelId) return null;
  return {
    modelId: normalizeGeminiModelId(modelId),
    action: match[2] as GeminiModelAction,
  };
}

function partsToText(
  parts: Array<{ text?: string }> | undefined
): string {
  if (!parts?.length) return "";
  const chunks: string[] = [];
  for (const part of parts) {
    if (typeof part.text === "string") chunks.push(part.text);
  }
  return chunks.join("");
}

function geminiRoleToChatRole(role: string | undefined): string {
  const normalized = (role ?? "user").trim().toLowerCase();
  if (normalized === "model" || normalized === "assistant") return "assistant";
  if (normalized === "system") return "system";
  return "user";
}

function systemInstructionToText(
  systemInstruction: GeminiGenerateContentRequest["systemInstruction"]
): string {
  if (!systemInstruction) return "";
  if (typeof systemInstruction === "string") return systemInstruction.trim();
  return partsToText(systemInstruction.parts).trim();
}

export function geminiContentsToMessages(
  body: GeminiGenerateContentRequest
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  const systemText = systemInstructionToText(body.systemInstruction);
  if (systemText) {
    messages.push({ role: "system", content: systemText });
  }

  for (const content of body.contents) {
    const text = partsToText(content.parts);
    if (!text.trim()) continue;
    messages.push({
      role: geminiRoleToChatRole(content.role),
      content: text,
    });
  }

  return messages;
}

export function geminiBodyToChatBody(
  body: GeminiGenerateContentRequest,
  modelId: string
): ChatCompletionRequestBody {
  const messages = geminiContentsToMessages(body);
  const temperature = body.generationConfig?.temperature;
  const maxTokens = body.generationConfig?.maxOutputTokens;

  return {
    model: modelId,
    messages,
    stream: false,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  };
}

function mapFinishReason(reason: unknown): string {
  if (typeof reason !== "string" || !reason) return "STOP";
  const lower = reason.toLowerCase();
  if (lower === "stop" || lower === "end_turn") return "STOP";
  if (lower === "length" || lower === "max_tokens") return "MAX_TOKENS";
  if (lower === "content_filter") return "SAFETY";
  return reason.toUpperCase();
}

export function chatCompletionResponseToGemini(
  chatResponse: Record<string, unknown>,
  modelId: string
): Record<string, unknown> {
  const text = extractAssistantTextFromChatResponse(chatResponse);
  const usageRaw = chatResponse.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
  const choices = Array.isArray(chatResponse.choices)
    ? chatResponse.choices
    : [];
  const first = choices[0] as { finish_reason?: string | null } | undefined;
  const finishReason = mapFinishReason(first?.finish_reason);
  const resolvedModel =
    typeof chatResponse.model === "string" && chatResponse.model.length > 0
      ? chatResponse.model
      : modelId;

  const promptTokenCount = usageRaw?.prompt_tokens ?? 0;
  const candidatesTokenCount = usageRaw?.completion_tokens ?? 0;
  const totalTokenCount =
    usageRaw?.total_tokens ?? promptTokenCount + candidatesTokenCount;

  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
          role: "model",
        },
        finishReason,
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount,
    },
    modelVersion: resolvedModel,
  };
}

/**
 * Synthesize Gemini SSE chunks from a completed chat response.
 * Clients request `?alt=sse` on streamGenerateContent.
 */
export function chatCompletionToGeminiSseBody(
  chatResponse: Record<string, unknown>,
  modelId: string
): string {
  const full = chatCompletionResponseToGemini(chatResponse, modelId);
  const text = extractAssistantTextFromChatResponse(chatResponse);
  const usageMetadata = full.usageMetadata;
  const finishReason =
    (full.candidates as Array<{ finishReason?: string }>)?.[0]?.finishReason ??
    "STOP";

  const chunks: string[] = [];

  if (text.length > 0) {
    chunks.push(
      `data: ${JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text }],
              role: "model",
            },
            index: 0,
          },
        ],
      })}\n\n`
    );
  }

  chunks.push(
    `data: ${JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: "" }],
            role: "model",
          },
          finishReason,
          index: 0,
        },
      ],
      usageMetadata,
    })}\n\n`
  );

  return chunks.join("");
}

export type GeminiListModel = {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
};

export function buildGeminiModelsList(
  catalogIds: string[]
): { models: GeminiListModel[] } {
  const ids = new Set<string>();
  for (const required of REQUIRED_GEMINI_MODEL_IDS) {
    ids.add(required);
  }
  for (const id of catalogIds) {
    if (id.startsWith("gemini-")) ids.add(id);
  }

  const models = [...ids]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      name: toGeminiModelName(id),
      displayName: id,
      supportedGenerationMethods: [
        "generateContent",
        "streamGenerateContent",
      ],
    }));

  return { models };
}
