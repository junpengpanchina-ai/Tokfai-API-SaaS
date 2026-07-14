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

/** Empty by default — never prefill smoke/demo prompts into consumer requests. */
export const IMAGE_PLAYGROUND_DEFAULT_PROMPT = "";

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
