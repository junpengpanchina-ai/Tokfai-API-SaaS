/**
 * Consumer-facing model presentation groups for /dashboard/models.
 * Capabilities only — pricing lives on /pricing; integration on /docs.
 */

export type ConsumerModelCapabilityTag =
  | "recommended"
  | "fast"
  | "best_quality"
  | "low_cost"
  | "image"
  | "vision"
  | "alias";

export type ConsumerModelCard = {
  id: string;
  displayName: { zh: string; en: string };
  oneLiner: { zh: string; en: string };
  kind: "chat" | "reasoning" | "vision" | "image" | "alias";
  tags: ConsumerModelCapabilityTag[];
  supportsChatCompletions: boolean;
  supportsResponses: boolean;
  supportsStream: boolean;
  supportsImageInput: boolean;
  beginnerFriendly: boolean;
  /** Alias / routing target note for consumers. */
  routesTo?: string;
};

export type ConsumerModelGroupId =
  | "recommended"
  | "low_cost"
  | "high_quality"
  | "image"
  | "aliases";

export type ConsumerModelGroup = {
  id: ConsumerModelGroupId;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  models: ConsumerModelCard[];
};

export const CONSUMER_MODEL_GROUPS: ConsumerModelGroup[] = [
  {
    id: "recommended",
    title: { zh: "推荐模型", en: "Recommended" },
    description: {
      zh: "新手优先：日常对话与通用任务。",
      en: "Start here for everyday chat and general tasks.",
    },
    models: [
      {
        id: "gpt-5.4",
        displayName: { zh: "GPT 5.4", en: "GPT 5.4" },
        oneLiner: {
          zh: "通用高质量对话，适合大多数业务接入。",
          en: "Strong general chat model for most integrations.",
        },
        kind: "chat",
        tags: ["recommended"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
      },
      {
        id: "gpt-5.5",
        displayName: { zh: "GPT 5.5", en: "GPT 5.5" },
        oneLiner: {
          zh: "更高质量对话与复杂任务。",
          en: "Higher-quality chat for harder tasks.",
        },
        kind: "chat",
        tags: ["recommended", "best_quality"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
      },
      {
        id: "gemini-3-flash",
        displayName: { zh: "Gemini 3 Flash", en: "Gemini 3 Flash" },
        oneLiner: {
          zh: "更快的 Gemini 对话体验。",
          en: "Faster Gemini chat experience.",
        },
        kind: "chat",
        tags: ["recommended", "fast"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: true,
        beginnerFriendly: true,
      },
      {
        id: "gemini-3-pro",
        displayName: { zh: "Gemini 3 Pro", en: "Gemini 3 Pro" },
        oneLiner: {
          zh: "更高质量的 Gemini 推理与长文。",
          en: "Higher-quality Gemini reasoning and long-form work.",
        },
        kind: "reasoning",
        tags: ["recommended", "best_quality"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: true,
        beginnerFriendly: false,
      },
    ],
  },
  {
    id: "low_cost",
    title: { zh: "低成本模型", en: "Low-cost models" },
    description: {
      zh: "智能路由别名，适合控成本与快速试跑。",
      en: "Smart-routing aliases for cost control and quick tests.",
    },
    models: [
      {
        id: "auto-cheap",
        displayName: { zh: "auto-cheap", en: "auto-cheap" },
        oneLiner: {
          zh: "优先走更省算力积分的模型链。",
          en: "Routes toward lower compute-credit model chains.",
        },
        kind: "alias",
        tags: ["low_cost", "alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
      },
      {
        id: "auto-fast",
        displayName: { zh: "auto-fast", en: "auto-fast" },
        oneLiner: {
          zh: "推荐新手起步的智能路由别名。",
          en: "Recommended starter smart-routing alias.",
        },
        kind: "alias",
        tags: ["fast", "low_cost", "recommended", "alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
      },
    ],
  },
  {
    id: "high_quality",
    title: { zh: "高质量模型", en: "High-quality models" },
    description: {
      zh: "追求更好效果时使用（含质量别名）。",
      en: "Use when you need stronger quality (includes quality aliases).",
    },
    models: [
      {
        id: "gpt-5-pro",
        displayName: { zh: "gpt-5-pro", en: "gpt-5-pro" },
        oneLiner: {
          zh: "质量优先的 GPT 别名（路由到高质量 GPT 链）。",
          en: "Quality-first GPT alias (routes to the strong GPT chain).",
        },
        kind: "alias",
        tags: ["best_quality", "alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: false,
        routesTo: "gpt-5.5 → gpt-5.4",
      },
      {
        id: "gpt-5.5-pro",
        displayName: { zh: "gpt-5.5-pro", en: "gpt-5.5-pro" },
        oneLiner: {
          zh: "兼容别名，映射到 gpt-5.5。",
          en: "Compatibility alias mapped to gpt-5.5.",
        },
        kind: "alias",
        tags: ["best_quality", "alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: false,
        routesTo: "gpt-5.5",
      },
      {
        id: "gemini-2.5-pro",
        displayName: { zh: "Gemini 2.5 Pro", en: "Gemini 2.5 Pro" },
        oneLiner: {
          zh: "稳定的高质量 Gemini 文本模型。",
          en: "Stable high-quality Gemini text model.",
        },
        kind: "reasoning",
        tags: ["best_quality"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: true,
        beginnerFriendly: false,
      },
    ],
  },
  {
    id: "image",
    title: { zh: "图片模型", en: "Image models" },
    description: {
      zh: "文生图与参考图改图。按次扣算力积分。",
      en: "Text-to-image and reference edits. Charged per generation.",
    },
    models: [
      {
        id: "nano-banana-fast",
        displayName: { zh: "nano-banana-fast", en: "nano-banana-fast" },
        oneLiner: {
          zh: "更快的图片生成，适合试跑与批量。",
          en: "Faster image generation for trials and volume.",
        },
        kind: "image",
        tags: ["image", "fast", "recommended"],
        supportsChatCompletions: false,
        supportsResponses: false,
        supportsStream: false,
        supportsImageInput: true,
        beginnerFriendly: true,
      },
      {
        id: "nano-banana",
        displayName: { zh: "nano-banana", en: "nano-banana" },
        oneLiner: {
          zh: "更高质量的图片生成。",
          en: "Higher-quality image generation.",
        },
        kind: "image",
        tags: ["image", "best_quality"],
        supportsChatCompletions: false,
        supportsResponses: false,
        supportsStream: false,
        supportsImageInput: true,
        beginnerFriendly: false,
      },
      {
        id: "nano-banana-2",
        displayName: { zh: "nano-banana-2", en: "nano-banana-2" },
        oneLiner: {
          zh: "下一代 Nano Banana 图片模型。",
          en: "Next-generation Nano Banana image model.",
        },
        kind: "image",
        tags: ["image", "best_quality"],
        supportsChatCompletions: false,
        supportsResponses: false,
        supportsStream: false,
        supportsImageInput: true,
        beginnerFriendly: false,
      },
      {
        id: "gpt-image-2",
        displayName: { zh: "gpt-image-2", en: "gpt-image-2" },
        oneLiner: {
          zh: "OpenAI 风格图片生成模型。",
          en: "OpenAI-style image generation model.",
        },
        kind: "image",
        tags: ["image"],
        supportsChatCompletions: false,
        supportsResponses: false,
        supportsStream: false,
        supportsImageInput: true,
        beginnerFriendly: false,
      },
    ],
  },
  {
    id: "aliases",
    title: { zh: "兼容模型别名", en: "Compatibility aliases" },
    description: {
      zh: "方便旧配置迁移；实际路由到已验收模型。",
      en: "For migrating older configs; routes to verified models.",
    },
    models: [
      {
        id: "gpt-5",
        displayName: { zh: "gpt-5", en: "gpt-5" },
        oneLiner: {
          zh: "智能路由别名，适合兼容旧客户端。",
          en: "Smart-routing alias for older clients.",
        },
        kind: "alias",
        tags: ["alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
      },
      {
        id: "gpt-5-chat",
        displayName: { zh: "gpt-5-chat", en: "gpt-5-chat" },
        oneLiner: {
          zh: "对话向兼容别名。",
          en: "Chat-oriented compatibility alias.",
        },
        kind: "alias",
        tags: ["alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: true,
        routesTo: "gpt-5.5 → gpt-5.4",
      },
      {
        id: "gpt-5.4-pro",
        displayName: { zh: "gpt-5.4-pro", en: "gpt-5.4-pro" },
        oneLiner: {
          zh: "映射到 gpt-5.4 的兼容别名。",
          en: "Compatibility alias mapped to gpt-5.4.",
        },
        kind: "alias",
        tags: ["alias"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: false,
        routesTo: "gpt-5.4",
      },
      {
        id: "gpt-5.5-pro",
        displayName: { zh: "gpt-5.5-pro", en: "gpt-5.5-pro" },
        oneLiner: {
          zh: "映射到 gpt-5.5 的兼容别名。",
          en: "Compatibility alias mapped to gpt-5.5.",
        },
        kind: "alias",
        tags: ["alias", "best_quality"],
        supportsChatCompletions: true,
        supportsResponses: true,
        supportsStream: true,
        supportsImageInput: false,
        beginnerFriendly: false,
        routesTo: "gpt-5.5",
      },
    ],
  },
];

export const CONSUMER_VISIBLE_IMAGE_MODEL_IDS = [
  "nano-banana-fast",
  "nano-banana",
  "nano-banana-2",
  "gpt-image-2",
] as const;
