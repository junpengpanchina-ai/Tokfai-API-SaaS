/**
 * Assemble a standard OpenAI chat.completion JSON object from upstream
 * chat.completion.chunk SSE frames (data: … / data: [DONE]).
 *
 * Used only by the gemini-2.5-flash non-stream client path when upstream
 * stream=true is drained as a fallback — not Cherry / image / alias logic.
 */

export type AssembledChatCompletion = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: unknown[];
    };
    finish_reason: string | null;
    logprobs: null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mergeToolCalls(
  existing: unknown[] | undefined,
  deltaCalls: unknown
): unknown[] | undefined {
  if (!Array.isArray(deltaCalls) || deltaCalls.length === 0) {
    return existing;
  }
  const out = existing ? [...existing] : [];
  for (const raw of deltaCalls) {
    const call = asRecord(raw);
    if (!call) continue;
    const index =
      typeof call.index === "number" && Number.isFinite(call.index)
        ? Math.trunc(call.index)
        : out.length;
    const prev = asRecord(out[index]) ?? {};
    const prevFn = asRecord(prev.function) ?? {};
    const nextFn = asRecord(call.function) ?? {};
    const mergedFn = {
      ...prevFn,
      ...(typeof nextFn.name === "string" ? { name: nextFn.name } : {}),
      ...(typeof nextFn.arguments === "string"
        ? {
            arguments: `${typeof prevFn.arguments === "string" ? prevFn.arguments : ""}${nextFn.arguments}`,
          }
        : {}),
    };
    out[index] = {
      ...prev,
      ...call,
      function: mergedFn,
      index: undefined,
    };
    delete (out[index] as Record<string, unknown>).index;
  }
  return out;
}

/**
 * Parse SSE text (may be incremental or complete) into OpenAI data payloads.
 * Ignores comments / ping lines and [DONE].
 */
export function parseUpstreamChatSseDataPayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  if (!text) return payloads;
  for (const block of String(text).split(/\n\n+/)) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(data));
    } catch {
      // ignore non-JSON frames
    }
  }
  return payloads;
}

/**
 * Fold chat.completion.chunk payloads into one chat.completion object.
 * Returns null when no usable choice/message can be assembled.
 */
export function assembleChatCompletionFromUpstreamSse(
  textOrPayloads: string | unknown[],
  fallbackModel = "gemini-2.5-flash"
): AssembledChatCompletion | null {
  const payloads = Array.isArray(textOrPayloads)
    ? textOrPayloads
    : parseUpstreamChatSseDataPayloads(textOrPayloads);

  if (payloads.length === 0) return null;

  let id = "";
  let created = 0;
  let model = fallbackModel;
  let role = "assistant";
  let content = "";
  let finishReason: string | null = null;
  let toolCalls: unknown[] | undefined;
  let usage: AssembledChatCompletion["usage"];
  let sawChoice = false;

  for (const payload of payloads) {
    const row = asRecord(payload);
    if (!row) continue;

    if (typeof row.id === "string" && row.id.trim()) id = row.id.trim();
    const createdNum = asNumber(row.created);
    if (createdNum !== undefined) created = Math.trunc(createdNum);
    if (typeof row.model === "string" && row.model.trim()) {
      model = row.model.trim();
    }

    const usageRow = asRecord(row.usage);
    if (usageRow) {
      usage = {
        prompt_tokens: asNumber(usageRow.prompt_tokens),
        completion_tokens: asNumber(usageRow.completion_tokens),
        total_tokens: asNumber(usageRow.total_tokens),
      };
    }

    const choices = Array.isArray(row.choices) ? row.choices : [];
    for (const choiceRaw of choices) {
      const choice = asRecord(choiceRaw);
      if (!choice) continue;
      sawChoice = true;
      const delta = asRecord(choice.delta) ?? asRecord(choice.message);
      if (delta) {
        if (typeof delta.role === "string" && delta.role.trim()) {
          role = delta.role.trim();
        }
        if (typeof delta.content === "string") {
          content += delta.content;
        }
        toolCalls = mergeToolCalls(toolCalls, delta.tool_calls);
      }
      if (typeof choice.finish_reason === "string" && choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }
  }

  if (!sawChoice) return null;

  const message: AssembledChatCompletion["choices"][0]["message"] = {
    role,
    content,
  };
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    id: id || `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: created || Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason ?? "stop",
        logprobs: null,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}
