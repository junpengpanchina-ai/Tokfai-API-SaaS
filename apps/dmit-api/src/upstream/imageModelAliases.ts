/**
 * External / legacy image model IDs → Tokfai catalog IDs (GRSAI upstream).
 * Callers may use Google Gemini image model names; Tokfai exposes nano-banana* ids.
 */
export const IMAGE_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-image-preview": "nano-banana",
  "gemini-2.5-flash-image": "nano-banana",
};

export function resolveImageModelId(requestedModel: string): string {
  const trimmed = requestedModel.trim();
  return IMAGE_MODEL_ALIASES[trimmed] ?? trimmed;
}
