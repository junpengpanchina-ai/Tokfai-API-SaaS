/**
 * Convert a completed OpenAI ChatCompletion JSON body into OpenAI-compatible
 * SSE chunks ending with `data: [DONE]`.
 *
 * Upstream is called with stream:false; we synthesize SSE so clients that
 * default to stream=true (Cherry Studio, Cursor, etc.) still connect successfully.
 *
 * P970: when the completion includes message.tool_calls, emit OpenAI-compatible
 * delta.tool_calls chunks and finish_reason=tool_calls.
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
  if (content === null || content === undefined) return "";
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

function extractToolCalls(response: Record<string, unknown>): unknown[] | null {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = asRecord(choices[0]);
  if (!first) return null;
  const message = asRecord(first.message);
  if (!message) return null;
  const toolCalls = message.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  return toolCalls;
}

function extractFinishReason(response: Record<string, unknown>): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const first = asRecord(choices[0]);
  const reason = first?.finish_reason;
  if (typeof reason === "string" && reason.length > 0) return reason;
  if (extractToolCalls(response)) return "tool_calls";
  return "stop";
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
 * Remaining SSE events after the early role frame
 * (content and/or tool_calls + finish + DONE).
 */
export function chatCompletionSseBodyAfterRole(
  response: Record<string, unknown>
): string {
  const { id, created, model } = chatCompletionSseMeta(response);
  const content = extractAssistantContent(response);
  const toolCalls = extractToolCalls(response);
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

  // OpenAI-compatible streaming tool_calls: one delta with the full array
  // (assembled from non-stream upstream). Clients that merge by index still work.
  if (toolCalls) {
    const deltaToolCalls = toolCalls.map((tc, index) => {
      const row = asRecord(tc) ?? {};
      const fn = asRecord(row.function);
      return {
        index: typeof row.index === "number" ? row.index : index,
        id: typeof row.id === "string" ? row.id : `call_${index}`,
        type: typeof row.type === "string" ? row.type : "function",
        function: {
          name: typeof fn?.name === "string" ? fn.name : "",
          arguments: typeof fn?.arguments === "string" ? fn.arguments : "",
        },
      };
    });
    chunks.push(
      sseLine({
        ...base,
        choices: [
          {
            index: 0,
            delta: { tool_calls: deltaToolCalls },
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

/** Build the full SSE body (role + content/tool_calls + finish + [DONE]). */
export function chatCompletionToSseBody(
  response: Record<string, unknown>
): string {
  return chatCompletionRoleSseFrame() + chatCompletionSseBodyAfterRole(response);
}
