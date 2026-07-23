/**
 * Convert a completed OpenAI ChatCompletion JSON body into OpenAI-compatible
 * SSE chunks ending with `data: [DONE]`.
 *
 * Upstream is called with stream:false; we synthesize SSE so clients that
 * default to stream=true (Cherry Studio, etc.) still connect successfully.
 *
 * For stream=true main path, the role chunk is flushed early (before upstream)
 * via chatCompletionRoleSseFrame(); remaining events use
 * chatCompletionSseBodyAfterRole().
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

/**
 * First SSE frame for stream=true — flushed immediately after prechecks.
 * Minimal OpenAI-compatible role chunk (no upstream wait).
 */
export function chatCompletionRoleSseFrame(): string {
  return sseLine({
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null,
      },
    ],
  });
}

function chatCompletionSseMeta(response: Record<string, unknown>): {
  id: string;
  created: number;
  model: string;
} {
  return {
    id:
      typeof response.id === "string" && response.id.length > 0
        ? response.id
        : `chatcmpl_${Date.now()}`,
    created:
      typeof response.created === "number" && Number.isFinite(response.created)
        ? response.created
        : Math.floor(Date.now() / 1000),
    model:
      typeof response.model === "string" && response.model.length > 0
        ? response.model
        : "unknown",
  };
}

/**
 * Remaining SSE events after the early role frame (content + finish + DONE).
 */
export function chatCompletionSseBodyAfterRole(
  response: Record<string, unknown>
): string {
  const { id, created, model } = chatCompletionSseMeta(response);
  const content = extractAssistantContent(response);
  const finishReason = extractFinishReason(response);

  const base = {
    id,
    object: "chat.completion.chunk" as const,
    created,
    model,
  };

  const chunks: string[] = [];

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

/** Build the full SSE body (role + content + finish + [DONE]). */
export function chatCompletionToSseBody(
  response: Record<string, unknown>
): string {
  return chatCompletionRoleSseFrame() + chatCompletionSseBodyAfterRole(response);
}
