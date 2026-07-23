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
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
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

function responsesSseIds(response: Record<string, unknown>): {
  responseId: string;
  model: string;
  messageId: string;
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
  return { responseId, model, messageId };
}

/**
 * First SSE frame for /v1/responses stream=true — flushed immediately after
 * prechecks. Minimal legal `response.created` start event.
 */
export function responsesCreatedSseFrame(args?: {
  responseId?: string;
  model?: string;
}): string {
  const responseId =
    typeof args?.responseId === "string" && args.responseId.length > 0
      ? args.responseId
      : `resp_${Date.now()}`;
  const model =
    typeof args?.model === "string" && args.model.length > 0
      ? args.model
      : "unknown";

  return sseEvent("response.created", {
    type: "response.created",
    response: {
      id: responseId,
      object: "response",
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
  const { responseId, model, messageId } = responsesSseIds(response);
  // Cherry requires a non-empty delta; fall back only if upstream text is blank.
  const rawText = extractOutputText(response);
  const outputText = rawText.length > 0 ? rawText : " ";

  const completedItem = {
    id: messageId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: outputText }],
  };

  const completedResponse = {
    id: responseId,
    object: "response",
    status: "completed",
    model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
    output_text: outputText,
  };

  const chunks: string[] = [];

  if (!opts?.skipCreated) {
    chunks.push(
      responsesCreatedSseFrame({ responseId, model })
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

  chunks.push(
    sseEvent("response.completed", {
      type: "response.completed",
      response: completedResponse,
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
