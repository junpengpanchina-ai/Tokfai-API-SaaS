import {
  normalizeFinishReason,
  normalizeOpenAiFinishReason,
  normalizeOpenAiFinishReasonOnSseChunk,
} from "./openaiFinishReason.js";

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
 *
 * Final client wire (sseLine / earlySseStream enqueue): never emit
 * finish_reason other|unknown|null — AI SDK defaults missing finish → "other".
 */

const SSE_ROUTE = "/v1/chat/completions";

const OPENAI_WIRE_FINISH = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Last-mile outbound adapter for a chat.completion.chunk payload.
 * - Terminal (empty/missing delta): finish_reason = normalizeFinishReason(...)
 *   → always stop|length|content_filter|tool_calls|function_call
 * - Mid-stream (non-empty delta): omit finish_reason (never null on the wire)
 */
export function applyOutboundChatCompletionFinishReasons(
  payload: unknown
): unknown {
  const row = asRecord(payload);
  if (!row || !Array.isArray(row.choices)) return payload;

  const nextChoices = row.choices.map((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const c = { ...(choice as Record<string, unknown>) };
    const delta = asRecord(c.delta);
    const midStream = delta !== null && Object.keys(delta).length > 0;

    if (midStream) {
      // OpenAI mid-stream uses null; Cherry/AI SDK treat stream-end-without
      // a string finish as "other". Omit the field instead of sending null.
      delete c.finish_reason;
      return c;
    }

    // User contract: finish_reason = normalizeFinishReason(finish_reason)
    const normalized = normalizeFinishReason(c.finish_reason, {
      allowNull: false,
      route: SSE_ROUTE,
    });
    const wire =
      typeof normalized === "string" && OPENAI_WIRE_FINISH.has(normalized)
        ? normalized
        : "stop";
    c.finish_reason = wire;
    return c;
  });

  return { ...row, choices: nextChoices };
}

/**
 * Rewrite every `data: {...}` JSON line's choices[].finish_reason before
 * controller.enqueue / buffered Response body hits the client.
 */
export function sanitizeChatCompletionSseOutboundText(text: string): string {
  if (!text.includes('"choices"')) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) {
      out.push(line);
      continue;
    }
    const raw = line.startsWith("data: ")
      ? line.slice(6)
      : line.slice(5).trimStart();
    if (!raw || raw === "[DONE]" || raw[0] !== "{") {
      out.push(line);
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!asRecord(parsed)?.choices) {
        out.push(line);
        continue;
      }
      const safe = applyOutboundChatCompletionFinishReasons(parsed);
      out.push(`data: ${JSON.stringify(safe)}`);
    } catch {
      out.push(line);
    }
  }
  return out.join("\n");
}

/** True when SSE text already contains a wire-legal terminal finish_reason. */
export function sseTextHasOpenAiWireFinish(text: string): boolean {
  return /"finish_reason"\s*:\s*"(stop|length|content_filter|tool_calls|function_call)"/i.test(
    text
  );
}

/** Emergency terminal frame if the stream would otherwise close without finish. */
export function chatCompletionEmergencyStopSseFrame(): string {
  return sseLine({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "unknown",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  });
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
  if (extractToolCalls(response)) {
    // Prefer tool_calls when message carries tools, even if upstream said other.
    const normalized = normalizeOpenAiFinishReason(reason ?? "tool_calls", {
      allowNull: false,
      route: SSE_ROUTE,
    });
    if (normalized === "tool_calls" || normalized === "function_call") {
      return normalized;
    }
    return "tool_calls";
  }
  const normalized = normalizeOpenAiFinishReason(reason, {
    allowNull: false,
    route: SSE_ROUTE,
  });
  // Final SSE chunk: never null / other / undefined (Cherry → AI_FinishReasonError).
  if (
    normalized === "stop" ||
    normalized === "length" ||
    normalized === "content_filter"
  ) {
    return normalized;
  }
  return "stop";
}

/**
 * Last-exit wire serialize before bytes leave this module.
 * controller.enqueue (earlySseStream) also re-sanitizes for defense in depth.
 */
function sseLine(payload: unknown): string {
  const normalized = normalizeOpenAiFinishReasonOnSseChunk(payload, {
    route: SSE_ROUTE,
  });
  const safe = applyOutboundChatCompletionFinishReasons(normalized);
  return `data: ${JSON.stringify(safe)}\n\n`;
}

/**
 * First SSE frame for stream=true — flushed immediately after prechecks.
 * Minimal OpenAI-compatible role chunk (no upstream wait).
 * Mid-stream: no finish_reason key (never null on the wire).
 */
export function chatCompletionRoleSseFrame(): string {
  // P1031 — OpenAI-compatible role opener without empty content (Cursor Agent
  // treats content deltas as prose; tool_calls path must not start with "").
  return sseLine({
    choices: [
      {
        index: 0,
        delta: { role: "assistant" },
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

  // P1031 — tool_calls path must not also emit ordinary content deltas.
  if (!toolCalls && content.length > 0) {
    chunks.push(
      sseLine({
        ...base,
        choices: [
          {
            index: 0,
            delta: { content },
            // mid-stream: omit finish_reason (sseLine strips null)
          },
        ],
      })
    );
  }

  // OpenAI-compatible streaming tool_calls (from non-stream upstream assemble):
  // 1) init frame per index: id + type + name + arguments:""
  // 2) arguments frame per index: arguments JSON string (never as object)
  // Clients that concatenate by index reconstruct the full call.
  if (toolCalls) {
    const prepared = toolCalls.map((tc, index) => {
      const row = asRecord(tc) ?? {};
      const fn = asRecord(row.function);
      const idx = typeof row.index === "number" ? row.index : index;
      const id = typeof row.id === "string" ? row.id : `call_${index}`;
      const type = typeof row.type === "string" ? row.type : "function";
      const name = typeof fn?.name === "string" ? fn.name : "";
      const args =
        typeof fn?.arguments === "string"
          ? fn.arguments
          : fn?.arguments == null
            ? ""
            : "";
      return { index: idx, id, type, name, args };
    });

    for (const tc of prepared) {
      chunks.push(
        sseLine({
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: tc.index,
                    id: tc.id,
                    type: tc.type,
                    function: { name: tc.name, arguments: "" },
                  },
                ],
              },
            },
          ],
        })
      );
    }

    for (const tc of prepared) {
      if (!tc.args) continue;
      chunks.push(
        sseLine({
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: tc.index,
                    function: { arguments: tc.args },
                  },
                ],
              },
            },
          ],
        })
      );
    }
  }

  // Terminal chunk — finish_reason always a wire-legal string after sseLine.
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

/** Safe metadata for cursor_tool_sse_completed (no argument contents). */
export function summarizeChatCompletionSseEmission(
  response: Record<string, unknown>
): {
  emittedToolCallCount: number;
  emittedToolIndexes: number[];
  emittedFinishReason: string;
  doneFrameEmitted: true;
} {
  const toolCalls = extractToolCalls(response);
  const indexes: number[] = [];
  if (toolCalls) {
    toolCalls.forEach((tc, index) => {
      const row = asRecord(tc);
      indexes.push(
        typeof row?.index === "number" ? (row.index as number) : index
      );
    });
  }
  return {
    emittedToolCallCount: toolCalls?.length ?? 0,
    emittedToolIndexes: indexes,
    emittedFinishReason: extractFinishReason(response),
    doneFrameEmitted: true,
  };
}

/** Build the full SSE body (role + content/tool_calls + finish + [DONE]). */
export function chatCompletionToSseBody(
  response: Record<string, unknown>
): string {
  return chatCompletionRoleSseFrame() + chatCompletionSseBodyAfterRole(response);
}
