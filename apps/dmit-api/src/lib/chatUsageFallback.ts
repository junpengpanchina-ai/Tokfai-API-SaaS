/**
 * P998 — Local chat usage estimation when GRSAI returns all-zero usage.
 *
 * Pure helpers only: no DB, env, or logging of user content.
 */

export type NormalizedChatUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/** UTF-8 bytes per estimated token (temporary conservative heuristic). */
export const UTF8_BYTES_PER_TOKEN = 3;

export const CHAT_USAGE_ESTIMATION_ALGORITHM = "utf8_bytes_div_3_v1" as const;

export function hasPositiveUsage(usage: NormalizedChatUsage): boolean {
  return (
    isPositiveToken(usage.promptTokens) ||
    isPositiveToken(usage.completionTokens) ||
    isPositiveToken(usage.totalTokens)
  );
}

/**
 * True when the chat completion response has billable output:
 * non-empty assistant message.content, or real tool_calls.
 */
export function hasBillableChatOutput(
  response: Record<string, unknown>
): boolean {
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;

  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      continue;
    }
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }
    const msg = message as Record<string, unknown>;
    if (isNonEmptyContent(msg.content)) return true;
    const toolCalls = msg.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) return true;
  }
  return false;
}

/**
 * Estimate prompt/completion/total tokens from request + response payloads.
 * Does not read max_tokens. Safe on JSON failure (returns mins / zeros).
 */
export function estimateChatUsageFromPayload(args: {
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
}): NormalizedChatUsage {
  const promptBytes = utf8ByteLengthOf({
    messages: args.requestBody.messages,
    tools: args.requestBody.tools,
    tool_choice: args.requestBody.tool_choice,
    response_format: args.requestBody.response_format,
  });
  const promptTokens = Math.max(1, Math.ceil(promptBytes / UTF8_BYTES_PER_TOKEN));

  const completionPayload = extractCompletionBillableParts(args.responseBody);
  const completionBytes = utf8ByteLengthOf(completionPayload);
  const hasOutput = hasBillableChatOutput(args.responseBody);
  const completionTokens =
    completionBytes > 0
      ? Math.max(1, Math.ceil(completionBytes / UTF8_BYTES_PER_TOKEN))
      : hasOutput
        ? 1
        : 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

/** When upstream gave positive prompt/completion but total is 0/null, coalesce. */
export function coalesceUpstreamUsageTotal(
  usage: NormalizedChatUsage
): NormalizedChatUsage {
  if (isPositiveToken(usage.totalTokens)) return usage;
  const prompt = usage.promptTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  if (prompt > 0 || completion > 0) {
    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: prompt + completion,
    };
  }
  return usage;
}

export function shouldEstimateChatUsage(args: {
  providerId: string;
  usage: NormalizedChatUsage;
  responseBody: Record<string, unknown>;
}): boolean {
  return (
    args.providerId === "grsai-primary" &&
    !hasPositiveUsage(args.usage) &&
    hasBillableChatOutput(args.responseBody)
  );
}

function isPositiveToken(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyContent(content: unknown): boolean {
  if (typeof content === "string") return content.length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return false;
}

function extractCompletionBillableParts(
  responseBody: Record<string, unknown>
): unknown[] {
  const choices = responseBody.choices;
  if (!Array.isArray(choices)) return [];

  const parts: unknown[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      continue;
    }
    const row = choice as Record<string, unknown>;
    const slice: Record<string, unknown> = {};
    if ("text" in row) slice.text = row.text;

    const message = row.message;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const msg = message as Record<string, unknown>;
      const msgSlice: Record<string, unknown> = {};
      if ("content" in msg) msgSlice.content = msg.content;
      if ("tool_calls" in msg) msgSlice.tool_calls = msg.tool_calls;
      if (Object.keys(msgSlice).length > 0) slice.message = msgSlice;
    }

    if (Object.keys(slice).length > 0) parts.push(slice);
  }
  return parts;
}

function utf8ByteLengthOf(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== "string") return 0;
    return Buffer.byteLength(text, "utf8");
  } catch {
    // Circular refs / BigInt / etc. — never throw into the success path.
    return 0;
  }
}
