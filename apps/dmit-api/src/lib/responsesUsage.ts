/**
 * P1081 — OpenAI Responses API wire usage normalizer.
 *
 * Codex / OpenAI clients parse `response.completed` with a schema that
 * requires `usage.total_tokens`. Upstream or synthetic bodies sometimes only
 * carry input_tokens/output_tokens; fill the missing number on the wire only.
 *
 * Does not touch billing, debit math, routing, or chat/completions usage.
 * Never logs prompt / body / key / tools content.
 */

export type ResponsesUsageWire = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: unknown;
  output_tokens_details?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalize Responses `usage` for wire compatibility.
 * - input_tokens / output_tokens → finite number, else 0
 * - total_tokens → finite number, else input_tokens + output_tokens
 * - preserves input_tokens_details / output_tokens_details when present
 */
export function normalizeResponsesUsage(usage: unknown): ResponsesUsageWire {
  const row = asRecord(usage);
  const inputTokens = asFiniteNumber(row?.input_tokens) ?? 0;
  const outputTokens = asFiniteNumber(row?.output_tokens) ?? 0;
  const totalTokens =
    asFiniteNumber(row?.total_tokens) ?? inputTokens + outputTokens;

  const out: ResponsesUsageWire = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };

  if (row && "input_tokens_details" in row) {
    out.input_tokens_details = row.input_tokens_details;
  }
  if (row && "output_tokens_details" in row) {
    out.output_tokens_details = row.output_tokens_details;
  }

  return out;
}
