/**
 * OpenAI-compatible finish_reason normalization for /v1/chat/completions.
 *
 * Cherry Studio (and some SDKs) reject finish_reason "other" with
 * AI_FinishReasonError. Map non-OpenAI reasons to "stop" on the wire only —
 * does not change billing, usage debit, routing, or provider fallback.
 */

const PASSTHROUGH = new Set([
  "stop",
  "length",
  "content_filter",
  // OpenAI tool / legacy function calling — must not be rewritten to stop.
  "tool_calls",
  "function_call",
]);

/**
 * Normalize a single finish_reason for OpenAI clients.
 * - null stays null (mid-stream chunks)
 * - other / unknown / "" / undefined / unrecognized → "stop"
 */
export function normalizeOpenAiFinishReason(
  reason: unknown
): string | null {
  if (reason === null) return null;
  if (reason === undefined) return "stop";
  if (typeof reason !== "string") return "stop";
  const trimmed = reason.trim();
  if (!trimmed) return "stop";
  const lower = trimmed.toLowerCase();
  if (lower === "other" || lower === "unknown") return "stop";
  if (PASSTHROUGH.has(lower)) return lower;
  return "stop";
}

/** Mutate-free: normalize choices[].finish_reason on a chat.completion body. */
export function normalizeOpenAiFinishReasonOnChatCompletion(
  data: Record<string, unknown>
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? data.choices : null;
  if (!choices || choices.length === 0) return data;

  const nextChoices = choices.map((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const row = { ...(choice as Record<string, unknown>) };
    row.finish_reason = normalizeOpenAiFinishReason(row.finish_reason);
    return row;
  });

  return { ...data, choices: nextChoices };
}
