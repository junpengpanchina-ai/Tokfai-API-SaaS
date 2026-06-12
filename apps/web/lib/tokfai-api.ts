/** Public Tokfai API surface (marketing + docs + dashboard copy). */
export const TOKFAI_API_BASE_URL = "https://api.tokfai.com/v1";
export const TOKFAI_MODELS_ENDPOINT = "GET /models";
export const TOKFAI_CHAT_COMPLETIONS_ENDPOINT = "POST /chat/completions";
export const TOKFAI_IMAGES_GENERATIONS_ENDPOINT = "POST /images/generations";
export const TOKFAI_IMAGES_GENERATIONS_FULL_PATH =
  "POST /v1/images/generations";
export const IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER =
  "Describe the image you want to generate.";
export const IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER =
  "Describe how to transform or restyle the input image.";
export const IMAGE_REFERENCE_SYSTEM_HINT =
  "Use the input image(s) as visual reference. Preserve the main subject unless the user asks otherwise.";
export const TOKFAI_API_KEY_FORMAT = "sk-tokfai_...";
export const TOKFAI_API_KEY_PLACEHOLDER = "sk-tokfai_xxx";
export const TOKFAI_RECOMMENDED_MODEL = "gpt-5.4";
export const TOKFAI_CLIENT_TEST_PROMPT =
  "Hello from Tokfai — reply in one sentence.";
export const TOKFAI_HEALTH_URL = "https://api.tokfai.com/v1/health";

export const TOKFAI_PRODUCT_TAGLINE =
  "OpenAI-compatible image & chat API — one API for chat, image, and AI apps.";
export const TOKFAI_BILLING_POLICY =
  "Successful calls debit credits. Failed calls are not charged.";
export const TOKFAI_PRICING_DISCLAIMER =
  "Current reference prices are shown for planning. Usage and Credits are the source of truth for actual charges.";
export const TOKFAI_PLAYGROUND_POLICY =
  "Chat Playground supports chat models. Image Playground supports image models. Video models will use a separate playground later.";
export const TOKFAI_STARTER_PLAN = "Starter ¥29 = 10,000 credits";

/** Full plaintext API key shown once at creation (not the display prefix). */
export const TOKFAI_FULL_API_KEY_PATTERN = /^sk-tokfai_[0-9a-f]{48}$/;

export function isFullTokfaiApiKey(value: string): boolean {
  return TOKFAI_FULL_API_KEY_PATTERN.test(value);
}
