import { normalizeClientModelId } from "./modelAliases.js";

/**
 * External / legacy image model IDs → Tokfai catalog IDs (GRSAI upstream).
 * Callers may use Google Gemini image model names; Tokfai exposes nano-banana* ids.
 */
export const IMAGE_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-image-preview": "nano-banana",
  "gemini-2.5-flash-image": "nano-banana",
};

export function resolveImageModelId(requestedModel: string): string {
  const normalized = normalizeClientModelId(requestedModel);
  return IMAGE_MODEL_ALIASES[normalized] ?? normalized;
}
