import { z } from "zod";

import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";

const InputTextPartSchema = z
  .object({
    type: z.literal("input_text").optional(),
    text: z.string(),
  })
  .passthrough();

const ResponsesInputMessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.union([
      z.string(),
      z.array(z.union([InputTextPartSchema, z.record(z.unknown())])),
      z.record(z.unknown()),
    ]),
  })
  .passthrough();

export const ResponsesRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    input: z.union([z.string(), z.array(ResponsesInputMessageSchema).min(1)]),
    stream: z.boolean().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
  })
  .passthrough();

export type ResponsesRequestBody = z.infer<typeof ResponsesRequestSchema>;

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        const part = item as Record<string, unknown>;
        if (typeof part.text === "string") {
          parts.push(part.text);
        }
      }
    }
    return parts.join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

export function responsesInputToMessages(
  input: string | z.infer<typeof ResponsesInputMessageSchema>[]
): Array<{ role: string; content: string }> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  return input.map((item) => ({
    role: typeof item.role === "string" && item.role ? item.role : "user",
    content: normalizeMessageContent(item.content),
  }));
}

export function responsesBodyToChatBody(
  body: ResponsesRequestBody
): ChatCompletionRequestBody {
  const { input, ...rest } = body;
  return {
    ...rest,
    messages: responsesInputToMessages(input),
  };
}

export function extractAssistantTextFromChatResponse(
  chatResponse: Record<string, unknown>
): string {
  const choices = chatResponse.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        const part = item as Record<string, unknown>;
        if (typeof part.text === "string") parts.push(part.text);
      }
    }
    return parts.join("");
  }
  return "";
}

export function chatCompletionResponseToResponses(
  chatResponse: Record<string, unknown>,
  requestId: string
): Record<string, unknown> {
  const outputText = extractAssistantTextFromChatResponse(chatResponse);
  const model =
    typeof chatResponse.model === "string" ? chatResponse.model : "";
  const usageRaw = chatResponse.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
  const tokfai =
    (chatResponse.tokfai as Record<string, unknown> | undefined) ?? {};
  const creditsCharged =
    chatResponse.credits_charged ?? tokfai.credits_charged ?? 0;
  const createdAt =
    typeof chatResponse.created === "number"
      ? chatResponse.created
      : Math.floor(Date.now() / 1000);

  const resolvedRequestId =
    typeof tokfai.request_id === "string"
      ? tokfai.request_id
      : typeof chatResponse.request_id === "string"
        ? chatResponse.request_id
        : requestId;

  return {
    id: `resp_${resolvedRequestId}`,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: outputText,
          },
        ],
      },
    ],
    output_text: outputText,
    usage: {
      input_tokens: usageRaw?.prompt_tokens ?? 0,
      output_tokens: usageRaw?.completion_tokens ?? 0,
      total_tokens: usageRaw?.total_tokens ?? 0,
    },
    request_id: resolvedRequestId,
    credits_charged: creditsCharged,
    tokfai: {
      request_id: tokfai.request_id ?? resolvedRequestId,
      credits_charged: tokfai.credits_charged ?? creditsCharged,
      requested_model: tokfai.requested_model,
      resolved_model: tokfai.resolved_model ?? model,
    },
  };
}

export function isResponsesFormatResponse(
  snapshot: Record<string, unknown>
): boolean {
  return snapshot.object === "response";
}
