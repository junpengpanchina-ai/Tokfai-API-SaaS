import { normalizeClientModelId } from "./modelAliases.js";

/**
 * External / legacy image model IDs → Tokfai catalog IDs (GRSAI upstream).
 * Callers may use Google Gemini image model names; Tokfai exposes nano-banana* ids.
 */
export const IMAGE_MODEL_ALIASES: Record<string, string> = {
  "gemini-2.5-flash-image-preview": "nano-banana",
  "gemini-2.5-flash-image": "nano-banana",
};

/**
 * Temporarily unavailable image models (upstream timeout / not provisioned).
 * Hard-deny overrides DB enabled rows — returns image_model_not_available.
 */
export const UNAVAILABLE_IMAGE_MODEL_IDS = new Set([
  "nano-banana-2-lite",
  "nano-banana-pro",
  "nano-banana-pro-vip",
  "nano-banana-pro-cl",
  "nano-banana-2-cl",
  "nano-banana-2-2k-cl",
  "nano-banana-2-4k-cl",
  "nano-banana-pro-4k-vip",
]);

export function resolveImageModelId(requestedModel: string): string {
  const normalized = normalizeClientModelId(requestedModel);
  return IMAGE_MODEL_ALIASES[normalized] ?? normalized;
}

/**
 * Map Tokfai public image model id → upstream provider model id.
 * Public API responses must keep showing the requested / catalog id.
 *
 * - nano-banana → nano-banana-fast (default product mapping)
 * - nano-banana-fast / nano-banana-2 → passthrough
 */
export function resolveImageUpstreamModel(model: string): string {
  const normalized = normalizeClientModelId(model);
  if (normalized === "nano-banana") return "nano-banana-fast";
  return normalized;
}

export function isUnavailableImageModel(model: string): boolean {
  return UNAVAILABLE_IMAGE_MODEL_IDS.has(normalizeClientModelId(model));
}
