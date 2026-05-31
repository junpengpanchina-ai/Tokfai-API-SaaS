import type { Locale } from "@/lib/i18n/messages";
import type { AdminModelListItem } from "@/lib/admin/client";
import {
  formatChatInputYuanExample,
  formatChatOutputYuanExample,
  formatDbChatInputCreditsPerMillion,
  formatDbChatOutputCreditsPerMillion,
  formatDbImageCreditsPerGeneration,
  formatImageYuanExample,
} from "@/lib/model-pricing-display";
import { resolveAdminBillingType } from "@/lib/admin/models";

export function formatAdminModelPricingSummary(
  model: AdminModelListItem,
  locale: Locale
): string {
  const billingType = resolveAdminBillingType(model);

  if (billingType === "image") {
    const credits = model.image_credits_per_generation;
    if (credits == null) return "—";
    return formatDbImageCreditsPerGeneration(credits, locale);
  }

  const input = model.input_credits_per_million_tokens;
  const output = model.output_credits_per_million_tokens;
  if (input == null && output == null) return "—";

  const inputLine = formatDbChatInputCreditsPerMillion(input ?? 0, locale);
  const outputLine = formatDbChatOutputCreditsPerMillion(output ?? 0, locale);
  return `${inputLine}; ${outputLine}`;
}

export function formatAdminModelPricePreview(
  model: AdminModelListItem,
  locale: Locale
): string | null {
  const billingType = resolveAdminBillingType(model);

  if (billingType === "image") {
    const credits = model.image_credits_per_generation;
    if (credits == null || credits <= 0) return null;
    return formatImageYuanExample(credits, locale);
  }

  const input = model.input_credits_per_million_tokens;
  const output = model.output_credits_per_million_tokens;
  const lines = [
    input != null && input > 0 ? formatChatInputYuanExample(input, locale) : null,
    output != null && output > 0 ? formatChatOutputYuanExample(output, locale) : null,
  ].filter((line): line is string => line != null);

  return lines.length > 0 ? lines.join("; ") : null;
}

export function formatAdminFormChatInputPreview(
  inputCredits: number,
  locale: Locale
): string | null {
  if (!Number.isFinite(inputCredits) || inputCredits <= 0) return null;
  return formatChatInputYuanExample(inputCredits, locale);
}

export function formatAdminFormChatOutputPreview(
  outputCredits: number,
  locale: Locale
): string | null {
  if (!Number.isFinite(outputCredits) || outputCredits <= 0) return null;
  return formatChatOutputYuanExample(outputCredits, locale);
}

export function formatAdminFormImagePreview(
  imageCredits: number,
  locale: Locale
): string | null {
  if (!Number.isFinite(imageCredits) || imageCredits <= 0) return null;
  return formatImageYuanExample(imageCredits, locale);
}
