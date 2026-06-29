/** Public Tokfai API constants — dashboard-safe, no unstable imports. */

export const TOKFAI_API_BASE_URL = "https://api.tokfai.com/v1";
export const TOKFAI_CHAT_COMPLETIONS_ENDPOINT = "POST /chat/completions";
export const TOKFAI_IMAGES_GENERATIONS_ENDPOINT = "POST /images/generations";
export const IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER =
  "Describe the image you want to generate.";
export const IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER =
  "Describe how to transform or restyle the input image.";
export const TOKFAI_API_KEY_PLACEHOLDER = "sk-tokfai_xxx";
export const TOKFAI_RECOMMENDED_MODEL = "auto-fast";
export const TOKFAI_SMART_MODEL_ALIASES = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
] as const;
export type TokfaiSmartModelAlias = (typeof TOKFAI_SMART_MODEL_ALIASES)[number];

export const TOKFAI_FULL_API_KEY_PATTERN = /^sk-tokfai_[0-9a-f]{48}$/;

export function isFullTokfaiApiKey(value: string): boolean {
  return TOKFAI_FULL_API_KEY_PATTERN.test(value);
}

export function isSmartModelAlias(modelId: string): modelId is TokfaiSmartModelAlias {
  return (TOKFAI_SMART_MODEL_ALIASES as readonly string[]).includes(modelId);
}

export function getDmitBaseUrl(): string {
  const DEFAULT_BASE = "https://api.tokfai.com";
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.replace(/\/+$/, "") ??
    DEFAULT_BASE
  );
}
