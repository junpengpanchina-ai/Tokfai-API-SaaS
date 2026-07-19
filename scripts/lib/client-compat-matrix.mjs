/**
 * Shared constants for Tokfai third-party OpenAI-compatible client matrix smokes.
 * Offline/mock only — never contact production without LIVE=1.
 */

export const TOKFAI_BASE_URL = "https://api.tokfai.com";

/** Clients covered by docs + offline contract smokes (not all device-tested). */
export const CHAT_CLIENTS = [
  "Cherry Studio",
  "Chatbox",
  "NextChat",
  "LobeChat",
  "OpenWebUI",
  "LibreChat",
];

export const WORKFLOW_PLATFORMS = [
  "Dify",
  "FastGPT",
  "LangChain OpenAI-compatible",
  "LlamaIndex OpenAI-compatible",
];

export const CODING_CLIENTS = [
  "Continue",
  "Cline",
  "Roo Code",
  "OpenAI-compatible coding clients",
  "Codex",
];

export const REQUIRED_MODEL_IDS = [
  "gpt-5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gemini-3-pro",
  "gemini-2.5-flash",
];

/** Alias request → expected tokfai.resolved_model */
export const STABLE_ALIAS_CASES = [
  ["GPT 5", "gpt-5"],
  ["gpt5", "gpt-5"],
  ["gpt-5", "gpt-5"],
  ["GPT 5 Pro", "gpt-5-pro"],
  ["gpt5-pro", "gpt-5-pro"],
  ["gpt-5-pro", "gpt-5-pro"],
  ["GPT 5.4 Pro", "gpt-5-pro"],
  ["gpt-5.4-pro", "gpt-5-pro"],
  ["gpt-5-4-pro", "gpt-5-pro"],
  ["GPT 5.5", "gpt-5.5"],
  ["gpt5.5", "gpt-5.5"],
  ["gpt-5.5", "gpt-5.5"],
  ["Gemini 3 Pro", "gemini-3-pro"],
  ["gemini-3-pro", "gemini-3-pro"],
  ["gemini-2.5-flash", "gemini-2.5-flash"],
  ["openai/gpt-5.4-pro", "gpt-5-pro"],
  ["models/gpt-5", "gpt-5"],
];

/** Vendor leak patterns forbidden in client-facing error messages. */
export const FORBIDDEN_ERROR_LEAKS = [
  /grsaiapi/i,
  /grsai/i,
  /model not register/i,
  /not registered upstream/i,
  /upstream provider/i,
  /traceback/i,
  /supabase/i,
  /postgres/i,
];

/**
 * Stable Tokfai client vocabulary → actual API error.code values.
 * Dashboard keeps historical codes; docs teach both.
 */
export const CLIENT_ERROR_VOCAB = {
  model_not_available: ["model_not_available"],
  insufficient_balance: ["insufficient_credits", "insufficient_balance"],
  rate_limited: [
    "too_many_requests",
    "too_many_concurrent_requests",
    "upstream_rate_limited",
    "rate_limited",
  ],
  upstream_busy: [
    "upstream_model_busy",
    "all_upstreams_unavailable",
    "gateway_overloaded",
    "upstream_busy",
  ],
  invalid_request: ["invalid_request_error", "invalid_request"],
};

export function assertNoErrorLeak(message) {
  const text = String(message ?? "");
  for (const re of FORBIDDEN_ERROR_LEAKS) {
    if (re.test(text)) return `leak matched ${re}: ${text.slice(0, 120)}`;
  }
  return null;
}

export function codeMatchesVocab(vocabKey, code) {
  const allowed = CLIENT_ERROR_VOCAB[vocabKey] ?? [];
  return allowed.includes(String(code ?? ""));
}
