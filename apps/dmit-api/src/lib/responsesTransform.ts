import { z } from "zod";

import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";
import {
  chatFinishReasonToResponsesIncompleteDetails,
  normalizeOpenAiFinishReason,
  normalizeOpenAiFinishReasonOnResponsesPayload,
} from "./openaiFinishReason.js";

/**
 * OpenAI Responses API request → chat completions conversion.
 *
 * Accepts common client shapes from Cherry Studio / OpenCat / OpenAI SDKs /
 * Hermes (codex_responses / openai-api):
 * - input: string
 * - input: message array (role/content, type:message, content parts)
 * - input: function_call / function_call_output items (Hermes tool resume)
 * - input: input_image parts (vision)
 * - tools: Responses flat `{type,name,parameters}` or chat `{type,function}`
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
    max_completion_tokens: z.number().int().positive().optional(),
    /** Accepted for OpenAI SDK compat; ignored (upstream always non-stream). */
    stream_options: z.unknown().optional(),
    instructions: z.string().optional(),
  })
  .passthrough();

export type ResponsesRequestBody = z.infer<typeof ResponsesRequestSchema>;

type ChatMessage = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

/** Multimodal content parts for chat (text + image_url). */
function normalizeChatContentParts(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    const text = normalizeMessageContent(content);
    return text;
  }

  const parts: Array<Record<string, unknown>> = [];
  for (const item of content) {
    if (typeof item === "string") {
      if (item) parts.push({ type: "text", text: item });
      continue;
    }
    const part = asRecord(item);
    if (!part) continue;
    const type = typeof part.type === "string" ? part.type : "";
    if (
      type === "input_text" ||
      type === "output_text" ||
      type === "text"
    ) {
      if (typeof part.text === "string") {
        parts.push({ type: "text", text: part.text });
      }
      continue;
    }
    if (type === "input_image" || type === "image_url") {
      const imageUrl =
        typeof part.image_url === "string"
          ? part.image_url
          : asRecord(part.image_url)?.url;
      if (typeof imageUrl === "string" && imageUrl.trim()) {
        parts.push({
          type: "image_url",
          image_url: { url: imageUrl.trim() },
        });
      }
      continue;
    }
  }

  if (parts.length === 0) return "";
  if (parts.every((p) => p.type === "text")) {
    return parts.map((p) => String(p.text ?? "")).join("");
  }
  return parts;
}

function argumentsToString(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "{}";
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "{}";
    }
  }
  if (value == null) return "{}";
  return String(value);
}

function toolOutputToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return normalizeMessageContent(value);
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value == null ? "" : String(value);
}

/**
 * Convert Hermes/OpenAI Responses flat tools → chat.completions tools.
 * Already-nested chat tools pass through unchanged.
 */
export function responsesToolsToChatTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return tools;
  const out: Array<Record<string, unknown>> = [];
  for (const item of tools) {
    const row = asRecord(item);
    if (!row) continue;
    const nested = asRecord(row.function);
    if (nested && typeof nested.name === "string" && nested.name.trim()) {
      out.push({
        type: "function",
        function: {
          name: nested.name.trim(),
          ...(typeof nested.description === "string"
            ? { description: nested.description }
            : {}),
          ...(nested.parameters !== undefined
            ? { parameters: nested.parameters }
            : { parameters: { type: "object", properties: {} } }),
        },
      });
      continue;
    }
    if (typeof row.name === "string" && row.name.trim()) {
      out.push({
        type: "function",
        function: {
          name: row.name.trim(),
          ...(typeof row.description === "string"
            ? { description: row.description }
            : {}),
          ...(row.parameters !== undefined
            ? { parameters: row.parameters }
            : { parameters: { type: "object", properties: {} } }),
          ...(typeof row.strict === "boolean" ? { strict: row.strict } : {}),
        },
      });
    }
  }
  return out.length > 0 ? out : tools;
}

function inputItemToMessages(item: unknown): ChatMessage[] {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? [{ role: "user", content: text }] : [];
  }

  const obj = asRecord(item);
  if (!obj) return [];

  const type = typeof obj.type === "string" ? obj.type : null;

  if (type === "function_call") {
    const callId =
      typeof obj.call_id === "string" && obj.call_id.trim()
        ? obj.call_id.trim()
        : typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : `call_${Math.random().toString(16).slice(2, 10)}`;
    const name =
      typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "";
    if (!name) return [];
    return [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: callId,
            type: "function",
            function: {
              name,
              arguments: argumentsToString(obj.arguments),
            },
          },
        ],
      },
    ];
  }

  if (type === "function_call_output") {
    const callId =
      typeof obj.call_id === "string" && obj.call_id.trim()
        ? obj.call_id.trim()
        : "";
    if (!callId) return [];
    return [
      {
        role: "tool",
        tool_call_id: callId,
        content: toolOutputToString(obj.output),
      },
    ];
  }

  if (
    type === "input_text" ||
    type === "output_text" ||
    type === "text"
  ) {
    const text = typeof obj.text === "string" ? obj.text : "";
    return text ? [{ role: "user", content: text }] : [];
  }

  if (type === "input_image" || type === "image_url") {
    const content = normalizeChatContentParts([obj]);
    if (
      (typeof content === "string" && !content.trim()) ||
      (Array.isArray(content) && content.length === 0)
    ) {
      return [];
    }
    return [{ role: "user", content }];
  }

  // Message-like: { type?: "message", role?, content? }
  const role =
    typeof obj.role === "string" && obj.role.trim()
      ? obj.role.trim()
      : "user";
  const content = normalizeChatContentParts(
    obj.content !== undefined ? obj.content : obj.text
  );
  if (typeof content === "string" && !content.trim()) return [];
  if (Array.isArray(content) && content.length === 0) return [];
  return [{ role, content }];
}

export function responsesInputToMessages(
  input: string | unknown[] | Record<string, unknown>
): ChatMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) {
    const single = inputItemToMessages(input);
    return single.length > 0 ? single : [{ role: "user", content: "" }];
  }

  const messages: ChatMessage[] = [];
  for (const item of input) {
    messages.push(...inputItemToMessages(item));
  }

  if (messages.length === 0) {
    return [{ role: "user", content: "" }];
  }
  return messages;
}

/** True when converted chat messages carry no usable turn content. */
export function chatMessagesAreEmpty(messages: ChatMessage[]): boolean {
  if (!messages.length) return true;
  return messages.every((message) => {
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return false;
    }
    if (message.role === "tool" || message.role === "function") return false;
    if (typeof message.content === "string" && message.content.trim()) {
      return false;
    }
    if (Array.isArray(message.content) && message.content.length > 0) {
      return false;
    }
    return true;
  });
}

export function responsesBodyToChatBody(
  body: ResponsesRequestBody
): ChatCompletionRequestBody {
  const {
    input,
    max_output_tokens,
    max_tokens,
    max_completion_tokens,
    instructions,
    stream: _stream,
    stream_options: _streamOptions,
    tools,
    ...rest
  } = body as ResponsesRequestBody & { tools?: unknown };

  const messages = responsesInputToMessages(input);
  if (typeof instructions === "string" && instructions.trim()) {
    messages.unshift({ role: "system", content: instructions.trim() });
  }

  const resolvedMaxTokens =
    max_tokens ?? max_output_tokens ?? max_completion_tokens;

  const chatTools =
    tools !== undefined ? responsesToolsToChatTools(tools) : undefined;

  return {
    ...rest,
    messages,
    ...(chatTools !== undefined ? { tools: chatTools } : {}),
    ...(resolvedMaxTokens !== undefined
      ? { max_tokens: resolvedMaxTokens }
      : {}),
  } as ChatCompletionRequestBody;
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

type ChatToolCall = {
  id?: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown };
  name?: unknown;
  arguments?: unknown;
};

/** Extract chat tool_calls unchanged (name/arguments/id). */
export function extractChatToolCalls(
  chatResponse: Record<string, unknown>
): Array<{
  id: string;
  name: string;
  arguments: string;
}> {
  const choices = Array.isArray(chatResponse.choices)
    ? chatResponse.choices
    : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first?.message);
  const raw = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const out: Array<{ id: string; name: string; arguments: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const tc = raw[i] as ChatToolCall;
    const fn = tc?.function ?? {};
    const name =
      typeof fn.name === "string" && fn.name.trim()
        ? fn.name.trim()
        : typeof tc.name === "string" && tc.name.trim()
          ? tc.name.trim()
          : "";
    if (!name) continue;
    const id =
      typeof tc.id === "string" && tc.id.trim()
        ? tc.id.trim()
        : `call_${i}_${name}`;
    const args =
      typeof fn.arguments === "string"
        ? fn.arguments
        : typeof tc.arguments === "string"
          ? tc.arguments
          : argumentsToString(fn.arguments ?? tc.arguments);
    out.push({ id, name, arguments: args || "{}" });
  }
  return out;
}

export function chatCompletionResponseToResponses(
  chatResponse: Record<string, unknown>,
  requestId: string
): Record<string, unknown> {
  const outputText = extractAssistantTextFromChatResponse(chatResponse);
  const toolCalls = extractChatToolCalls(chatResponse);
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

  const choices = Array.isArray(chatResponse.choices)
    ? chatResponse.choices
    : [];
  const firstChoice =
    choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : null;
  const wireFinishReason =
    normalizeOpenAiFinishReason(firstChoice?.finish_reason, {
      allowNull: false,
      route: "/v1/responses",
    }) ?? "stop";

  const hasTools = toolCalls.length > 0;
  const finishReason =
    wireFinishReason === "length" || wireFinishReason === "content_filter"
      ? wireFinishReason
      : hasTools ||
          wireFinishReason === "tool_calls" ||
          wireFinishReason === "function_call"
        ? "tool_calls"
        : "stop";
  const incompleteDetails =
    chatFinishReasonToResponsesIncompleteDetails(finishReason);
  const status = incompleteDetails ? "incomplete" : "completed";

  const output: Array<Record<string, unknown>> = [];
  if (outputText) {
    output.push({
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: outputText,
        },
      ],
    });
  }
  for (const tc of toolCalls) {
    output.push({
      type: "function_call",
      id: tc.id.startsWith("fc_") ? tc.id : `fc_${tc.id}`,
      call_id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
      status: "completed",
    });
  }
  if (output.length === 0) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "" }],
    });
  }

  return normalizeOpenAiFinishReasonOnResponsesPayload(
    {
      id: `resp_${resolvedRequestId}`,
      object: "response",
      created_at: createdAt,
      status,
      model,
      output,
      output_text: outputText,
      usage: {
        input_tokens: usageRaw?.prompt_tokens ?? 0,
        output_tokens: usageRaw?.completion_tokens ?? 0,
        total_tokens: usageRaw?.total_tokens ?? 0,
      },
      incomplete_details: incompleteDetails,
      finish_reason: finishReason,
      request_id: resolvedRequestId,
      credits_charged: creditsCharged,
      tokfai: {
        request_id: tokfai.request_id ?? resolvedRequestId,
        credits_charged: tokfai.credits_charged ?? creditsCharged,
        requested_model: tokfai.requested_model,
        resolved_model: tokfai.resolved_model ?? model,
        ...(typeof tokfai.routing_strategy === "string"
          ? { routing_strategy: tokfai.routing_strategy }
          : {}),
        ...(Array.isArray(tokfai.attempted_models)
          ? { attempted_models: tokfai.attempted_models }
          : {}),
        ...(typeof tokfai.fallback_attempts === "number"
          ? { fallback_attempts: tokfai.fallback_attempts }
          : {}),
        ...(typeof tokfai.latency_ms === "number"
          ? { latency_ms: tokfai.latency_ms }
          : {}),
        ...(typeof tokfai.billing_status === "string"
          ? { billing_status: tokfai.billing_status }
          : {}),
        ...(hasTools
          ? {
              hermes_function_calls: toolCalls.length,
              upstream_returned_tool_calls: true,
            }
          : {}),
      },
    },
    { route: "/v1/responses" }
  );
}

export function isResponsesFormatResponse(
  snapshot: Record<string, unknown>
): boolean {
  return snapshot.object === "response";
}
