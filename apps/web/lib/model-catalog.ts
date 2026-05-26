export type ModelType = "chat" | "image" | "video";

export type ModelStatus = "available" | "coming_soon";

export type PriceRangeYuan = {
  min: number;
  max: number;
};

export type ChatModelPricing = {
  mode: "token";
  inputPerMillionYuan: PriceRangeYuan;
  outputPerMillionYuan: PriceRangeYuan;
};

export type ImageModelPricing = {
  mode: "per_request";
  creditsPerRequest: number;
};

export type ModelPricing = ChatModelPricing | ImageModelPricing;

/** Reserved for future admin price management — display-only today. */
export type CatalogAdminMeta = {
  upstreamSource: "grsai";
  /** ISO date when catalog display prices were last updated. */
  priceSyncedAt: string;
  /** Reserved: admin can override catalog display without changing billing logic. */
  adminDisplayOverride?: {
    enabled: boolean;
    note?: string;
  };
};

export interface ModelCatalogEntry {
  id: string;
  displayName: string;
  type: ModelType;
  status: ModelStatus;
  billingUnit: string;
  description: string;
  pricing: ModelPricing;
  tags?: string[];
  catalogMeta?: CatalogAdminMeta;
  /** Image models only — capabilities shown on the Models page. */
  supports?: string[];
  /** Playground label for models with a dedicated UI. */
  playground?: string;
}

const CATALOG_PRICE_UPDATED_AT = "2026-05-26";

const catalogMeta = (): CatalogAdminMeta => ({
  upstreamSource: "grsai",
  priceSyncedAt: CATALOG_PRICE_UPDATED_AT,
});

function chatPricing(
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
): ChatModelPricing {
  return {
    mode: "token",
    inputPerMillionYuan: { min: inputMin, max: inputMax },
    outputPerMillionYuan: { min: outputMin, max: outputMax },
  };
}

function imagePricing(creditsPerRequest: number): ImageModelPricing {
  return {
    mode: "per_request",
    creditsPerRequest,
  };
}

const CHAT_BILLING_UNIT = "token";
const IMAGE_BILLING_UNIT = "per_generation";

export const CHAT_MODELS: ModelCatalogEntry[] = [
  {
    id: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Main premium chat model for high-quality completions.",
    pricing: chatPricing(1.5, 3, 7, 14),
    catalogMeta: catalogMeta(),
  },
  {
    id: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Gemini 3 Pro chat model for general-purpose conversations.",
    pricing: chatPricing(1.5, 3, 7, 14),
    catalogMeta: catalogMeta(),
  },
  {
    id: "gemini-3-flash",
    displayName: "Gemini 3 Flash",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Fast Gemini 3 chat model for low-latency responses.",
    pricing: chatPricing(0.4, 0.8, 3, 6),
    tags: ["Flash"],
    catalogMeta: catalogMeta(),
  },
  {
    id: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Latest Gemini 3.5 flash tier for responsive chat workloads.",
    pricing: chatPricing(1.2, 2.4, 10, 20),
    tags: ["Flash"],
    catalogMeta: catalogMeta(),
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Efficient Gemini 2.5 flash model for everyday chat.",
    pricing: chatPricing(0.3, 0.6, 2, 4),
    tags: ["Flash"],
    catalogMeta: catalogMeta(),
  },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Gemini 2.5 Pro for higher-quality chat completions.",
    pricing: chatPricing(1.25, 2.5, 6.25, 12.5),
    catalogMeta: catalogMeta(),
  },
  {
    id: "gpt-5.4",
    displayName: "GPT 5.4",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "GPT 5.4 chat model for OpenAI-compatible workloads.",
    pricing: chatPricing(0.7, 1.4, 6, 12),
    catalogMeta: catalogMeta(),
  },
  {
    id: "gpt-5.5",
    displayName: "GPT 5.5",
    type: "chat",
    status: "available",
    billingUnit: CHAT_BILLING_UNIT,
    description: "Premium GPT 5.5 chat model for demanding applications.",
    pricing: chatPricing(2.2, 4.4, 13.5, 27),
    catalogMeta: catalogMeta(),
  },
];

const IMAGE_MODEL_SUPPORTS = [
  "Text-to-image",
  "Image-to-image",
  "Uploaded image URLs",
] as const;

const IMAGE_MODEL_PLAYGROUND = "Image Playground";

export const IMAGE_MODELS: ModelCatalogEntry[] = [
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "OpenAI-compatible image generation model.",
    pricing: imagePricing(600),
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "gpt-image-2-vip",
    displayName: "GPT Image 2 VIP",
    type: "image",
    status: "coming_soon",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Premium tier of GPT Image 2.",
    pricing: imagePricing(1300),
    tags: ["VIP"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-fast",
    displayName: "Nano Banana Fast",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Fast image generation with lower latency.",
    pricing: imagePricing(440),
    tags: ["Fast"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana",
    displayName: "Nano Banana",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Image generation model.",
    pricing: imagePricing(1400),
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Higher-quality image generation model.",
    pricing: imagePricing(1800),
    tags: ["Pro"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-2",
    displayName: "Nano Banana 2",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Next-generation Nano Banana image model.",
    pricing: imagePricing(1200),
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-pro-vt",
    displayName: "Nano Banana Pro VT",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Nano Banana Pro variant for specialized image generation.",
    pricing: imagePricing(1800),
    tags: ["Pro", "VT"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-2-cl",
    displayName: "Nano Banana 2 CL",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Nano Banana 2 CL variant for advanced image workflows.",
    pricing: imagePricing(1600),
    tags: ["CL"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-2-4k-cl",
    displayName: "Nano Banana 2 4K CL",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "4K Nano Banana 2 CL image model.",
    pricing: imagePricing(3000),
    tags: ["4K", "CL"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-pro-cl",
    displayName: "Nano Banana Pro CL",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "Nano Banana Pro CL variant for premium image output.",
    pricing: imagePricing(6000),
    tags: ["Pro", "CL"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-pro-vip",
    displayName: "Nano Banana Pro VIP",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "VIP tier Nano Banana Pro image model.",
    pricing: imagePricing(10000),
    tags: ["Pro", "VIP"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
  },
  {
    id: "nano-banana-pro-4k-vip",
    displayName: "Nano Banana Pro 4K VIP",
    type: "image",
    status: "available",
    billingUnit: IMAGE_BILLING_UNIT,
    description: "4K VIP tier Nano Banana Pro image model.",
    pricing: imagePricing(16000),
    tags: ["Pro", "4K", "VIP"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    catalogMeta: catalogMeta(),
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
    pricing: imagePricing(0),
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

export function isChatModelEntry(
  model: ModelCatalogEntry
): model is ModelCatalogEntry & { pricing: ChatModelPricing } {
  return model.pricing.mode === "token";
}

export function isImageModelEntry(
  model: ModelCatalogEntry
): model is ModelCatalogEntry & { pricing: ImageModelPricing } {
  return model.pricing.mode === "per_request";
}

export function getImageModelById(modelId: string): ModelCatalogEntry | undefined {
  return IMAGE_MODELS.find((model) => model.id === modelId);
}

export function getImageModelCreditsPerRequest(modelId: string): number | null {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return null;
  }
  return entry.pricing.creditsPerRequest;
}
