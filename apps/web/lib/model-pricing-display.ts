import type { Locale } from "@/lib/i18n/messages";
import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  getImageModelById,
  type ChatModelPricing,
  type ImageModelPricing,
  type ModelCatalogEntry,
  type ModelTraitLevel,
  type ModelTraits,
  type PriceRangeYuan,
  isImageModelEntry,
} from "@/lib/model-catalog";

/**
 * Display-only ¥/credit anchors from common top-up tiers (best / worst rate).
 * Used for dashboard RMB example ranges — not billing.
 */
const DISPLAY_CNY_PER_CREDIT_MIN = 299 / 200_000;
const DISPLAY_CNY_PER_CREDIT_MAX = 29 / 10_000;

export function creditsToDisplayYuanRange(credits: number): PriceRangeYuan | null {
  if (!Number.isFinite(credits) || credits <= 0) return null;
  return {
    min: credits * DISPLAY_CNY_PER_CREDIT_MIN,
    max: credits * DISPLAY_CNY_PER_CREDIT_MAX,
  };
}

export function getChatYuanRange(
  inputCreditsPerMillion: number,
  outputCreditsPerMillion: number
): {
  input: PriceRangeYuan | null;
  output: PriceRangeYuan | null;
} {
  return {
    input: creditsToDisplayYuanRange(inputCreditsPerMillion),
    output: creditsToDisplayYuanRange(outputCreditsPerMillion),
  };
}

export function getImageYuanRange(
  imageCreditsPerGeneration: number
): PriceRangeYuan | null {
  return creditsToDisplayYuanRange(imageCreditsPerGeneration);
}

export function formatYuanRangeLabel(
  range: PriceRangeYuan,
  locale: Locale,
  unitSuffix: string
): string {
  return `${formatDisplayYuanRange(range, locale)} ${unitSuffix}`;
}

export function hasDisplayYuanExample(range: PriceRangeYuan | null | undefined): boolean {
  if (!range) return false;
  return range.min > 0 && range.max > 0;
}

function formatYuanValue(yuan: number): string {
  if (!Number.isFinite(yuan)) return "0";
  if (yuan >= 10) return yuan.toFixed(2);
  if (yuan >= 1) return yuan.toFixed(2);
  if (yuan >= 0.1) return yuan.toFixed(3);
  if (yuan >= 0.01) return yuan.toFixed(4);
  return yuan.toFixed(5);
}

function formatDisplayYuanRange(range: PriceRangeYuan, locale: Locale): string {
  const min = formatYuanValue(range.min);
  const max = formatYuanValue(range.max);
  const yuan = min === max ? `¥${min}` : `¥${min} ~ ¥${max}`;
  return locale === "zh" ? `约 ${yuan}` : yuan;
}

function chatYuanExampleUnit(locale: Locale): string {
  return locale === "zh" ? "/M tokens" : "/M tokens";
}

function imageYuanExampleUnit(locale: Locale): string {
  return locale === "zh" ? "/次" : "/ generation";
}

export function formatChatInputYuanExample(
  millionCredits: number,
  locale: Locale
): string | null {
  const range = creditsToDisplayYuanRange(millionCredits);
  if (!hasDisplayYuanExample(range)) return null;
  const label = locale === "zh" ? "Input" : "Input";
  return `${label}: ${formatDisplayYuanRange(range!, locale)} ${chatYuanExampleUnit(locale)}`;
}

export function formatChatOutputYuanExample(
  millionCredits: number,
  locale: Locale
): string | null {
  const range = creditsToDisplayYuanRange(millionCredits);
  if (!hasDisplayYuanExample(range)) return null;
  const label = locale === "zh" ? "Output" : "Output";
  return `${label}: ${formatDisplayYuanRange(range!, locale)} ${chatYuanExampleUnit(locale)}`;
}

export function formatImageYuanExample(
  creditsPerGeneration: number,
  locale: Locale
): string | null {
  const range = creditsToDisplayYuanRange(creditsPerGeneration);
  if (!hasDisplayYuanExample(range)) return null;
  return `${formatDisplayYuanRange(range!, locale)} ${imageYuanExampleUnit(locale)}`;
}

export function formatChatInputYuanExampleFromRange(
  range: PriceRangeYuan,
  locale: Locale
): string | null {
  if (!hasDisplayYuanExample(range)) return null;
  const label = locale === "zh" ? "Input" : "Input";
  return `${label}: ${formatDisplayYuanRange(range, locale)} ${chatYuanExampleUnit(locale)}`;
}

export function formatChatOutputYuanExampleFromRange(
  range: PriceRangeYuan,
  locale: Locale
): string | null {
  if (!hasDisplayYuanExample(range)) return null;
  const label = locale === "zh" ? "Output" : "Output";
  return `${label}: ${formatDisplayYuanRange(range, locale)} ${chatYuanExampleUnit(locale)}`;
}

function formatCreditsAmount(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function formatDbChatInputCreditsPerMillion(
  credits: number,
  locale: Locale
): string {
  const amount = formatCreditsAmount(credits, locale);
  if (locale === "zh") {
    return `Input: ${amount} 积分 / 100万 tokens`;
  }
  return `Input: ${amount} credits / 1M tokens`;
}

export function formatDbChatOutputCreditsPerMillion(
  credits: number,
  locale: Locale
): string {
  const amount = formatCreditsAmount(credits, locale);
  if (locale === "zh") {
    return `Output: ${amount} 积分 / 100万 tokens`;
  }
  return `Output: ${amount} credits / 1M tokens`;
}

export function formatDbImageCreditsPerGeneration(
  credits: number,
  locale: Locale
): string {
  const amount = formatCredits(credits, locale);
  if (locale === "zh") {
    return `${amount} 积分 / 次`;
  }
  return `${amount} credits / generation`;
}

export function formatCredits(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

/** Dashboard display: billing_type → model_type → chat. */
export function resolveCatalogBillingType(
  dbPricing: CatalogModelPricingItem | null | undefined,
  modelType?: string | null
): "chat" | "image" | null {
  if (dbPricing?.billing_type === "image" || dbPricing?.billing_type === "chat") {
    return dbPricing.billing_type;
  }
  const normalized = (modelType ?? dbPricing?.model_type ?? "").toLowerCase();
  if (normalized === "image") return "image";
  if (normalized === "chat") return "chat";
  return dbPricing ? "chat" : null;
}

export function resolveDbImageCredits(
  dbPricing: CatalogModelPricingItem | null | undefined,
  modelType?: string | null
): number | null {
  if (resolveCatalogBillingType(dbPricing, modelType) !== "image") return null;
  const credits = dbPricing?.image_credits_per_generation;
  return credits == null ? null : credits;
}

export function resolveDbChatCredits(
  dbPricing: CatalogModelPricingItem | null | undefined,
  modelType?: string | null
): {
  inputPerMillion: number;
  outputPerMillion: number;
} | null {
  if (resolveCatalogBillingType(dbPricing, modelType) !== "chat") return null;
  const input = dbPricing?.input_credits_per_million_tokens;
  const output = dbPricing?.output_credits_per_million_tokens;
  if (input == null || output == null) return null;
  return { inputPerMillion: input, outputPerMillion: output };
}

export function catalogPricingByModelId(
  items: CatalogModelPricingItem[]
): Map<string, CatalogModelPricingItem> {
  return new Map(items.map((item) => [item.model_id, item]));
}

function formatYuanAmount(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toString();
}

export function formatYuanRange(range: PriceRangeYuan): string {
  const min = formatYuanAmount(range.min);
  const max = formatYuanAmount(range.max);
  if (range.min === range.max) {
    return `¥${min}`;
  }
  return `¥${min}~¥${max}`;
}

export function formatChatInputPricePerMillion(pricing: ChatModelPricing): string {
  return `${formatYuanRange(pricing.inputPerMillionYuan)} / 1M tokens`;
}

export function formatChatOutputPricePerMillion(pricing: ChatModelPricing): string {
  return `${formatYuanRange(pricing.outputPerMillionYuan)} / 1M tokens`;
}

export function formatImageReferenceYuanPerRequest(
  pricing: ImageModelPricing,
  locale: Locale
): string {
  const yuan = formatYuanRange(pricing.referenceYuanPerRequest);
  if (locale === "zh") {
    return `${yuan} / 次`;
  }
  return `${yuan} / generation`;
}

/** Image model price line, e.g. `600 积分/次` or `600 credits / generation`. */
export function formatImageCreditsPerRequest(
  pricing: ImageModelPricing,
  locale: Locale
): string {
  const credits = pricing.creditsPerRequest.toLocaleString(
    locale === "zh" ? "zh-CN" : "en-US"
  );
  if (locale === "zh") {
    return `${credits} 积分/次`;
  }
  return `${credits} credits / generation`;
}

export function formatModelPriceSummary(
  model: ModelCatalogEntry,
  locale: Locale
): string {
  if (model.pricing.mode === "per_request") {
    return formatImageCreditsPerRequest(model.pricing, locale);
  }
  const input = formatChatInputPricePerMillion(model.pricing);
  const output = formatChatOutputPricePerMillion(model.pricing);
  if (locale === "zh") {
    return `input ${input}，output ${output}`;
  }
  return `input ${input}, output ${output}`;
}

/** Short unit label when price is shown separately — kept for table headers if needed. */
export function getImagePriceUnitLabel(locale: Locale): string {
  return locale === "zh" ? "积分/次" : "credits / generation";
}

/** Billing unit for image models in pricing tables and cards. */
export function getImagePerRequestBillingUnitLabel(locale: Locale): string {
  return locale === "zh" ? "按次计费" : "Per generation";
}

/** Billing unit on model cards — per successful generation. */
export function getImageBillingChargeLabel(locale: Locale): string {
  return locale === "zh"
    ? "每次成功生成扣费"
    : "Charged per successful generation";
}

/** Billing unit on chat model cards. */
export function getChatBillingUnitLabel(locale: Locale): string {
  return locale === "zh"
    ? "按 input/output tokens 计费"
    : "Billed by input/output tokens";
}

export function getImageModelUseCase(
  modelId: string,
  t: (key: string) => string
): string {
  const key = `catalog.imageUseCase.${modelId}`;
  const value = t(key);
  return value === key ? "—" : value;
}

export function getChatModelUseCase(
  modelId: string,
  t: (key: string) => string
): string {
  const key = `catalog.chatUseCase.${modelId}`;
  const value = t(key);
  return value === key ? "—" : value;
}

export function getChatModelNote(
  modelId: string,
  t: (key: string) => string
): string | null {
  const key = `catalog.chatModelNote.${modelId}`;
  const value = t(key);
  return value === key ? null : value;
}

function formatTraitLevel(
  level: ModelTraitLevel,
  t: (key: string) => string
): string {
  switch (level) {
    case "high":
      return t("dashboard.models.traitLevelHigh");
    case "medium":
      return t("dashboard.models.traitLevelMedium");
    case "low":
      return t("dashboard.models.traitLevelLow");
  }
}

export function formatModelTraitLabels(
  traits: ModelTraits,
  t: (key: string) => string
): Array<{ axis: "speed" | "quality" | "cost"; label: string }> {
  return [
    {
      axis: "speed",
      label: `${t("dashboard.models.traitSpeed")}: ${formatTraitLevel(traits.speed, t)}`,
    },
    {
      axis: "quality",
      label: `${t("dashboard.models.traitQuality")}: ${formatTraitLevel(traits.quality, t)}`,
    },
    {
      axis: "cost",
      label: `${t("dashboard.models.traitCost")}: ${formatTraitLevel(traits.cost, t)}`,
    },
  ];
}

export function formatImageCreditsAmount(
  credits: number,
  locale: Locale
): string {
  return credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

/** Model select label, e.g. `Nano Banana (nano-banana) · 1,400 credits / generation`. */
export function formatImageModelSelectLabel(modelId: string, locale: Locale): string {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return modelId;
  }
  const price = formatImageCreditsPerRequest(entry.pricing, locale);
  return `${entry.displayName} (${modelId}) · ${price}`;
}

export function formatImageModelPriceForModelId(
  modelId: string,
  locale: Locale
): string | null {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return null;
  }
  return formatImageCreditsPerRequest(entry.pricing, locale);
}

export function formatImageReferenceYuanForModelId(
  modelId: string,
  locale: Locale
): string | null {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return null;
  }
  if (
    entry.pricing.referenceYuanPerRequest.min === 0 &&
    entry.pricing.referenceYuanPerRequest.max === 0
  ) {
    return null;
  }
  return formatImageReferenceYuanPerRequest(entry.pricing, locale);
}

/** Credits page example, e.g. `Nano Banana is 1,400 credits / generation`. */
export function formatImageModelPriceExample(
  modelId: string,
  locale: Locale
): string {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return modelId;
  }
  const price = formatImageCreditsPerRequest(entry.pricing, locale);
  if (locale === "zh") {
    return `${entry.displayName} 为 ${price}`;
  }
  return `${entry.displayName} is ${price}`;
}
