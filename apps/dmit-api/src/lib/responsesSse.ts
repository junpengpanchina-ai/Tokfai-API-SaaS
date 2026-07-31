/**
 * Convert a completed OpenAI Responses JSON body into OpenAI Responses API
 * SSE events ending with `data: [DONE]`.
 *
 * Upstream chat is always non-streaming; we synthesize the Responses event
 * sequence so clients that send stream=true (Cherry Studio OpenAI Provider)
 * receive text/event-stream with non-empty output_text deltas.
 *
 * For stream=true main path, response.created is flushed early (before upstream)
 * via responsesCreatedSseFrame(); remaining events use
 * responsesSseBodyAfterCreated().
 *
 * AI SDK (@ai-sdk/openai Responses): finishReason defaults to "other" until a
 * valid `response.completed` / `response.incomplete` chunk is parsed. That
 * chunk schema requires `response.usage` — omitting usage leaves finishReason
 * stuck on "other" (Cherry Studio AI_FinishReasonError).
 */

import {
  chatFinishReasonToResponsesIncompleteDetails,
  normalizeOpenAiFinishReason,
  normalizeOpenAiFinishReasonOnResponsesSsePayload,
} from "./openaiFinishReason.js";

const RESPONSES_ROUTE = "/v1/responses";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function sseEvent(event: string, payload: unknown): string {
  const safe = normalizeOpenAiFinishReasonOnResponsesSsePayload(payload, {
    route: RESPONSES_ROUTE,
  });
  return `event: ${event}\ndata: ${JSON.stringify(safe)}\n\n`;
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const row = asRecord(item);
    if (!row) continue;
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      const partRow = asRecord(part);
      if (!partRow) continue;
      if (typeof partRow.text === "string") parts.push(partRow.text);
    }
  }
  return parts.join("");
}

function extractResponsesUsage(response: Record<string, unknown>): {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: unknown;
  output_tokens_details?: unknown;
} {
  const usage = asRecord(response.usage);
  const inputTokens =
    typeof usage?.input_tokens === "number" && Number.isFinite(usage.input_tokens)
      ? usage.input_tokens
      : 0;
  const outputTokens =
    typeof usage?.output_tokens === "number" && Number.isFinite(usage.output_tokens)
      ? usage.output_tokens
      : 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    ...(usage && "input_tokens_details" in usage
      ? { input_tokens_details: usage.input_tokens_details }
      : {}),
    ...(usage && "output_tokens_details" in usage
      ? { output_tokens_details: usage.output_tokens_details }
      : {}),
  };
}

function extractWireFinishReason(response: Record<string, unknown>): string {
  const normalized = normalizeOpenAiFinishReason(response.finish_reason, {
    allowNull: false,
    route: RESPONSES_ROUTE,
  });
  if (normalized === "length" || normalized === "content_filter") {
    return normalized;
  }
  // tool_calls / function_call / stop / other → stop for text Responses wire
  return "stop";
}

function responsesSseIds(response: Record<string, unknown>): {
  responseId: string;
  model: string;
  messageId: string;
  createdAt: number;
} {
  const responseId =
    typeof response.id === "string" && response.id.length > 0
      ? response.id
      : `resp_${Date.now()}`;
  const model =
    typeof response.model === "string" && response.model.length > 0
      ? response.model
      : "unknown";
  const messageId = `msg_${responseId.replace(/^resp_/, "")}`;
  const createdAt =
    typeof response.created_at === "number" && Number.isFinite(response.created_at)
      ? response.created_at
      : Math.floor(Date.now() / 1000);
  return { responseId, model, messageId, createdAt };
}

/**
 * First SSE frame for /v1/responses stream=true — flushed immediately after
 * prechecks. Minimal legal `response.created` start event.
 */
export function responsesCreatedSseFrame(args?: {
  responseId?: string;
  model?: string;
  createdAt?: number;
}): string {
  const responseId =
    typeof args?.responseId === "string" && args.responseId.length > 0
      ? args.responseId
      : `resp_${Date.now()}`;
  const model =
    typeof args?.model === "string" && args.model.length > 0
      ? args.model
      : "unknown";
  const createdAt =
    typeof args?.createdAt === "number" && Number.isFinite(args.createdAt)
      ? args.createdAt
      : Math.floor(Date.now() / 1000);

  return sseEvent("response.created", {
    type: "response.created",
    response: {
      id: responseId,
      object: "response",
      created_at: createdAt,
      status: "in_progress",
      model,
    },
  });
}

/**
 * Remaining Responses SSE events after the early response.created frame.
 */
export function responsesSseBodyAfterCreated(
  response: Record<string, unknown>,
  opts?: { skipCreated?: boolean }
): string {
  const { responseId, model, messageId, createdAt } = responsesSseIds(response);
  // Cherry requires a non-empty delta; fall back only if upstream text is blank.
  const rawText = extractOutputText(response);
  const outputText = rawText.length > 0 ? rawText : " ";
  const usage = extractResponsesUsage(response);
  const finishReason = extractWireFinishReason(response);
  const incompleteDetails =
    chatFinishReasonToResponsesIncompleteDetails(finishReason);
  const status = incompleteDetails ? "incomplete" : "completed";

  const completedItem = {
    id: messageId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: outputText }],
  };

  // AI SDK requires `usage` on response.completed / response.incomplete or the
  // chunk is dropped and finishReason stays default "other".
  const finishedResponse = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    status,
    model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
    output_text: outputText,
    usage,
    incomplete_details: incompleteDetails,
    finish_reason: finishReason,
  };

  const chunks: string[] = [];

  if (!opts?.skipCreated) {
    chunks.push(
      responsesCreatedSseFrame({ responseId, model, createdAt })
    );
  }

  chunks.push(
    sseEvent("response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: messageId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    })
  );

  chunks.push(
    sseEvent("response.content_part.added", {
      type: "response.content_part.added",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "" },
    })
  );

  chunks.push(
    sseEvent("response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      delta: outputText,
    })
  );

  chunks.push(
    sseEvent("response.output_text.done", {
      type: "response.output_text.done",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    })
  );

  chunks.push(
    sseEvent("response.content_part.done", {
      type: "response.content_part.done",
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: outputText },
    })
  );

  chunks.push(
    sseEvent("response.output_item.done", {
      type: "response.output_item.done",
      output_index: 0,
      item: completedItem,
    })
  );

  const finishedType =
    status === "incomplete" ? "response.incomplete" : "response.completed";
  chunks.push(
    sseEvent(finishedType, {
      type: finishedType,
      response: finishedResponse,
    })
  );

  chunks.push("data: [DONE]\n\n");
  return chunks.join("");
}

/**
 * Build the full Responses SSE body from a completed response object.
 * Emits one non-empty output_text.delta (full text in a single chunk).
 */
export function responsesToSseBody(
  response: Record<string, unknown>
): string {
  return responsesSseBodyAfterCreated(response, { skipCreated: false });
}
