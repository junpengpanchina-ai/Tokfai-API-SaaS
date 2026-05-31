import type { Locale } from "@/lib/i18n/messages";
import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  getImageModelById,
  type ChatModelPricing,
  type ImageModelPricing,
  type ModelCatalogEntry,
  type PriceRangeYuan,
  isImageModelEntry,
} from "@/lib/model-catalog";

/** Starter recharge plan — used for dashboard RMB examples only (display). */
export const STARTER_PLAN_CNY = 29;
export const STARTER_PLAN_CREDITS = 10_000;

export function getCreditUnitPriceCny(): number {
  return STARTER_PLAN_CNY / STARTER_PLAN_CREDITS;
}

export function yuanFromCredits(credits: number): number {
  return credits * getCreditUnitPriceCny();
}

function formatYuanValue(yuan: number): string {
  if (!Number.isFinite(yuan)) return "0";
  if (yuan >= 10) return yuan.toFixed(2);
  if (yuan >= 1) return yuan.toFixed(2);
  if (yuan >= 0.1) return yuan.toFixed(3);
  if (yuan >= 0.01) return yuan.toFixed(4);
  return yuan.toFixed(5);
}

export function formatStarterChatInputYuanExample(
  millionCredits: number,
  locale: Locale
): string {
  const yuan = formatYuanValue(yuanFromCredits(millionCredits));
  if (locale === "zh") {
    return `Input: 约 ¥${yuan} / 100万 tokens`;
  }
  return `Input: ~¥${yuan} / 1M tokens`;
}

export function formatStarterChatOutputYuanExample(
  millionCredits: number,
  locale: Locale
): string {
  const yuan = formatYuanValue(yuanFromCredits(millionCredits));
  if (locale === "zh") {
    return `Output: 约 ¥${yuan} / 100万 tokens`;
  }
  return `Output: ~¥${yuan} / 1M tokens`;
}

export function formatStarterImageYuanExample(
  creditsPerGeneration: number,
  locale: Locale
): string {
  const yuan = formatYuanValue(yuanFromCredits(creditsPerGeneration));
  if (locale === "zh") {
    return `约 ¥${yuan} / 次`;
  }
  return `~¥${yuan} / generation`;
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
  const amount = formatCreditsAmount(credits, locale);
  if (locale === "zh") {
    return `${amount} 积分 / 次`;
  }
  return `${amount} credits / generation`;
}

export function resolveDbImageCredits(
  dbPricing: CatalogModelPricingItem | null | undefined
): number | null {
  if (!dbPricing) return null;
  if (
    dbPricing.billing_type === "image" ||
    dbPricing.image_credits_per_generation != null
  ) {
    const credits = dbPricing.image_credits_per_generation;
    return credits == null ? null : credits;
  }
  return null;
}

export function resolveDbChatCredits(
  dbPricing: CatalogModelPricingItem | null | undefined
): {
  inputPerMillion: number;
  outputPerMillion: number;
} | null {
  if (!dbPricing || dbPricing.billing_type !== "chat") return null;
  const input = dbPricing.input_credits_per_million_tokens;
  const output = dbPricing.output_credits_per_million_tokens;
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

export function formatImageCreditsAmount(
  credits: number,
  locale: Locale
): string {
  return credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

/** Model select label, e.g. `nano-banana · 1,400 credits / generation`. */
export function formatImageModelSelectLabel(modelId: string, locale: Locale): string {
  const entry = getImageModelById(modelId);
  if (!entry || !isImageModelEntry(entry)) {
    return modelId;
  }
  return `${modelId} · ${formatImageCreditsPerRequest(entry.pricing, locale)}`;
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
