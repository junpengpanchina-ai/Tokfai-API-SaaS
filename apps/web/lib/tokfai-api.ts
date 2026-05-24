/** Public Tokfai API surface (marketing + docs + dashboard copy). */
export const TOKFAI_API_BASE_URL = "https://api.tokfai.com/v1";
export const TOKFAI_MODELS_ENDPOINT = "GET /models";
export const TOKFAI_CHAT_COMPLETIONS_ENDPOINT = "POST /chat/completions";
export const TOKFAI_API_KEY_PLACEHOLDER = "sk-tokfai_xxx";
export const TOKFAI_RECOMMENDED_MODEL = "gemini-3.1-pro";

/** Full plaintext API key shown once at creation (not the display prefix). */
export const TOKFAI_FULL_API_KEY_PATTERN = /^sk-tokfai_[0-9a-f]{48}$/;

export function isFullTokfaiApiKey(value: string): boolean {
  return TOKFAI_FULL_API_KEY_PATTERN.test(value);
}
