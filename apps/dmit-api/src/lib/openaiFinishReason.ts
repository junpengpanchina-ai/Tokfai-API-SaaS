/**
 * OpenAI-compatible finish_reason normalization for /v1/chat/completions.
 *
 * Cherry Studio (and some SDKs) reject finish_reason "other" with
 * AI_FinishReasonError. AI SDK maps null/unknown/other → "other".
 * Map non-OpenAI reasons to "stop" on the wire only —
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

export type NormalizeFinishReasonOpts = {
  /**
   * Mid-stream SSE chunks use finish_reason: null. Keep null only when true.
   * Non-stream bodies and terminal SSE chunks must use allowNull: false
   * (null → "stop") so AI SDK does not map null → "other".
   */
  allowNull?: boolean;
  /** Dev-only debug route label. */
  route?: string;
};

function finishReasonLabel(reason: unknown): string {
  if (reason === undefined) return "undefined";
  if (reason === null) return "null";
  if (typeof reason === "string") return reason;
  return String(reason);
}

function logNormalizeFinishReason(
  before: unknown,
  after: string | null,
  route: string | undefined
): void {
  if (process.env.NODE_ENV !== "development") return;
  const beforeLabel = finishReasonLabel(before);
  const afterLabel = after === null ? "null" : after;
  if (beforeLabel === afterLabel) return;
  // Case-only rewrite (Stop → stop) is not interesting for Cherry debug.
  if (
    typeof before === "string" &&
    before.trim().toLowerCase() === afterLabel
  ) {
    return;
  }
  console.log(
    `NORMALIZE_FINISH_REASON:\nbefore=${beforeLabel}\nafter=${afterLabel}\nroute=${route ?? "unknown"}`
  );
}

/**
 * Normalize a single finish_reason for OpenAI clients.
 * - other / unknown / "" / undefined / unrecognized → "stop"
 * - null → "stop" unless allowNull (mid-stream SSE only)
 */
export function normalizeOpenAiFinishReason(
  reason: unknown,
  opts?: NormalizeFinishReasonOpts
): string | null {
  const allowNull = opts?.allowNull === true;
  let after: string | null;

  if (reason === null) {
    after = allowNull ? null : "stop";
  } else if (reason === undefined) {
    after = "stop";
  } else if (typeof reason !== "string") {
    after = "stop";
  } else {
    const trimmed = reason.trim();
    if (!trimmed) {
      after = "stop";
    } else {
      const lower = trimmed.toLowerCase();
      if (lower === "other" || lower === "unknown") after = "stop";
      else if (PASSTHROUGH.has(lower)) after = lower;
      else after = "stop";
    }
  }

  logNormalizeFinishReason(reason, after, opts?.route);
  return after;
}

/** Mutate-free: normalize choices[].finish_reason on a chat.completion body. */
export function normalizeOpenAiFinishReasonOnChatCompletion(
  data: Record<string, unknown>,
  opts?: { route?: string }
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? data.choices : null;
  if (!choices || choices.length === 0) return data;
  const route = opts?.route ?? "/v1/chat/completions";

  const nextChoices = choices.map((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const row = { ...(choice as Record<string, unknown>) };
    // Non-stream: null must become stop (AI SDK null → "other").
    row.finish_reason = normalizeOpenAiFinishReason(row.finish_reason, {
      allowNull: false,
      route,
    });
    return row;
  });

  return { ...data, choices: nextChoices };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Wire-level SSE chunk safety: normalize choices[].finish_reason before
 * JSON.stringify. Empty delta ({}) is treated as the terminal chunk —
 * null/other/unknown → "stop". Mid-stream null is preserved.
 */
export function normalizeOpenAiFinishReasonOnSseChunk(
  payload: unknown,
  opts?: { route?: string }
): unknown {
  const row = asRecord(payload);
  if (!row || !Array.isArray(row.choices)) return payload;
  const route = opts?.route ?? "/v1/chat/completions";

  const nextChoices = row.choices.map((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const c = { ...(choice as Record<string, unknown>) };
    const delta = asRecord(c.delta);
    const emptyDelta = delta !== null && Object.keys(delta).length === 0;
    // Terminal chunk: delta {} — never leave null/other for Cherry / AI SDK.
    // Mid-stream: allow null finish_reason only.
    c.finish_reason = normalizeOpenAiFinishReason(c.finish_reason, {
      allowNull: !emptyDelta,
      route,
    });
    return c;
  });

  return { ...row, choices: nextChoices };
}
