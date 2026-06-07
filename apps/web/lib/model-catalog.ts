export type ModelType = "chat" | "image" | "video";

export type ModelStatus = "available" | "coming_soon";

/** Dashboard Models page filter tabs (display-only navigation). */
export type ModelCategory =
  | "recommended"
  | "chat"
  | "image"
  | "fast"
  | "high_quality"
  | "low_cost"
  | "coming_soon";

export const MODEL_CATEGORY_TABS: ModelCategory[] = [
  "recommended",
  "chat",
  "image",
  "fast",
  "high_quality",
  "low_cost",
  "coming_soon",
];

/** Display-only speed / quality / cost positioning for model cards. */
export type ModelTraitLevel = "high" | "medium" | "low";

export type ModelTraits = {
  speed: ModelTraitLevel;
  quality: ModelTraitLevel;
  cost: ModelTraitLevel;
};

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
  /** Display-only RMB reference range per generation. */
  referenceYuanPerRequest: PriceRangeYuan;
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
  /** Speed / quality / cost positioning shown on model cards. */
  traits?: ModelTraits;
  tags?: string[];
  /** Dashboard filter tabs — type and coming_soon are merged in resolveModelCategories. */
  categories?: ModelCategory[];
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

/** Display-only anchor: nano-banana 1,400 credits ≈ ¥0.07~¥0.14 / generation. */
const IMAGE_REFERENCE_YUAN_MIN_PER_CREDIT = 0.07 / 1400;
const IMAGE_REFERENCE_YUAN_MAX_PER_CREDIT = 0.14 / 1400;

function roundReferenceYuan(value: number): number {
  if (value >= 1) {
    return Math.round(value * 100) / 100;
  }
  if (value >= 0.1) {
    return Math.round(value * 1000) / 1000;
  }
  return Math.round(value * 10000) / 10000;
}

function imagePricing(
  creditsPerRequest: number,
  referenceYuanOverride?: PriceRangeYuan
): ImageModelPricing {
  return {
    mode: "per_request",
    creditsPerRequest,
    referenceYuanPerRequest: referenceYuanOverride ?? {
      min: roundReferenceYuan(
        creditsPerRequest * IMAGE_REFERENCE_YUAN_MIN_PER_CREDIT
      ),
      max: roundReferenceYuan(
        creditsPerRequest * IMAGE_REFERENCE_YUAN_MAX_PER_CREDIT
      ),
    },
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    categories: ["recommended", "high_quality"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    categories: ["high_quality"],
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
    traits: { speed: "high", quality: "medium", cost: "low" },
    tags: ["Flash"],
    categories: ["recommended", "fast", "low_cost"],
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
    traits: { speed: "high", quality: "medium", cost: "medium" },
    tags: ["Flash"],
    categories: ["fast"],
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
    traits: { speed: "high", quality: "medium", cost: "low" },
    tags: ["Flash"],
    categories: ["fast", "low_cost"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    categories: ["high_quality"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    categories: [],
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
    traits: { speed: "low", quality: "high", cost: "high" },
    categories: ["high_quality"],
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
    traits: { speed: "medium", quality: "high", cost: "low" },
    categories: ["recommended"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    tags: ["VIP"],
    categories: ["high_quality"],
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
    traits: { speed: "high", quality: "medium", cost: "low" },
    tags: ["Fast"],
    categories: ["recommended", "fast", "low_cost"],
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
    traits: { speed: "medium", quality: "medium", cost: "medium" },
    categories: ["recommended", "low_cost"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    tags: ["Pro"],
    categories: ["high_quality"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    categories: ["high_quality"],
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    tags: ["Pro", "VT"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
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
    traits: { speed: "medium", quality: "high", cost: "medium" },
    tags: ["CL"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
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
    traits: { speed: "low", quality: "high", cost: "high" },
    tags: ["4K", "CL"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
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
    traits: { speed: "low", quality: "high", cost: "high" },
    tags: ["Pro", "CL"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
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
    traits: { speed: "low", quality: "high", cost: "high" },
    tags: ["Pro", "VIP"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
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
    traits: { speed: "low", quality: "high", cost: "high" },
    tags: ["Pro", "4K", "VIP"],
    categories: ["high_quality"],
    supports: [...IMAGE_MODEL_SUPPORTS],
    playground: IMAGE_MODEL_PLAYGROUND,
    catalogMeta: catalogMeta(),
  },
];

/** Image models exposed in the Image Playground dropdown. */
export const IMAGE_PLAYGROUND_MODEL_IDS = IMAGE_MODELS.filter(
  (model) => model.status === "available"
).map((model) => model.id);

export type ImagePlaygroundModelId = string;

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
    traits: { speed: "low", quality: "medium", cost: "high" },
  },
];

/** Full catalog for admin read-only views. */
export const ALL_CATALOG_MODELS: ModelCatalogEntry[] = [
  ...CHAT_MODELS,
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
];

/** Dashboard Models page — same order as the full catalog. */
export const DASHBOARD_CATALOG_MODELS: ModelCatalogEntry[] = ALL_CATALOG_MODELS;

export function resolveModelCategories(model: ModelCatalogEntry): ModelCategory[] {
  const set = new Set<ModelCategory>(model.categories ?? []);
  if (model.type === "chat") {
    set.add("chat");
  }
  if (model.type === "image") {
    set.add("image");
  }
  if (model.status === "coming_soon") {
    set.add("coming_soon");
  }
  return MODEL_CATEGORY_TABS.filter((category) => set.has(category));
}

export function filterDashboardModelsByCategory(
  category: ModelCategory,
  models: ModelCatalogEntry[] = DASHBOARD_CATALOG_MODELS
): ModelCatalogEntry[] {
  return models.filter((model) => resolveModelCategories(model).includes(category));
}

/** Image tab sub-groups on the dashboard Models page (display-only). */
export type ImageDisplayGroup =
  | "basic"
  | "fast_low_cost"
  | "high_quality"
  | "coming_soon";

export const IMAGE_DISPLAY_GROUP_ORDER: ImageDisplayGroup[] = [
  "basic",
  "fast_low_cost",
  "high_quality",
  "coming_soon",
];

export function resolveImageDisplayGroup(
  model: ModelCatalogEntry
): ImageDisplayGroup | null {
  if (model.type !== "image") {
    return null;
  }
  if (model.status === "coming_soon") {
    return "coming_soon";
  }
  if (model.categories?.includes("high_quality")) {
    return "high_quality";
  }
  if (model.categories?.includes("fast")) {
    return "fast_low_cost";
  }
  return "basic";
}

export function groupImageModelsByDisplayGroup(
  models: ModelCatalogEntry[]
): { group: ImageDisplayGroup; models: ModelCatalogEntry[] }[] {
  const byGroup = new Map<ImageDisplayGroup, ModelCatalogEntry[]>();
  for (const group of IMAGE_DISPLAY_GROUP_ORDER) {
    byGroup.set(group, []);
  }
  for (const model of models) {
    const group = resolveImageDisplayGroup(model);
    if (group) {
      byGroup.get(group)!.push(model);
    }
  }
  return IMAGE_DISPLAY_GROUP_ORDER.map((group) => ({
    group,
    models: byGroup.get(group) ?? [],
  })).filter((entry) => entry.models.length > 0);
}

export type DashboardUseCaseId =
  | "chat_general"
  | "fast_low_cost_chat"
  | "text_to_image"
  | "high_quality_image";

export type DashboardUseCasePlayground = "chat" | "image";

export type DashboardUseCaseEntry = {
  id: DashboardUseCaseId;
  recommendedModelIds: string[];
  playground: DashboardUseCasePlayground;
  /** Default model id passed as ?model= on the playground link. */
  defaultModelId: string;
};

/** Top-of-page use-case shortcuts on /dashboard/models (display-only). */
export const DASHBOARD_USE_CASES: DashboardUseCaseEntry[] = [
  {
    id: "chat_general",
    recommendedModelIds: ["gemini-3.1-pro"],
    playground: "chat",
    defaultModelId: "gemini-3.1-pro",
  },
  {
    id: "fast_low_cost_chat",
    recommendedModelIds: ["gemini-3-flash", "gemini-3.5-flash"],
    playground: "chat",
    defaultModelId: "gemini-3-flash",
  },
  {
    id: "text_to_image",
    recommendedModelIds: ["gpt-image-2", "nano-banana-fast"],
    playground: "image",
    defaultModelId: "gpt-image-2",
  },
  {
    id: "high_quality_image",
    recommendedModelIds: ["nano-banana-2-cl", "nano-banana-pro-cl"],
    playground: "image",
    defaultModelId: "nano-banana-2-cl",
  },
];

export function modelMatchesDashboardCategory(
  model: ModelCatalogEntry,
  category: ModelCategory
): boolean {
  return resolveModelCategories(model).includes(category);
}

export type AdminCatalogDisplayStatus = ModelStatus | "hidden";

export type AdminCatalogPlaygroundLabel =
  | "Chat Playground"
  | "Image Playground"
  | "Not available";

export function getAdminCatalogDisplayStatus(
  model: ModelCatalogEntry
): AdminCatalogDisplayStatus {
  const override = model.catalogMeta?.adminDisplayOverride;
  if (override && override.enabled === false) {
    return "hidden";
  }
  return model.status;
}

export function isCatalogFrontendVisible(model: ModelCatalogEntry): boolean {
  return getAdminCatalogDisplayStatus(model) !== "hidden";
}

export function getAdminCatalogPlaygroundLabel(
  model: ModelCatalogEntry
): AdminCatalogPlaygroundLabel {
  if (getAdminCatalogDisplayStatus(model) !== "available") {
    return "Not available";
  }
  if (model.type === "chat") {
    return "Chat Playground";
  }
  if (model.type === "image") {
    return "Image Playground";
  }
  return "Not available";
}

/** True when a catalog model can open Chat or Image Playground from the Models page. */
export function isCatalogModelPlaygroundAvailable(model: ModelCatalogEntry): boolean {
  if (!isCatalogFrontendVisible(model)) {
    return false;
  }
  if (model.status !== "available") {
    return false;
  }
  return model.type === "chat" || model.type === "image";
}

export const AVAILABLE_CHAT_MODEL_IDS = CHAT_MODELS.filter(
  (model) => model.status === "available"
).map((model) => model.id);

export function isAvailableChatModel(modelId: string): boolean {
  return AVAILABLE_CHAT_MODEL_IDS.includes(modelId);
}

export function isAvailableImageModel(modelId: string): boolean {
  return IMAGE_PLAYGROUND_MODEL_IDS.includes(modelId);
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

export function getChatModelById(modelId: string): ModelCatalogEntry | undefined {
  return CHAT_MODELS.find((model) => model.id === modelId);
}

export function getCatalogModelById(modelId: string): ModelCatalogEntry | undefined {
  return ALL_CATALOG_MODELS.find((model) => model.id === modelId);
}

export function getImageModelCreditsPerRequest(modelId: string): number | null {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return null;
  }
  return entry.pricing.creditsPerRequest;
}
