export type ModelType = "chat" | "image" | "video";

export type ModelStatus = "available" | "coming_soon";

export interface ModelCatalogEntry {
  id: string;
  displayName: string;
  type: ModelType;
  status: ModelStatus;
  billingUnit: string;
  description: string;
  /** Image models only — capabilities shown on the Models page. */
  supports?: string[];
}

export const CHAT_MODELS: ModelCatalogEntry[] = [
  {
    id: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    type: "chat",
    status: "available",
    billingUnit: "Per 1k input / output tokens",
    description: "Main premium chat model for high-quality completions.",
  },
  {
    id: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    type: "chat",
    status: "available",
    billingUnit: "Per 1k input / output tokens",
    description: "Gemini 3 Pro chat model for general-purpose conversations.",
  },
];

const IMAGE_MODEL_SUPPORTS = [
  "Text to image",
  "Image to image",
  "URL reference",
] as const;

export const IMAGE_MODELS: ModelCatalogEntry[] = [
  {
    id: "nano-banana",
    displayName: "Nano Banana",
    type: "image",
    status: "available",
    billingUnit: "Per image",
    description: "Image generation model.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
  {
    id: "nano-banana-fast",
    displayName: "Nano Banana Fast",
    type: "image",
    status: "available",
    billingUnit: "Per image",
    description: "Fast image generation with lower latency.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    type: "image",
    status: "available",
    billingUnit: "Per image",
    description: "Higher-quality image generation model.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
  {
    id: "nano-banana-2",
    displayName: "Nano Banana 2",
    type: "image",
    status: "available",
    billingUnit: "Per image",
    description: "Next-generation Nano Banana image model.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    type: "image",
    status: "available",
    billingUnit: "Per image",
    description: "OpenAI-compatible image generation model.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
  {
    id: "gpt-image-2-vip",
    displayName: "GPT Image 2 VIP",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "Premium tier of GPT Image 2.",
    supports: [...IMAGE_MODEL_SUPPORTS],
  },
];

/** Image models exposed in the Image Playground dropdown. */
export const IMAGE_PLAYGROUND_MODEL_IDS = [
  "nano-banana",
  "nano-banana-fast",
  "nano-banana-pro",
  "nano-banana-2",
  "gpt-image-2",
] as const;

export type ImagePlaygroundModelId = (typeof IMAGE_PLAYGROUND_MODEL_IDS)[number];

export const IMAGE_PLAYGROUND_SIZES = [
  "1024x1024",
  "1792x1024",
  "1024x1792",
] as const;

export type ImagePlaygroundSize = (typeof IMAGE_PLAYGROUND_SIZES)[number];

export const VIDEO_MODELS: ModelCatalogEntry[] = [
  {
    id: "veo",
    displayName: "Veo",
    type: "video",
    status: "coming_soon",
    billingUnit: "Per video",
    description: "Video generation model.",
  },
];

export const AVAILABLE_CHAT_MODEL_IDS = CHAT_MODELS.filter(
  (model) => model.status === "available"
).map((model) => model.id);

export function isAvailableChatModel(modelId: string): boolean {
  return AVAILABLE_CHAT_MODEL_IDS.includes(modelId);
}

export function isAvailableImageModel(
  modelId: string
): modelId is ImagePlaygroundModelId {
  return (IMAGE_PLAYGROUND_MODEL_IDS as readonly string[]).includes(modelId);
}
