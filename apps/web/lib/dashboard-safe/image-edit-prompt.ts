/**
 * Image Playground prompt helpers — text-to-image vs reference-image edit mode.
 * Client-only prompt shaping; does not change DMIT Image API contracts.
 */

const EDIT_HINT_PATTERN =
  /保留|替换|换成|改成|变成|参考|保持|主体|脸|人物|衣服|背景|西装|中山装|服装|发型|姿态|构图/;

export type ImagePlaygroundMode = "text_to_image" | "reference_edit";

export function getImagePlaygroundMode(
  hasReferenceImages: boolean
): ImagePlaygroundMode {
  return hasReferenceImages ? "reference_edit" : "text_to_image";
}

export function shouldEnhanceReferenceEditPrompt(prompt: string): boolean {
  return EDIT_HINT_PATTERN.test(prompt);
}

/**
 * Strengthen reference-edit prompts so the upstream keeps subject identity.
 */
export function enhanceReferenceEditPrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (!trimmed) return trimmed;

  if (!shouldEnhanceReferenceEditPrompt(trimmed)) {
    return [
      "请以参考图为主要依据进行局部改图。",
      "尽量保留参考图中的人物身份、脸部特征、发型、姿态、构图和背景一致性，",
      `只按用户要求修改：${trimmed}`,
      "不要改变人物年龄、五官、脸型、身材和场景。要求真实摄影风格，自然光线，高质量细节。",
    ].join("");
  }

  return [
    "请以参考图为主要依据进行局部改图。",
    "保留参考图中的人物身份、脸部特征、发型、姿态、构图和背景一致性，",
    `按以下要求修改：${trimmed}`,
    "不要改变人物年龄、五官、脸型、身材和场景。要求真实摄影风格，自然光线，高质量细节。",
  ].join("");
}

export function resolveImagePromptForRequest(options: {
  prompt: string;
  hasReferenceImages: boolean;
}): string {
  const trimmed = options.prompt.trim();
  if (!options.hasReferenceImages) return trimmed;
  return enhanceReferenceEditPrompt(trimmed);
}

/** Prefer stable models for reference edits; fast is fine for text-to-image drafts. */
export const REFERENCE_EDIT_PREFERRED_MODELS = [
  "nano-banana",
  "nano-banana-pro",
  "nano-banana-2",
] as const;

export const TEXT_TO_IMAGE_DEFAULT_MODEL = "nano-banana-fast";

export function pickPreferredImageModel(options: {
  hasReferenceImages: boolean;
  availableModelIds: string[];
  currentModel: string;
}): { model: string; switched: boolean; warnFastForEdit: boolean } {
  const { hasReferenceImages, availableModelIds, currentModel } = options;
  const available = new Set(availableModelIds);

  if (!hasReferenceImages) {
    return {
      model: available.has(currentModel)
        ? currentModel
        : available.has(TEXT_TO_IMAGE_DEFAULT_MODEL)
          ? TEXT_TO_IMAGE_DEFAULT_MODEL
          : currentModel,
      switched: false,
      warnFastForEdit: false,
    };
  }

  const preferred = REFERENCE_EDIT_PREFERRED_MODELS.find((id) =>
    available.has(id)
  );

  if (preferred && currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL) {
    return { model: preferred, switched: true, warnFastForEdit: false };
  }

  if (preferred && !available.has(currentModel)) {
    return { model: preferred, switched: true, warnFastForEdit: false };
  }

  const warnFastForEdit =
    currentModel === TEXT_TO_IMAGE_DEFAULT_MODEL ||
    currentModel.includes("-fast");

  return {
    model: available.has(currentModel)
      ? currentModel
      : preferred ?? currentModel,
    switched: !available.has(currentModel) && Boolean(preferred),
    warnFastForEdit,
  };
}
