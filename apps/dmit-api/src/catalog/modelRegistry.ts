import { getModelConfig } from "../upstream/modelCatalog.js";
import { CATALOG_ALIAS_IDS } from "../upstream/modelAliases.js";

/** Hidden from /v1/models and blocked for customer API calls. */
export const HIDDEN_INTERNAL_MODEL_IDS = new Set([
  "gpt-4o-mini",
  "test-admin-model-001",
]);

/** Allowed on explicit request but excluded from auto-routing and suggestedModels. */
export const SLOW_EXPERIMENTAL_CHAT_MODEL_IDS = new Set(["gemini-3.1-pro"]);

export const DEFAULT_IMAGE_MODEL_ID = "nano-banana-fast";

/** Static chat fallback when DB rows are unavailable. */
export const STATIC_CHAT_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.5",
  "gemini-3-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-pro",
  "gemini-3.1-pro",
] as const;

/** Static image fallback when DB rows are unavailable. */
export const STATIC_IMAGE_MODEL_IDS = [
  "nano-banana-fast",
  "nano-banana",
  "nano-banana-pro",
  "nano-banana-2",
  "gpt-image-2",
] as const;

export function isHiddenInternalModel(modelId: string): boolean {
  return HIDDEN_INTERNAL_MODEL_IDS.has(modelId);
}

export function isSlowExperimentalChatModel(modelId: string): boolean {
  return SLOW_EXPERIMENTAL_CHAT_MODEL_IDS.has(modelId);
}

export function isKnownChatModelKind(modelId: string): boolean {
  const config = getModelConfig(modelId);
  return config?.kind === "chat";
}

export function isKnownImageModelKind(modelId: string): boolean {
  const config = getModelConfig(modelId);
  return config?.kind === "image";
}

export function listStaticSuggestedChatModelIds(): string[] {
  const concrete = STATIC_CHAT_MODEL_IDS.filter(
    (id) => !isHiddenInternalModel(id) && !isSlowExperimentalChatModel(id)
  );
  return [...CATALOG_ALIAS_IDS, ...concrete];
}

export function listStaticSuggestedImageModelIds(): string[] {
  return STATIC_IMAGE_MODEL_IDS.filter((id) => !isHiddenInternalModel(id));
}
