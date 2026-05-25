const PRESERVE_SUBJECT_CONSTRAINT =
  "保留上传图片中的主体、物种/人物/物体身份、主要轮廓、姿态和关键特征，只改变风格、背景和质感，不要生成无关物体。";

export interface ImagePlaygroundPreset {
  id: string;
  label: string;
  prompt: string;
  worksBestWithInputImage?: boolean;
}

export const IMAGE_PLAYGROUND_PRESERVE_SUBJECT_PROMPT =
  PRESERVE_SUBJECT_CONSTRAINT;

export const IMAGE_PLAYGROUND_PRESETS: ImagePlaygroundPreset[] = [
  {
    id: "preserve-subject",
    label: "Preserve subject",
    worksBestWithInputImage: true,
    prompt: PRESERVE_SUBJECT_CONSTRAINT,
  },
  {
    id: "product-photo",
    label: "Product photo",
    worksBestWithInputImage: true,
    prompt: `${PRESERVE_SUBJECT_CONSTRAINT} Turn the input image into a clean product photo on a white background, professional lighting, sharp details, commercial style.`,
  },
  {
    id: "figurine",
    label: "Figurine",
    worksBestWithInputImage: true,
    prompt: `${PRESERVE_SUBJECT_CONSTRAINT} Turn the input image into a high-quality collectible figurine. Place it on a clean desk with a premium toy-box package in the background. Product photography, soft lighting, highly detailed.`,
  },
  {
    id: "poster",
    label: "Poster",
    worksBestWithInputImage: true,
    prompt: `${PRESERVE_SUBJECT_CONSTRAINT} Turn the input image into a modern promotional poster with strong composition, clean typography space, premium commercial style.`,
  },
  {
    id: "avatar",
    label: "Avatar",
    worksBestWithInputImage: true,
    prompt: `${PRESERVE_SUBJECT_CONSTRAINT} Turn the input image into a clean stylized avatar, preserving the key facial features and expression.`,
  },
  {
    id: "white-background",
    label: "White background",
    worksBestWithInputImage: true,
    prompt: `${PRESERVE_SUBJECT_CONSTRAINT} Keep the main subject and place it on a clean white background with natural shadow.`,
  },
];
