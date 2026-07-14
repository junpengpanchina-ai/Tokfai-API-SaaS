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
  recommended: {
    title: { zh: "正式模型", en: "Public models" },
    description: {
      zh: "已上架、可稳定调用的正式模型。",
      en: "Listed models ready for production use.",
    },
  },
  high_quality: {
    title: { zh: "高质量模型", en: "High-quality models" },
    description: {
      zh: "追求更好效果时使用。",
      en: "Use when you need stronger quality.",
    },
  },
  image: {
    title: { zh: "图片模型", en: "Image models" },
    description: {
      zh: "文生图与参考图改图。按次扣算力积分。",
      en: "Text-to-image and reference edits. Charged per generation.",
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
  if (model.tags.includes("best_quality") && model.family === "gemini") {
    return "reasoning";
  }
  if (model.supportsImageInput) return "vision";
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
    recommendedEndpoint: model.recommendedEndpoint,
    bestFor: { zh: model.bestForZh, en: model.bestForEn },
    routesTo: model.routesTo,
  };
}

function buildPublicGroups(): ConsumerModelGroup[] {
  const publics = listPublicConsumerModels();
  const order: Array<Exclude<PublicModelGroupId, "aliases">> = [
    "recommended",
    "high_quality",
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
  .filter((m) => m.family === "image")
  .map((m) => m.id);
