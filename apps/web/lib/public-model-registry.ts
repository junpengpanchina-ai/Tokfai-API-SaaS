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
 * - Compat aliases (e.g. gpt-5.4-pro → gpt-5-pro) may be listed on GET /v1/models
 */

export type PublicModelStatus =
  | "public"
  | "alias"
  | "internal"
  | "experimental"
  | "disabled";

export type PublicModelFamily = "gpt" | "gemini" | "image" | "auto";

export type PublicModelGroupId =
  | "chat"
  | "vision"
  | "image"
  | "aliases";

export type PublicModelTag =
  | "recommended"
  | "fast"
  | "best_quality"
  | "low_cost"
  | "image"
  | "vision"
  | "alias"
  | "coming_soon";

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
  /** Shown but not callable (e.g. GPT Image coming soon). */
  comingSoon?: boolean;
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
  /** Recommended image model for docs — never a chat model. */
  image: "nano-banana",
  quickstart: "auto-fast",
} as const;

/**
 * Local allowlist mirroring GET /v1/models (chat clients).
 * Concrete chat ids + CATALOG_ALIAS_IDS from dmit-api modelAliases.ts.
 * Image-only models are omitted — they appear in Image Workbench / Image API docs.
 */
export const PUBLIC_MODELS_API_ALLOWLIST = [
  // concrete chat
  "gpt-5.4",
  "gpt-5.5",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
  // catalog aliases (listed on GET /v1/models)
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gpt-5.1",
  "gpt-5.2",
] as const;

export const PUBLIC_MODEL_REGISTRY: PublicModel[] = [
  // —— Chat Models ——
  {
    id: "gpt-5.4",
    displayName: { zh: "GPT 5.4", en: "GPT 5.4" },
    family: "gpt",
    status: "public",
    visible: true,
    group: "chat",
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
    group: "chat",
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

  // —— Vision Models (chat + image input; not image generation) ——
  {
    id: "gemini-3-flash",
    displayName: { zh: "Gemini 3 Flash", en: "Gemini 3 Flash" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "vision",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["recommended", "fast", "vision"],
    descriptionZh: "更快的 Gemini 对话体验，支持图片输入理解。",
    descriptionEn: "Faster Gemini chat with image-input understanding.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-3-pro",
    displayName: { zh: "Gemini 3 Pro", en: "Gemini 3 Pro" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "vision",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["recommended", "best_quality", "vision"],
    descriptionZh: "更高质量的 Gemini 推理与长文，支持图片输入。",
    descriptionEn: "Higher-quality Gemini reasoning and long-form work with vision.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-2.5-flash",
    displayName: { zh: "Gemini 2.5 Flash", en: "Gemini 2.5 Flash" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "vision",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["fast", "low_cost", "vision"],
    descriptionZh: "稳定、成本友好的 Gemini Flash，支持图片输入。",
    descriptionEn: "Stable, cost-friendly Gemini Flash with vision input.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },
  {
    id: "gemini-2.5-pro",
    displayName: { zh: "Gemini 2.5 Pro", en: "Gemini 2.5 Pro" },
    family: "gemini",
    status: "public",
    visible: true,
    group: "vision",
    recommendedEndpoint: "/v1/chat/completions or /v1beta",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    beginnerFriendly: false,
    tags: ["best_quality", "vision"],
    descriptionZh: "稳定的高质量 Gemini 文本与视觉理解模型。",
    descriptionEn: "Stable high-quality Gemini text and vision model.",
    bestForZh: "长文本、多模态输入",
    bestForEn: "Long text and multimodal input",
  },

  // —— Image Generation Models (Image API only — never listed as chat models) ——
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
    beginnerFriendly: true,
    tags: ["image", "recommended"],
    descriptionZh:
      "推荐图片模型。提交后返回 task_id，轮询任务查询获取结果；成功才扣费，失败/超时不扣费。",
    descriptionEn:
      "Recommended image model. Submit returns task_id; poll for results. Billed on success only — failures/timeouts are not charged.",
    bestForZh: "电商主图、批量实拍图/换图、培训二创",
    bestForEn: "Ecommerce creatives, batch product shots, training remixes",
  },
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
    tags: ["image", "fast", "low_cost"],
    descriptionZh:
      "轻量快图，成本更低。异步提交 → task_id → 轮询结果；成功才扣费。",
    descriptionEn:
      "Lightweight fast images at lower cost. Async submit → task_id → poll. Billed on success only.",
    bestForZh: "试跑、大批量低成本出图",
    bestForEn: "Trials and high-volume low-cost generation",
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
    descriptionZh:
      "更高质量、更稳定的图片模型。异步任务面：task_id 轮询；成功才扣费。",
    descriptionEn:
      "Higher quality and more stable images. Async task surface with task_id polling; billed on success only.",
    bestForZh: "高质量主图、品牌视觉、稳定批量出图",
    bestForEn: "Premium creatives and stable batch image jobs",
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
    supportsImageInput: false,
    supportsImageGeneration: true,
    beginnerFriendly: false,
    tags: ["image"],
    descriptionZh:
      "兼容风格图片模型。仅 /v1/images/generations：task_id 轮询；成功才扣费。不可用于 Chat。",
    descriptionEn:
      "Compatible-style image model. Image API only: task_id polling; billed on success. Not for Chat.",
    bestForZh: "通用文生图、兼容客户端接入",
    bestForEn: "General text-to-image and compatible client integrations",
  },
  {
    id: "gpt-image-2-vip",
    displayName: { zh: "gpt-image-2-vip", en: "gpt-image-2-vip" },
    family: "image",
    status: "public",
    visible: true,
    group: "image",
    recommendedEndpoint: "/v1/images/generations",
    supportsChatCompletions: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsImageInput: false,
    supportsImageGeneration: true,
    beginnerFriendly: false,
    tags: ["image", "best_quality"],
    descriptionZh:
      "VIP 兼容风格图片模型。仅 /v1/images/generations；成功才扣费。不可用于 Chat。",
    descriptionEn:
      "VIP compatible-style image model. Image API only; billed on success. Not for Chat.",
    bestForZh: "更高规格兼容文生图",
    bestForEn: "Higher-tier compatible text-to-image",
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
    displayName: { zh: "Tokfai GPT-5 Pro", en: "Tokfai GPT-5 Pro" },
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
  {
    id: "gpt-5.4-pro",
    displayName: { zh: "Tokfai GPT-5.4 Pro", en: "Tokfai GPT-5.4 Pro" },
    family: "gpt",
    status: "alias",
    visible: true,
    group: "aliases",
    recommendedEndpoint: "/v1/chat/completions or /v1/responses",
    routesTo: "gpt-5-pro",
    supportsChatCompletions: true,
    supportsResponses: true,
    supportsStreaming: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    beginnerFriendly: true,
    tags: ["alias", "best_quality"],
    descriptionZh: "Cherry Studio / Codex 常用名，兼容映射到 gpt-5-pro。",
    descriptionEn: "Common Cherry Studio / Codex name; maps to gpt-5-pro.",
    bestForZh: "第三方客户端兼容",
    bestForEn: "Third-party client compatibility",
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
    totalAvailable: models.filter((m) => !m.comingSoon).length,
    chatCount: models.filter(
      (m) => m.family !== "image" && !m.comingSoon
    ).length,
    imageCount: models.filter(
      (m) => m.family === "image" && !m.comingSoon && m.supportsImageGeneration
    ).length,
  };
}
