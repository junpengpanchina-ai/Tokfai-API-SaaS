/**
 * P954 — Image provider routing isolation helpers.
 *
 * Stable cross-surface error codes + text-vs-image heuristics.
 * Kept in lib/ (not capabilities/) so hot-deploys stay writable on prod.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";

export const IMAGE_MODEL_NOT_FOR_CHAT_CODE = "image_model_not_for_chat" as const;
export const MODEL_NOT_IMAGE_CAPABLE_CODE = "model_not_image_capable" as const;

function isImageFamilyModelId(model: string): boolean {
  const m = normalizeClientModelId(model);
  if (m === "nano-banana" || m.startsWith("nano-banana-")) return true;
  if (m === "gpt-image" || m.startsWith("gpt-image-")) return true;
  return false;
}

/**
 * Text / chat-family models that must not hit /v1/images/generations.
 * Includes prefix heuristics for gpt / gemini / claude / auto aliases.
 */
export function isNonImageTextModel(model: string): boolean {
  const m = normalizeClientModelId(model);
  if (!m || isImageFamilyModelId(m)) return false;
  if (m.startsWith("auto-")) return true;
  if (m.startsWith("claude-") || m.startsWith("anthropic")) return true;
  if (m.startsWith("gpt-") && !m.startsWith("gpt-image")) return true;
  if (m.startsWith("gemini-")) {
    // Gemini image preview names are aliased to nano-banana before this check.
    return !m.includes("-image");
  }
  return false;
}
