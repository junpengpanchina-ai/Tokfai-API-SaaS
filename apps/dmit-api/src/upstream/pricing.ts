/**
 * Per-model pricing (USD, per 1k tokens). PLACEHOLDER values — replace with
 * your real rate card before going live. Adjust freely; the only consumer
 * is the chat completions debit logic.
 */

export interface ModelPrice {
  /** USD per 1k input tokens. */
  input_per_1k: number;
  /** USD per 1k output tokens. */
  output_per_1k: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "gemini-3.1-pro": { input_per_1k: 0.002, output_per_1k: 0.004 },
  "gemini-3-pro": { input_per_1k: 0.001, output_per_1k: 0.002 },
  "gpt-4o-mini": { input_per_1k: 0.00015, output_per_1k: 0.0006 },
  "nano-banana": { input_per_1k: 0.0001, output_per_1k: 0.0002 },
};

export function listAllowedModels(): string[] {
  return Object.keys(MODEL_PRICING);
}

export function isAllowedModel(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING, model);
}

/** USD cost for (input_tokens, output_tokens) on the given model. */
export function priceFor(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const tier = MODEL_PRICING[model];
  if (!tier) return 0;
  return (
    (inputTokens / 1000) * tier.input_per_1k +
    (outputTokens / 1000) * tier.output_per_1k
  );
}
