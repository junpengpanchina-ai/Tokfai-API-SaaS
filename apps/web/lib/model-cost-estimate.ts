import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  DASHBOARD_CATALOG_MODELS,
  isChatModelEntry,
  isImageModelEntry,
  type ModelCatalogEntry,
} from "@/lib/model-catalog";
import {
  resolveDbChatCredits,
  resolveDbImageCredits,
} from "@/lib/model-pricing-display";
import { TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";

/** Display-only conversion for /dashboard/models estimates. */
export const CREDITS_PER_YUAN = 1000;
export const YUAN_PER_CREDIT = 0.001;

export const SHORT_CHAT_INPUT_TOKENS = 1000;
export const SHORT_CHAT_OUTPUT_TOKENS = 1000;
export const LONG_CHAT_INPUT_TOKENS = 10_000;
export const LONG_CHAT_OUTPUT_TOKENS = 3000;

export interface EstimateRechargePlan {
  planId: string;
  label: string;
  amountLabel: string;
  credits: number;
}

/** Static plan credits for package usage estimates (read-only display). */
export const ESTIMATE_RECHARGE_PLANS: EstimateRechargePlan[] = [
  { planId: "starter", label: "Starter", amountLabel: "¥29.9", credits: 10_000 },
  {
    planId: "starter-plus",
    label: "Starter Plus",
    amountLabel: "Starter Plus",
    credits: 25_000,
  },
  { planId: "pro", label: "Pro", amountLabel: "¥99.9", credits: 60_000 },
  { planId: "business", label: "Business", amountLabel: "¥299", credits: 260_000 },
];

export interface PackageUsageEstimateRow {
  planLabel: string;
  amountLabel: string;
  credits: number;
  shortChatCountLabel: string;
  imageGenerationCountLabel: string;
}

export function getDefaultAvailableImageModel(): ModelCatalogEntry | null {
  return (
    DASHBOARD_CATALOG_MODELS.find(
      (model) => model.type === "image" && model.status === "available"
    ) ?? null
  );
}

export function getDefaultChatModel(): ModelCatalogEntry | null {
  const recommended = DASHBOARD_CATALOG_MODELS.find(
    (model) => model.id === TOKFAI_RECOMMENDED_MODEL
  );
  if (recommended) return recommended;
  return (
    DASHBOARD_CATALOG_MODELS.find(
      (model) => model.type === "chat" && model.status === "available"
    ) ?? null
  );
}

export function resolveImageCreditsPerGeneration(
  model: ModelCatalogEntry,
  dbPricing: CatalogModelPricingItem | null
): number | null {
  if (!isImageModelEntry(model)) return null;
  const dbCredits = resolveDbImageCredits(dbPricing, model.type);
  if (dbCredits != null) return dbCredits;
  return model.pricing.creditsPerRequest > 0
    ? model.pricing.creditsPerRequest
    : null;
}

export function resolveChatCreditsPerMillion(
  model: ModelCatalogEntry,
  dbPricing: CatalogModelPricingItem | null
): { inputPerMillion: number; outputPerMillion: number } | null {
  if (!isChatModelEntry(model)) return null;

  const dbChat = resolveDbChatCredits(dbPricing, model.type);
  if (dbChat) return dbChat;

  const inputMid =
    (model.pricing.inputPerMillionYuan.min +
      model.pricing.inputPerMillionYuan.max) /
    2;
  const outputMid =
    (model.pricing.outputPerMillionYuan.min +
      model.pricing.outputPerMillionYuan.max) /
    2;

  if (inputMid <= 0 && outputMid <= 0) return null;

  return {
    inputPerMillion: inputMid * CREDITS_PER_YUAN,
    outputPerMillion: outputMid * CREDITS_PER_YUAN,
  };
}

export function chatCreditsForTokens(
  inputPerMillion: number,
  outputPerMillion: number,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputPerMillion * inputTokens) / 1_000_000 +
    (outputPerMillion * outputTokens) / 1_000_000
  );
}

export function formatCreditsEstimate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 3,
    }).format(value);
  }
  const fixed = value.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}

export function formatYuanEstimate(credits: number): string {
  if (!Number.isFinite(credits) || credits <= 0) return "≈¥0";
  const yuan = credits * YUAN_PER_CREDIT;
  if (yuan >= 0.01) return `≈¥${yuan.toFixed(2)}`;
  const fixed = yuan.toFixed(6);
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return `≈¥${trimmed}`;
}

export function formatGenerationCount(planCredits: number, perGeneration: number): number {
  if (perGeneration <= 0) return 0;
  return Math.floor(planCredits / perGeneration);
}

export function buildPackageUsageEstimates(
  catalogPricing: CatalogModelPricingItem[],
  t: (key: string) => string
): PackageUsageEstimateRow[] {
  const pricingByModelId = new Map(
    catalogPricing.map((item) => [item.model_id, item])
  );

  const defaultChat = getDefaultChatModel();
  const defaultImage = getDefaultAvailableImageModel();

  const chatPricing = defaultChat
    ? resolveChatCreditsPerMillion(
        defaultChat,
        pricingByModelId.get(defaultChat.id) ?? null
      )
    : null;

  const shortChatCredits = chatPricing
    ? chatCreditsForTokens(
        chatPricing.inputPerMillion,
        chatPricing.outputPerMillion,
        SHORT_CHAT_INPUT_TOKENS,
        SHORT_CHAT_OUTPUT_TOKENS
      )
    : null;

  const imageCredits = defaultImage
    ? resolveImageCreditsPerGeneration(
        defaultImage,
        pricingByModelId.get(defaultImage.id) ?? null
      )
    : null;

  return ESTIMATE_RECHARGE_PLANS.map((plan) => {
    const shortChatCountLabel =
      shortChatCredits != null && shortChatCredits > 0
        ? t("dashboard.models.packageShortChatCount").replace(
            "{count}",
            String(Math.floor(plan.credits / shortChatCredits))
          )
        : t("dashboard.models.packageEstimateUnavailable");

    const imageCount =
      imageCredits != null ? formatGenerationCount(plan.credits, imageCredits) : 0;

    const imageGenerationCountLabel =
      imageCredits != null && imageCredits > 0
        ? t("dashboard.models.packageImageCount").replace(
            "{count}",
            String(imageCount)
          )
        : t("dashboard.models.packageEstimateUnavailable");

    return {
      planLabel: plan.label,
      amountLabel: plan.amountLabel,
      credits: plan.credits,
      shortChatCountLabel,
      imageGenerationCountLabel,
    };
  });
}
