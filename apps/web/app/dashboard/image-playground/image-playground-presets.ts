export type ImagePlaygroundPresetId =
  | "product"
  | "avatar"
  | "ecommerce"
  | "poster";

export const IMAGE_PLAYGROUND_PRESET_IDS: ImagePlaygroundPresetId[] = [
  "product",
  "avatar",
  "ecommerce",
  "poster",
];

export const IMAGE_PLAYGROUND_DEFAULT_PROMPT =
  "Create a clean product-style image of a futuristic API dashboard, soft lighting, minimal background.";

export function imagePlaygroundPresetLabelKey(
  id: ImagePlaygroundPresetId
): string {
  return `dashboard.imagePlayground.preset${id[0].toUpperCase()}${id.slice(1)}`;
}

export function imagePlaygroundPresetPromptKey(
  id: ImagePlaygroundPresetId
): string {
  return `dashboard.imagePlayground.preset${id[0].toUpperCase()}${id.slice(1)}Prompt`;
}
