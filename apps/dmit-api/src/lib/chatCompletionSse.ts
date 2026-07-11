/**
 * Convert a completed OpenAI ChatCompletion JSON body into OpenAI-compatible
 * SSE chunks ending with `data: [DONE]`.
 *
 * Upstream is called with stream:false; we synthesize SSE so clients that
 * default to stream=true (Cherry Studio, etc.) still connect successfully.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function extractAssistantContent(response: Record<string, unknown>): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = asRecord(choices[0]);
  if (!first) return "";
  const message = asRecord(first.message);
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const row = asRecord(part);
        if (!row) return "";
        if (typeof row.text === "string") return row.text;
        if (typeof row.content === "string") return row.content;
        return "";
      })
      .join("");
  }
  return "";
}

function extractFinishReason(response: Record<string, unknown>): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = asRecord(choices[0]);
  const reason = first?.finish_reason;
  return typeof reason === "string" && reason.length > 0 ? reason : "stop";
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Build the full SSE body (multiple events + [DONE]). */
export function chatCompletionToSseBody(
  response: Record<string, unknown>
): string {
  const id =
    typeof response.id === "string" && response.id.length > 0
      ? response.id
      : `chatcmpl_${Date.now()}`;
  const created =
    typeof response.created === "number" && Number.isFinite(response.created)
      ? response.created
      : Math.floor(Date.now() / 1000);
  const model =
    typeof response.model === "string" && response.model.length > 0
      ? response.model
      : "unknown";
  const content = extractAssistantContent(response);
  const finishReason = extractFinishReason(response);

  const base = {
    id,
    object: "chat.completion.chunk" as const,
    created,
    model,
  };

  const chunks: string[] = [];

  chunks.push(
    sseLine({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    })
  );

  if (content.length > 0) {
    chunks.push(
      sseLine({
        ...base,
        choices: [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
          },
        ],
      })
    );
  }

  chunks.push(
    sseLine({
      ...base,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finishReason,
        },
      ],
    })
  );

  chunks.push("data: [DONE]\n\n");
  return chunks.join("");
}
