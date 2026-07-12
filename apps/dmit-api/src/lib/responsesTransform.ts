import { z } from "zod";

import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";

/**
 * OpenAI Responses API request → chat completions conversion (minimal MVP).
 *
 * Accepts common client shapes from Cherry Studio / OpenCat / OpenAI SDKs:
 * - input: string
 * - input: message array (role/content, type:message, content parts)
 * - input: array of strings or input_text parts
 * - max_output_tokens (Responses) and max_tokens (chat-style)
 */

export const ResponsesRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    input: z.union([z.string(), z.array(z.unknown()).min(1), z.record(z.unknown())]),
    stream: z.boolean().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    instructions: z.string().optional(),
  })
  .passthrough();

export type ResponsesRequestBody = z.infer<typeof ResponsesRequestSchema>;

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const part = item as Record<string, unknown>;
        if (typeof part.text === "string") {
          parts.push(part.text);
          continue;
        }
        if (typeof part.content === "string") {
          parts.push(part.content);
        }
      }
    }
    return parts.join("");
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

function inputItemToMessage(
  item: unknown
): { role: string; content: string } | null {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { role: "user", content: text } : null;
  }

  if (!item || typeof item !== "object") return null;

  const obj = item as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : null;

  // Top-level content part: { type: "input_text", text: "..." }
  if (
    type === "input_text" ||
    type === "output_text" ||
    type === "text"
  ) {
    const text = typeof obj.text === "string" ? obj.text : "";
    return text ? { role: "user", content: text } : null;
  }

  // Message-like: { type?: "message", role?, content? }
  const role =
    typeof obj.role === "string" && obj.role.trim()
      ? obj.role.trim()
      : "user";
  const content = normalizeMessageContent(
    obj.content !== undefined ? obj.content : obj.text
  );
  if (!content) return null;
  return { role, content };
}

export function responsesInputToMessages(
  input: string | unknown[] | Record<string, unknown>
): Array<{ role: string; content: string }> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    const single = inputItemToMessage(input);
    return single ? [single] : [{ role: "user", content: "" }];
  }

  const messages: Array<{ role: string; content: string }> = [];
  for (const item of input) {
    const message = inputItemToMessage(item);
    if (message) messages.push(message);
  }

  if (messages.length === 0) {
    return [{ role: "user", content: "" }];
  }
  return messages;
}

export function responsesBodyToChatBody(
  body: ResponsesRequestBody
): ChatCompletionRequestBody {
  const {
    input,
    max_output_tokens,
    max_tokens,
    instructions,
    stream: _stream,
    ...rest
  } = body;

  const messages = responsesInputToMessages(input);
  if (typeof instructions === "string" && instructions.trim()) {
    messages.unshift({ role: "system", content: instructions.trim() });
  }

  const resolvedMaxTokens = max_tokens ?? max_output_tokens;

  return {
    ...rest,
    messages,
    ...(resolvedMaxTokens !== undefined
      ? { max_tokens: resolvedMaxTokens }
      : {}),
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
