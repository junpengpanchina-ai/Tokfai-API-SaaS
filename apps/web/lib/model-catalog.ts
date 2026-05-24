export type ModelType = "chat" | "image" | "video";

export type ModelStatus = "available" | "coming_soon";

export interface ModelCatalogEntry {
  id: string;
  displayName: string;
  type: ModelType;
  status: ModelStatus;
  billingUnit: string;
  description: string;
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

export const IMAGE_MODELS: ModelCatalogEntry[] = [
  {
    id: "nano-banana",
    displayName: "Nano Banana",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "Image generation model.",
  },
  {
    id: "nano-banana-fast",
    displayName: "Nano Banana Fast",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "Fast image generation with lower latency.",
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "Higher-quality image generation model.",
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "OpenAI-compatible image generation model.",
  },
  {
    id: "gpt-image-2-vip",
    displayName: "GPT Image 2 VIP",
    type: "image",
    status: "coming_soon",
    billingUnit: "Per image",
    description: "Premium tier of GPT Image 2.",
  },
];

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
