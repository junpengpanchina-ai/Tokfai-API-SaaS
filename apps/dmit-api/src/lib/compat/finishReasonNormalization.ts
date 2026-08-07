/**
 * P1050 — Provider finish_reason → CanonicalFinishReason (pure).
 *
 * Separate from apps/dmit-api/src/lib/openaiFinishReason.ts wire adapter
 * (which maps other/unknown → "stop" for Cherry / AI SDK). This seam keeps
 * unknown as "unknown" for internal canonical use and never throws.
 */

import type { CanonicalFinishReason } from "./canonicalAgentTypes.js";

/**
 * Map any provider finish reason into the canonical set.
 * Unknown / empty / non-string → "unknown" (never throws).
 */
export function toCanonicalFinishReason(
  reason: unknown
): CanonicalFinishReason {
  if (reason === null || reason === undefined) return "unknown";
  if (typeof reason !== "string") return "unknown";
  const trimmed = reason.trim();
  if (!trimmed) return "unknown";

  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  // OpenAI wire values
  if (lower === "stop" || lower === "end_turn" || lower === "stop_sequence") {
    return "stop";
  }
  if (lower === "tool_calls" || lower === "function_call") {
    return "tool_calls";
  }
  if (lower === "length" || lower === "max_tokens") {
    return "length";
  }
  if (lower === "content_filter" || lower === "safety") {
    return "content_filter";
  }
  if (lower === "error") {
    return "error";
  }

  // Gemini generateContent candidate.finishReason
  if (upper === "STOP") return "stop";
  if (upper === "MAX_TOKENS") return "length";
  if (upper === "SAFETY") return "content_filter";
  if (upper === "RECITATION") return "content_filter";
  if (upper === "OTHER") return "unknown";

  return "unknown";
}

/** OpenAI-oriented alias (same pure mapping). */
export function normalizeOpenAiFinishReasonToCanonical(
  reason: unknown
): CanonicalFinishReason {
  return toCanonicalFinishReason(reason);
}

/** Gemini-oriented alias (same pure mapping). */
export function normalizeGeminiFinishReasonToCanonical(
  reason: unknown
): CanonicalFinishReason {
  return toCanonicalFinishReason(reason);
}
