export interface ImagePlaygroundPreset {
  id: string;
  label: string;
  prompt: string;
  worksBestWithInputImage?: boolean;
}

export const IMAGE_PLAYGROUND_PRESETS: ImagePlaygroundPreset[] = [
  {
    id: "preserve-subject",
    label: "Preserve subject",
    prompt:
      "Use the input image as reference. Preserve the main subject, composition, and key details. Improve lighting, clarity, and overall visual quality.",
  },
  {
    id: "product-photo",
    label: "Product photo",
    worksBestWithInputImage: true,
    prompt:
      "Turn the input image into a clean product photo on a white background, professional lighting, sharp details, commercial style.",
  },
  {
    id: "figurine",
    label: "Figurine",
    worksBestWithInputImage: true,
    prompt:
      "Turn the input image into a high-quality collectible figurine. Preserve the main subject's key features, outfit, and pose. Place it on a clean desk with a premium toy-box package in the background. Product photography, soft lighting, highly detailed.",
  },
  {
    id: "poster",
    label: "Poster",
    prompt:
      "Turn the input image into a modern promotional poster with strong composition, clean typography space, premium commercial style.",
  },
  {
    id: "avatar",
    label: "Avatar",
    worksBestWithInputImage: true,
    prompt:
      "Turn the input image into a clean stylized avatar, preserving the key facial features and expression.",
  },
  {
    id: "white-background",
    label: "White background",
    prompt:
      "Keep the main subject and place it on a clean white background with natural shadow.",
  },
];
