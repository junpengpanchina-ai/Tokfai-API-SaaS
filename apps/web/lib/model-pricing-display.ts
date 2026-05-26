import type { Locale } from "@/lib/i18n/messages";
import type {
  ChatModelPricing,
  ImageModelPricing,
  ModelCatalogEntry,
  PriceRangeYuan,
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

export function formatImageCreditsPerRequest(
  pricing: ImageModelPricing,
  locale: Locale
): string {
  const credits = pricing.creditsPerRequest.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  if (locale === "zh") {
    return `${credits} 积分/次`;
  }
  return `${credits} credits / request`;
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

export function getImageBillingUnitLabel(locale: Locale): string {
  return locale === "zh" ? "积分/次" : "credits / request";
}

export function getChatBillingUnitLabel(locale: Locale): string {
  return locale === "zh"
    ? "input / output · ¥ / 1M tokens"
    : "input / output · ¥ / 1M tokens";
}
