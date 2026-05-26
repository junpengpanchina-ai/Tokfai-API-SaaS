import type { Locale } from "@/lib/i18n/messages";
import {
  getImageModelById,
  type ChatModelPricing,
  type ImageModelPricing,
  type ModelCatalogEntry,
  type PriceRangeYuan,
  isImageModelEntry,
} from "@/lib/model-catalog";

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
