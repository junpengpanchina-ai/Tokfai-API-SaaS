/**
 * Consumer-facing public model registry (SSOT for Models / Docs / Pricing copy).
 *
 * Runtime allowlist remains DMIT + Supabase (`enabled` / `visible`).
 * This file only controls what the consumer UI and docs advertise.
 *
 * Rules:
 * - `public` + `visible` → formal catalog cards
 * - `alias` + `visible` + `routesTo` → Compatibility aliases section only
 * - `internal` / `experimental` / `disabled` → never shown to consumers
 * - Rewrite-only ids (e.g. gpt-5.4-pro) are not listed on GET /v1/models → omit
 */

export type PublicModelStatus =
  | "public"
  | "alias"
  | "internal"
  | "experimental"
  | "disabled";

export type PublicModelFamily = "gpt" | "gemini" | "image" | "auto";

export type PublicModelGroupId =
  | "recommended"
  | "high_quality"
  | "image"
  | "aliases";

export type PublicModelTag =
  | "recommended"
  | "fast"
  | "best_quality"
  | "low_cost"
  | "image"
  | "vision"
  | "alias";

export type RecommendedEndpoint =
  | "/v1/chat/completions"
  | "/v1/responses"
  | "/v1/images/generations"
  | "/v1/chat/completions or /v1/responses"
  | "/v1/chat/completions or /v1beta";

export type PublicModel = {
  id: string;
  displayName: { zh: string; en: string };
  family: PublicModelFamily;
  status: PublicModelStatus;
  visible: boolean;
  group: PublicModelGroupId;
  recommendedEndpoint: RecommendedEndpoint;
  /** Required for alias cards — omit alias from UI when missing. */
  routesTo?: string;
  supportsChatCompletions: boolean;
  supportsResponses: boolean;
  supportsStreaming: boolean;
  supportsImageInput: boolean;
  supportsImageGeneration: boolean;
  beginnerFriendly?: boolean;
  tags: PublicModelTag[];
  descriptionZh: string;
  descriptionEn: string;
  bestForZh: string;
  bestForEn: string;
};

/** Docs / quickstart example model ids — must be public or listed alias. */
export const PUBLIC_DOC_EXAMPLE_MODELS = {
  chatCompletions: "auto-fast",
  responses: "gpt-5.5",
  image: "gpt-image-2",
  quickstart: "auto-fast",
} as const;

/**
 * Local allowlist mirroring GET /v1/models expectations for offline smoke.
 * Concrete chat/image ids + CATALOG_ALIAS_IDS from dmit-api modelAliases.ts.
 */
export const PUBLIC_MODELS_API_ALLOWLIST = [
  // concrete chat
  "gpt-5.4",
  "gpt-5.5",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
  // concrete image
  "gpt-image-2",
  "nano-banana-fast",
  "nano-banana",
  "nano-banana-2",
  // catalog aliases (listed on GET /v1/models)
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.1",
  "gpt-5.2",
] as const;

export const PUBLIC_MODEL_REGISTRY: PublicModel[] = [
  // —— Public chat ——
  {
    id: "gpt-5.4",
    displayName: { zh: "GPT 5.4", en: "GPT 5.4" },
    family: "gpt",
    status: "public",
    visible: true,
    group: "recommended",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["recommended"],
    descriptionZh: "通用高质量对话，适合大多数业务接入。",
    descriptionEn: "Strong general chat model for most integrations.",
    bestForZh: "通用对话与文本任务",
    bestForEn: "General chat and text tasks",
  },
  {
    id: "gpt-5.5",
    displayName: { zh: "GPT 5.5", en: "GPT 5.5" },
    family: "gpt",
    status: "public",
    visible: true,
    group: "recommended",
    recommendedEndpoint: "/v1/responses",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["recommended", "best_quality"],
    descriptionZh: "更高质量对话与复杂任务。推荐 Responses API。",
    descriptionEn: "Higher-quality chat for harder tasks. Prefer Responses API.",
    bestForZh: "复杂推理、代码、工具调用、Agent / Codex",
    bestForEn: "Complex reasoning, coding, tool calling, Agent / Codex",
  },
  {
    id: "gemini-3-flash",
    displayName: { zh: "Gemini 3 Flash", en: "Gemini 3 Flash" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "recommended",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["recommended", "fast"],
    descriptionZh: "更快的 Gemini 对话体验。",
    descriptionEn: "Faster Gemini chat experience.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-3-pro",
    displayName: { zh: "Gemini 3 Pro", en: "Gemini 3 Pro" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "recommended",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["recommended", "best_quality"],
    descriptionZh: "更高质量的 Gemini 推理与长文。",
    descriptionEn: "Higher-quality Gemini reasoning and long-form work.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-2.5-flash",
    displayName: { zh: "Gemini 2.5 Flash", en: "Gemini 2.5 Flash" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "recommended",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["fast", "low_cost"],
    descriptionZh: "稳定、成本友好的 Gemini Flash。",
    descriptionEn: "Stable, cost-friendly Gemini Flash.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-2.5-pro",
    displayName: { zh: "Gemini 2.5 Pro", en: "Gemini 2.5 Pro" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "high_quality",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["best_quality"],
    descriptionZh: "稳定的高质量 Gemini 文本模型。",
    descriptionEn: "Stable high-quality Gemini text model.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },

  // —— Public image ——
  {
    id: "nano-banana-fast",
    displayName: { zh: "nano-banana-fast", en: "nano-banana-fast" },
    family: "image",
    status: "public",
    visible: true,
    group: "image",
    recommendedEndpoint: "/v1/images/generations",
    supportsChatCompletions: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsImageInput: true,
    supportsImageGeneration: true,
    beginnerFriendly: true,
    tags: ["image", "fast", "recommended"],
    descriptionZh: "更快的图片生成，适合试跑与批量。",
    descriptionEn: "Faster image generation for trials and volume.",
    bestForZh: "文生图、参考图改图",
    bestForEn: "Text-to-image and reference edits",
  },
  {
    id: "nano-banana",
    displayName: { zh: "nano-banana", en: "nano-banana" },
    family: "image",
    status: "public",
    visible: true,
    group: "image",
    recommendedEndpoint: "/v1/images/generations",
    supportsChatCompletions: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsImageInput: true,
    supportsImageGeneration: true,
    beginnerFriendly: false,
    tags: ["image", "best_quality"],
    descriptionZh: "更高质量的图片生成。",
    descriptionEn: "Higher-quality image generation.",
    bestForZh: "文生图、参考图改图",
    bestForEn: "Text-to-image and reference edits",
  },
  {
    id: "nano-banana-2",
    displayName: { zh: "nano-banana-2", en: "nano-banana-2" },
    family: "image",
    status: "public",
    visible: true,
    group: "image",
    recommendedEndpoint: "/v1/images/generations",
    supportsChatCompletions: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsImageInput: true,
    supportsImageGeneration: true,
    beginnerFriendly: false,
    tags: ["image", "best_quality"],
    descriptionZh: "下一代 Nano Banana 图片模型。",
    descriptionEn: "Next-generation Nano Banana image model.",
    bestForZh: "文生图、参考图改图",
    bestForEn: "Text-to-image and reference edits",
  },
  {
    id: "gpt-image-2",
    displayName: { zh: "gpt-image-2", en: "gpt-image-2" },
    family: "image",
    status: "public",
    visible: true,
    group: "image",
    recommendedEndpoint: "/v1/images/generations",
    supportsChatCompletions: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsImageInput: true,
    supportsImageGeneration: true,
    beginnerFriendly: false,
    tags: ["image"],
    descriptionZh: "OpenAI 风格图片生成模型。",
    descriptionEn: "OpenAI-compatible image generation model.",
    bestForZh: "文生图、参考图改图",
    bestForEn: "Text-to-image and reference edits",
  },

  // —— Compatibility aliases (GET /v1/models catalog aliases only) ——
  {
    id: "auto-fast",
    displayName: { zh: "auto-fast", en: "auto-fast" },
    family: "auto",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gemini-3-flash → gemini-2.5-flash → gemini-3-pro",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["alias", "fast", "low_cost", "recommended"],
    descriptionZh: "推荐新手起步的智能路由别名。",
    descriptionEn: "Recommended starter smart-routing alias.",
    bestForZh: "智能路由与通用对话",
    bestForEn: "Smart routing and general chat",
  },
  {
    id: "auto-pro",
    displayName: { zh: "auto-pro", en: "auto-pro" },
    family: "auto",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gpt-5.5 → gpt-5.4 → gemini-3-pro",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["alias", "best_quality"],
    descriptionZh: "质量优先的智能路由别名。",
    descriptionEn: "Quality-first smart-routing alias.",
    bestForZh: "智能路由与高质量对话",
    bestForEn: "Smart routing and higher-quality chat",
  },
  {
    id: "auto-cheap",
    displayName: { zh: "auto-cheap", en: "auto-cheap" },
    family: "auto",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gemini-2.5-flash → gemini-3-flash",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["alias", "low_cost"],
    descriptionZh: "优先走更省算力积分的模型链。",
    descriptionEn: "Routes toward lower compute-credit model chains.",
    bestForZh: "智能路由与控成本试跑",
    bestForEn: "Smart routing and cost-sensitive trials",
  },
  {
    id: "gpt-5",
    displayName: { zh: "gpt-5", en: "gpt-5" },
    family: "gpt",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gpt-5.5 → gpt-5.4",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["alias"],
    descriptionZh: "智能路由别名，适合兼容旧客户端。",
    descriptionEn: "Smart-routing alias for older clients.",
    bestForZh: "智能路由与通用对话",
    bestForEn: "Smart routing and general chat",
  },
  {
    id: "gpt-5-chat",
    displayName: { zh: "gpt-5-chat", en: "gpt-5-chat" },
    family: "gpt",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gpt-5.5 → gpt-5.4",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["alias"],
    descriptionZh: "对话向兼容别名。",
    descriptionEn: "Chat-oriented compatibility alias.",
    bestForZh: "智能路由与通用对话",
    bestForEn: "Smart routing and general chat",
  },
  {
    id: "gpt-5-pro",
    displayName: { zh: "gpt-5-pro", en: "gpt-5-pro" },
    family: "gpt",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gpt-5.5 → gpt-5.4",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["alias", "best_quality"],
    descriptionZh: "质量优先的 GPT 别名。",
    descriptionEn: "Quality-first GPT alias.",
    bestForZh: "智能路由与高质量对话",
    bestForEn: "Smart routing and higher-quality chat",
  },
];

export function listPublicConsumerModels(): PublicModel[] {
  return PUBLIC_MODEL_REGISTRY.filter(
    (m) => m.visible && m.status === "public"
  );
}

export function listPublicConsumerAliases(): PublicModel[] {
  return PUBLIC_MODEL_REGISTRY.filter(
    (m) =>
      m.visible &&
      m.status === "alias" &&
      typeof m.routesTo === "string" &&
      m.routesTo.trim().length > 0
  );
}

export function listConsumerVisibleRegistryModels(): PublicModel[] {
  return [
    ...listPublicConsumerModels(),
    ...listPublicConsumerAliases(),
  ];
}

export function isConsumerPublicModelId(id: string): boolean {
  return listPublicConsumerModels().some((m) => m.id === id);
}

export function isConsumerAliasModelId(id: string): boolean {
  return listPublicConsumerAliases().some((m) => m.id === id);
}

export function isConsumerAllowedDocModelId(id: string): boolean {
  return isConsumerPublicModelId(id) || isConsumerAliasModelId(id);
}

export function summarizePublicRegistryStats(): {
  totalAvailable: number;
  chatCount: number;
  imageCount: number;
} {
  const models = listPublicConsumerModels();
  return {
    totalAvailable: models.length,
    chatCount: models.filter((m) => m.family !== "image").length,
    imageCount: models.filter((m) => m.family === "image").length,
  };
}
