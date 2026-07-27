/**
 * Consumer-facing model presentation groups for /dashboard/models.
 * Derived from `public-model-registry.ts` — do not hardcode model ids here.
 */

import {
  listPublicConsumerAliases,
  listPublicConsumerModels,
  type PublicModel,
  type PublicModelGroupId,
  type PublicModelTag,
} from "@/lib/public-model-registry";

export type ConsumerModelCapabilityTag = PublicModelTag;

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
  comingSoon: boolean;
  recommendedEndpoint: string;
  bestFor: { zh: string; en: string };
  /** Alias / routing target note for consumers. */
  routesTo?: string;
};

export type ConsumerModelGroupId = PublicModelGroupId;

export type ConsumerModelGroup = {
  id: ConsumerModelGroupId;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  models: ConsumerModelCard[];
};

const GROUP_META: Record<
  Exclude<PublicModelGroupId, "aliases">,
  { title: { zh: string; en: string }; description: { zh: string; en: string } }
> = {
  chat: {
    title: { zh: "对话模型", en: "Chat Models" },
    description: {
      zh: "GPT 等文本对话模型，走 /v1/chat/completions 或 /v1/responses。不可用于图片生成。",
      en: "GPT and other text chat models via /v1/chat/completions or /v1/responses. Not for image generation.",
    },
  },
  vision: {
    title: { zh: "视觉模型", en: "Vision Models" },
    description: {
      zh: "支持图片输入理解的对话模型（如 Gemini）。用于 chat/responses，不是文生图。",
      en: "Chat models with image-input understanding (e.g. Gemini). For chat/responses — not text-to-image.",
    },
  },
  image: {
    title: { zh: "图片生成模型", en: "Image Generation Models" },
    description: {
      zh: "Nano Banana 仅走 POST /v1/images/generations：submit 返回 task_id，轮询 GET。成功才扣费。不可用于 /v1/chat/completions；GPT/Gemini 文本模型不可用于 images/generations。",
      en: "Nano Banana via POST /v1/images/generations only: submit returns task_id; poll GET. Billed on success. Not for chat; GPT/Gemini text models cannot use images/generations.",
    },
  },
};

const ALIASES_META = {
  title: { zh: "兼容别名", en: "Compatibility aliases" },
  description: {
    zh: "用于兼容迁移，实际会路由到对应正式模型。",
    en: "For compatibility migrations; requests route to the listed public models.",
  },
} as const;

function kindForModel(model: PublicModel): ConsumerModelCard["kind"] {
  if (model.status === "alias") return "alias";
  if (model.family === "image") return "image";
  if (model.group === "vision" || model.supportsImageInput) return "vision";
  if (model.tags.includes("best_quality") && model.family === "gemini") {
    return "reasoning";
  }
  return "chat";
}

function toCard(model: PublicModel): ConsumerModelCard {
  return {
    id: model.id,
    displayName: model.displayName,
    oneLiner: { zh: model.descriptionZh, en: model.descriptionEn },
    kind: kindForModel(model),
    tags: model.tags,
    supportsChatCompletions: model.supportsChatCompletions,
    supportsResponses: model.supportsResponses,
    supportsStream: model.supportsStreaming,
    supportsImageInput: model.supportsImageInput,
    beginnerFriendly: Boolean(model.beginnerFriendly),
    comingSoon: Boolean(model.comingSoon),
    recommendedEndpoint: model.recommendedEndpoint,
    bestFor: { zh: model.bestForZh, en: model.bestForEn },
    routesTo: model.routesTo,
  };
}

function buildPublicGroups(): ConsumerModelGroup[] {
  const publics = listPublicConsumerModels();
  const order: Array<Exclude<PublicModelGroupId, "aliases">> = [
    "chat",
    "vision",
    "image",
  ];
  const groups: ConsumerModelGroup[] = [];
  for (const id of order) {
    const models = publics.filter((m) => m.group === id).map(toCard);
    if (models.length === 0) continue;
    groups.push({
      id,
      title: GROUP_META[id].title,
      description: GROUP_META[id].description,
      models,
    });
  }
  return groups;
}

function buildAliasGroup(): ConsumerModelGroup | null {
  const models = listPublicConsumerAliases().map(toCard);
  if (models.length === 0) return null;
  return {
    id: "aliases",
    title: ALIASES_META.title,
    description: ALIASES_META.description,
    models,
  };
}

/** Public model groups first; aliases always last and never mixed in. */
export const CONSUMER_MODEL_GROUPS: ConsumerModelGroup[] = (() => {
  const groups = buildPublicGroups();
  const aliases = buildAliasGroup();
  if (aliases) groups.push(aliases);
  return groups;
})();

export const CONSUMER_VISIBLE_IMAGE_MODEL_IDS = listPublicConsumerModels()
  .filter(
    (m) =>
      m.family === "image" &&
      !m.comingSoon &&
      m.supportsImageGeneration
  )
  .map((m) => m.id);
