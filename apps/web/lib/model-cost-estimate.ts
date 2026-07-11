import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  CREDITS_PER_YUAN,
  YUAN_PER_CREDIT,
} from "@/lib/credits-units";
import {
  DASHBOARD_CATALOG_MODELS,
  IMAGE_PLAYGROUND_DEFAULT_MODEL,
  isChatModelEntry,
  isImageModelEntry,
  type ModelCatalogEntry,
} from "@/lib/model-catalog";
import {
  resolveDbChatCredits,
  resolveDbImageCredits,
} from "@/lib/model-pricing-display";
import { TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";

/** Display-only conversion for /dashboard/models estimates. ¥1 = 10,000 算力积分. */
export { CREDITS_PER_YUAN, YUAN_PER_CREDIT };

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
  { planId: "credit_10", label: "¥10", amountLabel: "¥10", credits: 100_000 },
  { planId: "credit_20", label: "¥20", amountLabel: "¥20", credits: 220_000 },
  { planId: "credit_49", label: "¥49", amountLabel: "¥49", credits: 563_500 },
  { planId: "credit_99", label: "¥99", amountLabel: "¥99", credits: 1_188_000 },
  {
    planId: "credit_499",
    label: "¥499",
    amountLabel: "¥499",
    credits: 5_988_000,
  },
  {
    planId: "credit_999",
    label: "¥999",
    amountLabel: "¥999",
    credits: 11_988_000,
  },
];

export interface PackageUsageEstimateRow {
  planId: string;
  planLabel: string;
  amountLabel: string;
  credits: number;
  usageFitLabel: string;
}

export function getDefaultAvailableImageModel(): ModelCatalogEntry | null {
  const preferred = DASHBOARD_CATALOG_MODELS.find(
    (model) =>
      model.id === IMAGE_PLAYGROUND_DEFAULT_MODEL &&
      model.type === "image" &&
      model.status === "available"
  );
  if (preferred) return preferred;

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

/** Soft RMB for image models — 1–2 decimal places, never micro-yuan. */
export function formatImageYuanSoft(
  credits: number,
  locale: "en" | "zh" = "en"
): string {
  if (!Number.isFinite(credits) || credits <= 0) return "—";
  const yuan = credits * YUAN_PER_CREDIT;
  const prefix = locale === "zh" ? "约 ¥" : "~¥";
  if (yuan >= 10) return `${prefix}${yuan.toFixed(1)}`;
  if (yuan >= 1) return `${prefix}${yuan.toFixed(2)}`;
  const fixed = yuan.toFixed(2);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${prefix}${trimmed}`;
}

export type ChatBudgetLevel = "veryLow" | "low" | "medium" | "high";

export function resolveChatBudgetLevel(credits: number): ChatBudgetLevel {
  if (!Number.isFinite(credits) || credits <= 0) return "veryLow";
  if (credits < 0.01) return "veryLow";
  if (credits < 0.1) return "low";
  if (credits < 1) return "medium";
  return "high";
}

/** Bucket per-call credits into readable ranges (budget reference, not exact billing). */
export function formatChatCreditsSoftRange(
  credits: number,
  locale: "en" | "zh" = "en"
): string {
  const sep = locale === "zh" ? "～" : "~";
  if (!Number.isFinite(credits) || credits <= 0) return `0.001${sep}0.02`;
  if (credits < 0.01) return `0.001${sep}0.02`;
  if (credits < 0.1) return `0.01${sep}0.1`;
  if (credits < 1) return `0.1${sep}1`;
  const low = formatCreditsEstimate(Math.max(0.1, credits * 0.5));
  const high = formatCreditsEstimate(credits * 1.5);
  return `${low}${sep}${high}`;
}

export function formatGenerationCount(planCredits: number, perGeneration: number): number {
  if (perGeneration <= 0) return 0;
  return Math.floor(planCredits / perGeneration);
}

export function buildPackageUsageEstimates(
  _catalogPricing: CatalogModelPricingItem[],
  t: (key: string) => string
): PackageUsageEstimateRow[] {
  try {
    return ESTIMATE_RECHARGE_PLANS.map((plan) => {
      const fitKey = `dashboard.models.packageUsageFit.${plan.planId}`;
      const fitLabel = t(fitKey);
      const usageFitLabel =
        fitLabel === fitKey
          ? t("dashboard.models.packageEstimateUnavailable")
          : fitLabel;

      return {
        planId: plan.planId,
        planLabel: plan.label,
        amountLabel: plan.amountLabel,
        credits: plan.credits,
        usageFitLabel,
      };
    });
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "buildPackageUsageEstimates", error);
    return [];
  }
}
