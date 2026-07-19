import { resolveMaxOutputTokens } from "../gateway/keySafetyLimits.js";
import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";

/**
 * OpenAI-compatible payload forwarded to upstream providers.
 * Strips passthrough / vendor-incompatible / client billing fields.
 *
 * Compat: max_tokens, max_completion_tokens → clamped max_tokens.
 * temperature / top_p / stream_options are accepted without error;
 * stream_options is ignored (upstream always non-stream).
 */
export function buildUpstreamChatBody(
  body: ChatCompletionRequestBody,
  model: string
): Record<string, unknown> {
  const upstream: Record<string, unknown> = {
    model,
    messages: body.messages,
    stream: false,
  };

  if (body.temperature !== undefined) {
    upstream.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    upstream.top_p = body.top_p;
  }

  const rawMax =
    body.max_tokens ??
    (typeof body.max_completion_tokens === "number"
      ? body.max_completion_tokens
      : undefined);
  if (rawMax !== undefined) {
    upstream.max_tokens = resolveMaxOutputTokens(rawMax);
  }

  return upstream;
}
