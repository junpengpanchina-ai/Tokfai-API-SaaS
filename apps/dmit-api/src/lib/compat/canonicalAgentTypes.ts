/**
 * P1050 — Minimal canonical agent types for additive provider compatibility.
 *
 * Pure types only. Not wired into GPT Golden Path / executeChatCompletion.
 * Keep small — do not grow into a gateway-wide schema.
 */

/** Stable internal finish reasons (provider-agnostic). */
export type CanonicalFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "content_filter"
  | "error"
  | "unknown";

/**
 * Normalized tool call after provider-specific shapes are adapted.
 * `arguments` is a parsed object when JSON was valid; never silently invented.
 */
export type CanonicalToolCall = {
  id: string;
  name: string;
  /** Parsed JSON object when input was valid JSON / already an object. */
  arguments: Record<string, unknown>;
};

/** Optional usage snapshot — only when the provider already supplied reliable usage. */
export type CanonicalUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Minimal assistant turn result after provider adaptation.
 * Does not replace OpenAI chat.completion wire shapes on Golden Paths.
 */
export type CanonicalAssistantResult = {
  text: string | null;
  toolCalls: CanonicalToolCall[];
  finishReason: CanonicalFinishReason;
  usage?: CanonicalUsage | null;
};

/** Provider / protocol families for capability lookup (descriptive only). */
export type ProviderFamily =
  | "openai"
  | "openai_compatible"
  | "gemini"
  | "anthropic"
  | "unknown";

export type ProtocolFamily =
  | "openai_chat_completions"
  | "gemini_generate_content"
  | "anthropic_messages"
  | "unknown";
