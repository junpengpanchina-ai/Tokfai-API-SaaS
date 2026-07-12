/**
 * Convert a completed OpenAI Responses JSON body into OpenAI Responses API
 * SSE events ending with `data: [DONE]`.
 *
 * Upstream chat is always non-streaming; we synthesize the Responses event
 * sequence so clients that send stream=true (Cherry Studio OpenAI Provider)
 * receive text/event-stream with non-empty output_text deltas.
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

/**
 * Build the full Responses SSE body from a completed response object.
 * Emits one non-empty output_text.delta (full text in a single chunk).
 */
export function responsesToSseBody(
  response: Record<string, unknown>
): string {
  const responseId =
    typeof response.id === "string" && response.id.length > 0
      ? response.id
      : `resp_${Date.now()}`;
  const model =
    typeof response.model === "string" && response.model.length > 0
      ? response.model
      : "unknown";
  const messageId = `msg_${responseId.replace(/^resp_/, "")}`;
  // Cherry requires a non-empty delta; fall back only if upstream text is blank.
  const rawText = extractOutputText(response);
  const outputText = rawText.length > 0 ? rawText : " ";

  const inProgressResponse = {
    id: responseId,
    object: "response",
    status: "in_progress",
    model,
  };

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

  chunks.push(
    sseEvent("response.created", {
      type: "response.created",
      response: inProgressResponse,
    })
  );

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
