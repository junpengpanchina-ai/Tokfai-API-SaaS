import type { ChatCompletionRequestBody } from "./executeChatCompletion.js";

/**
 * OpenAI-compatible payload forwarded to upstream providers.
 * Strips passthrough / vendor-incompatible fields from the client body.
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
  if (body.max_tokens !== undefined) {
    upstream.max_tokens = body.max_tokens;
  }

  return upstream;
}
