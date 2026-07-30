import { resolveMaxOutputTokens } from "../gateway/keySafetyLimits.js";
import {
  coerceOptionalNumber,
  listDroppedUpstreamChatKeysForLog,
  normalizeChatMessages,
  sanitizeUpstreamChatBody,
  type SanitizeChatBodyInput,
} from "./chatCompletionCompat.js";
import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";

/**
 * OpenAI-compatible payload forwarded to upstream providers.
 *
 * - Whitelist only safe fields (no Cherry extra_body / provider_options passthrough)
 * - Normalize messages content (string | text-parts array → string)
 * - Map max_completion_tokens → clamped max_tokens
 * - Strip GPT sampling params (temperature / top_p) that many GPT models reject
 * - Accept stream_options without forwarding (upstream always non-stream)
 * - Audit dropped top-level key *names* only (never values; sensitive names scrubbed)
 */
export function buildUpstreamChatBody(
  body: ChatCompletionRequestBody,
  model: string
): Record<string, unknown> {
  const sanitized = sanitizeUpstreamChatBody(
    body as SanitizeChatBodyInput,
    model
  );
  if (!sanitized.ok) {
    // Caller validates messages; defensive empty payload should never reach here.
    return {
      model,
      messages: [{ role: "user", content: "" }],
      stream: false,
    };
  }

  const upstream = sanitized.upstream;

  // Clamp whatever sanitize mapped (max_tokens or promoted max_completion_tokens).
  // Never re-introduce max_completion_tokens on the upstream payload.
  const rawMax =
    coerceOptionalNumber(upstream.max_tokens) ??
    coerceOptionalNumber(body.max_tokens) ??
    coerceOptionalNumber(body.max_completion_tokens);
  if (rawMax !== undefined) {
    upstream.max_tokens = resolveMaxOutputTokens(rawMax);
  }
  delete upstream.max_completion_tokens;

  return upstream;
}

/** Names-only audit helper for gateway logs (forbidden names scrubbed). */
export function droppedUpstreamChatKeysForAudit(
  body: ChatCompletionRequestBody | Record<string, unknown>
): string[] {
  return listDroppedUpstreamChatKeysForLog(body as Record<string, unknown>);
}

export { normalizeChatMessages };
