/**
 * OpenAI-compatible finish_reason normalization for /v1/chat/completions.
 *
 * Cherry Studio (and some SDKs) reject finish_reason "other" with
 * AI_FinishReasonError. AI SDK maps null/unknown/other → "other".
 * Map non-OpenAI reasons on the wire only —
 * does not change billing, usage debit, routing, or provider fallback.
 *
 * Canonical map (outbound adapter):
 *   STOP / stop / end_turn     → stop
 *   MAX_TOKENS / max_tokens    → length
 *   SAFETY                     → content_filter
 *   OTHER / other / unknown / null → stop
 */

/** OpenAI tool / legacy function calling — must not be rewritten to stop. */
const TOOL_FINISH = new Set(["tool_calls", "function_call"]);

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
 * Unified outbound finish_reason normalize for OpenAI Chat Completion clients.
 * - STOP / stop / end_turn → "stop"
 * - MAX_TOKENS / max_tokens → "length"
 * - SAFETY → "content_filter"
 * - OTHER / other / unknown / "" / undefined / unrecognized → "stop"
 * - null → "stop" unless allowNull (mid-stream SSE only)
 * - tool_calls / function_call → passthrough
 */
export function normalizeFinishReason(
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
      if (lower === "stop" || lower === "end_turn") after = "stop";
      else if (lower === "max_tokens" || lower === "length") after = "length";
      else if (lower === "safety" || lower === "content_filter") {
        after = "content_filter";
      } else if (lower === "other" || lower === "unknown") after = "stop";
      else if (TOOL_FINISH.has(lower)) after = lower;
      else after = "stop";
    }
  }

  logNormalizeFinishReason(reason, after, opts?.route);
  return after;
}

/** Alias — existing call sites / smokes use this name. */
export const normalizeOpenAiFinishReason = normalizeFinishReason;

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
 * JSON.stringify.
 *
 * - other / unknown / "" / undefined → always "stop"
 * - null on terminal chunks (missing or empty delta {}) → "stop"
 *   (AI SDK maps final null → "other" → Cherry AI_FinishReasonError)
 * - null on mid-stream chunks (delta has role/content/tool_calls) → keep null
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
    // Missing delta OR {} ⇒ terminal finish frame (not mid-stream).
    const hasMidStreamDelta =
      delta !== null && Object.keys(delta).length > 0;
    c.finish_reason = normalizeOpenAiFinishReason(c.finish_reason, {
      allowNull: hasMidStreamDelta,
      route,
    });
    return c;
  });

  return { ...row, choices: nextChoices };
}

const RESPONSES_ROUTE = "/v1/responses";

/**
 * Map chat finish_reason → Responses `incomplete_details`.
 * Never put "stop"/"other" into incomplete_details.reason — AI SDK maps
 * unrecognized reasons to unified "other".
 */
export function chatFinishReasonToResponsesIncompleteDetails(
  finishReason: string | null
): { reason: string } | null {
  if (finishReason === "length") return { reason: "max_output_tokens" };
  if (finishReason === "content_filter") return { reason: "content_filter" };
  return null;
}

/**
 * Normalize Responses incomplete_details.reason on the wire.
 * other / unknown / stop / "" / undefined → null (clean completed).
 */
export function normalizeResponsesIncompleteDetails(
  details: unknown,
  opts?: { route?: string }
): { reason: string } | null {
  const route = opts?.route ?? RESPONSES_ROUTE;
  if (details === null || details === undefined) return null;
  const row = asRecord(details);
  if (!row) return null;
  const reason = row.reason;
  if (reason === null || reason === undefined) return null;
  if (typeof reason !== "string" || !reason.trim()) {
    logNormalizeFinishReason(reason, null, route);
    return null;
  }
  const lower = reason.trim().toLowerCase();
  if (
    lower === "other" ||
    lower === "unknown" ||
    lower === "stop" ||
    lower === "end_turn"
  ) {
    logNormalizeFinishReason(reason, null, route);
    return null;
  }
  if (lower === "max_output_tokens" || lower === "content_filter") {
    return { reason: lower };
  }
  logNormalizeFinishReason(reason, null, route);
  return null;
}

/**
 * Normalize finish_reason + incomplete_details on a Responses API object.
 * Does not touch usage / credits / request_id / routing fields.
 */
export function normalizeOpenAiFinishReasonOnResponsesPayload(
  data: Record<string, unknown>,
  opts?: { route?: string }
): Record<string, unknown> {
  const route = opts?.route ?? RESPONSES_ROUTE;
  const next = { ...data };

  if ("finish_reason" in next) {
    const normalized = normalizeOpenAiFinishReason(next.finish_reason, {
      // Responses completed bodies should not leave null (AI SDK default other).
      allowNull: false,
      route,
    });
    next.finish_reason = normalized ?? "stop";
  }

  if ("incomplete_details" in next) {
    next.incomplete_details = normalizeResponsesIncompleteDetails(
      next.incomplete_details,
      { route }
    );
  }

  return next;
}

/**
 * Wire-level Responses SSE payload safety before JSON.stringify.
 * Walks nested `response` objects for finish_reason / incomplete_details.
 */
export function normalizeOpenAiFinishReasonOnResponsesSsePayload(
  payload: unknown,
  opts?: { route?: string }
): unknown {
  const row = asRecord(payload);
  if (!row) return payload;
  const route = opts?.route ?? RESPONSES_ROUTE;
  let next: Record<string, unknown> = { ...row };

  const nested = asRecord(next.response);
  if (nested) {
    next = {
      ...next,
      response: normalizeOpenAiFinishReasonOnResponsesPayload(nested, {
        route,
      }),
    };
  }

  if ("finish_reason" in next || "incomplete_details" in next) {
    next = normalizeOpenAiFinishReasonOnResponsesPayload(next, { route });
  }

  return next;
}
