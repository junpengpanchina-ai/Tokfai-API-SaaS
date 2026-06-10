import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  DASHBOARD_CATALOG_MODELS,
  isChatModelEntry,
  isImageModelEntry,
  type ModelCatalogEntry,
  type ModelStatus,
  type ModelType,
} from "@/lib/model-catalog";
import {
  catalogPricingByModelId,
  formatDbChatInputCreditsPerMillion,
  formatDbChatOutputCreditsPerMillion,
  formatDbImageCreditsPerGeneration,
  formatChatInputPricePerMillion,
  formatChatOutputPricePerMillion,
  getChatModelUseCase,
  getImageModelUseCase,
} from "@/lib/model-pricing-display";
import {
  chatCreditsForTokens,
  ESTIMATE_RECHARGE_PLANS,
  formatChatCreditsSoftRange,
  formatCreditsEstimate,
  formatGenerationCount,
  formatImageYuanSoft,
  LONG_CHAT_INPUT_TOKENS,
  resolveChatBudgetLevel,
  LONG_CHAT_OUTPUT_TOKENS,
  resolveChatCreditsPerMillion,
  resolveImageCreditsPerGeneration,
  SHORT_CHAT_INPUT_TOKENS,
  SHORT_CHAT_OUTPUT_TOKENS,
} from "@/lib/model-cost-estimate";
import { TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";
import type { Locale } from "@/lib/i18n/messages";

export interface ModelsOverviewStats {
  totalAvailable: number;
  chatCount: number;
  imageCount: number;
  defaultModelId: string;
}

export interface ModelsTableRow {
  id: string;
  type: ModelType | "unknown";
  status: ModelStatus | "paused";
  useCase: string;
  inputPrice: string;
  outputPrice: string;
  unit: string;
  note: string;
  shortEstimate: string;
  longEstimate: string;
  approxRmb: string;
}

export function summarizeModelsCatalog(
  models: ModelCatalogEntry[] = DASHBOARD_CATALOG_MODELS
): ModelsOverviewStats {
  const available = models.filter((m) => m.status === "available");
  return {
    totalAvailable: available.length,
    chatCount: available.filter((m) => m.type === "chat").length,
    imageCount: available.filter((m) => m.type === "image").length,
    defaultModelId: TOKFAI_RECOMMENDED_MODEL,
  };
}

export function buildModelsTableRows(
  models: ModelCatalogEntry[],
  catalogPricing: CatalogModelPricingItem[],
  t: (key: string) => string,
  locale: Locale
): ModelsTableRow[] {
  const pricingByModelId = catalogPricingByModelId(catalogPricing);
  const billingFallback = t("dashboard.models.billingFallback");
  const pricePending = t("dashboard.models.pricePending");

  return models.map((model) => {
    const dbPricing = pricingByModelId.get(model.id) ?? null;
    const useCase =
      model.type === "image"
        ? getImageModelUseCase(model.id, t)
        : model.type === "chat"
          ? getChatModelUseCase(model.id, t)
          : model.description;

    const prices = resolveModelPrices(model, dbPricing, t, locale, billingFallback);
    const estimates = resolveCostEstimates(
      model,
      dbPricing,
      t,
      locale,
      pricePending,
      billingFallback
    );

    return {
      id: model.id,
      type: model.type,
      status: model.status,
      useCase: useCase === "—" ? model.description : useCase,
      inputPrice: prices.inputPrice,
      outputPrice: prices.outputPrice,
      unit: prices.unit,
      note: prices.note,
      shortEstimate: estimates.shortEstimate,
      longEstimate: estimates.longEstimate,
      approxRmb: estimates.approxRmb,
    };
  });
}

function resolveCostEstimates(
  model: ModelCatalogEntry,
  dbPricing: CatalogModelPricingItem | null,
  t: (key: string) => string,
  locale: Locale,
  pricePending: string,
  billingFallback: string
): {
  shortEstimate: string;
  longEstimate: string;
  approxRmb: string;
} {
  if (isChatModelEntry(model)) {
    const rates = resolveChatCreditsPerMillion(model, dbPricing);
    if (!rates) {
      return {
        shortEstimate: billingFallback,
        longEstimate: billingFallback,
        approxRmb: billingFallback,
      };
    }

    const shortCredits = chatCreditsForTokens(
      rates.inputPerMillion,
      rates.outputPerMillion,
      SHORT_CHAT_INPUT_TOKENS,
      SHORT_CHAT_OUTPUT_TOKENS
    );
    const longCredits = chatCreditsForTokens(
      rates.inputPerMillion,
      rates.outputPerMillion,
      LONG_CHAT_INPUT_TOKENS,
      LONG_CHAT_OUTPUT_TOKENS
    );

    const budgetLevel = resolveChatBudgetLevel(shortCredits);
    const budgetKey = `dashboard.models.chatBudgetLevel.${budgetLevel}`;

    return {
      shortEstimate: t("dashboard.models.chatEstimateShort")
        .replace("{range}", formatChatCreditsSoftRange(shortCredits)),
      longEstimate: t("dashboard.models.chatEstimateLong")
        .replace("{range}", formatChatCreditsSoftRange(longCredits)),
      approxRmb: t(budgetKey),
    };
  }

  if (isImageModelEntry(model)) {
    const perImage = resolveImageCreditsPerGeneration(model, dbPricing);
    if (perImage == null || perImage <= 0) {
      return {
        shortEstimate: billingFallback,
        longEstimate: billingFallback,
        approxRmb: billingFallback,
      };
    }

    const perImageLabel = t("dashboard.models.imagePerGeneration")
      .replace("{credits}", formatCreditsEstimate(perImage))
      .replace("{yuan}", formatImageYuanSoft(perImage));

    const packageLines = ESTIMATE_RECHARGE_PLANS.map((plan) => {
      const count = formatGenerationCount(plan.credits, perImage);
      return t("dashboard.models.imagePlanGenerationsSoft")
        .replace("{plan}", plan.label)
        .replace("{amount}", plan.amountLabel)
        .replace("{count}", String(count));
    });

    return {
      shortEstimate: perImageLabel,
      longEstimate: packageLines.join("\n"),
      approxRmb: formatImageYuanSoft(perImage),
    };
  }

  if (model.type === "video") {
    const videoCredits = resolveVideoCreditsPerUnit(model);

    if (videoCredits != null && videoCredits > 0) {
      const unitLabel = t("dashboard.models.videoPerUnit")
        .replace("{credits}", formatCreditsEstimate(videoCredits))
        .replace("{yuan}", formatImageYuanSoft(videoCredits));
      return {
        shortEstimate: unitLabel,
        longEstimate: unitLabel,
        approxRmb: formatImageYuanSoft(videoCredits),
      };
    }

    return {
      shortEstimate: pricePending,
      longEstimate: pricePending,
      approxRmb: pricePending,
    };
  }

  return {
    shortEstimate: pricePending,
    longEstimate: pricePending,
    approxRmb: pricePending,
  };
}

function resolveVideoCreditsPerUnit(model: ModelCatalogEntry): number | null {
  if (model.pricing.mode === "per_request") {
    const credits = model.pricing.creditsPerRequest;
    return credits > 0 ? credits : null;
  }
  return null;
}

function resolveModelPrices(
  model: ModelCatalogEntry,
  dbPricing: CatalogModelPricingItem | null,
  t: (key: string) => string,
  locale: Locale,
  billingFallback: string
): {
  inputPrice: string;
  outputPrice: string;
  unit: string;
  note: string;
} {
  if (isChatModelEntry(model)) {
    const rates = resolveChatCreditsPerMillion(model, dbPricing);
    if (rates) {
      return {
        inputPrice: formatDbChatInputCreditsPerMillion(
          rates.inputPerMillion,
          locale
        ),
        outputPrice: formatDbChatOutputCreditsPerMillion(
          rates.outputPerMillion,
          locale
        ),
        unit: t("dashboard.models.unitPerMillionTokens"),
        note: t("dashboard.models.noteUsageCredits"),
      };
    }

    const hasCatalogRange =
      model.pricing.inputPerMillionYuan.min > 0 ||
      model.pricing.outputPerMillionYuan.min > 0;

    if (hasCatalogRange) {
      return {
        inputPrice: formatChatInputPricePerMillion(model.pricing),
        outputPrice: formatChatOutputPricePerMillion(model.pricing),
        unit: t("dashboard.models.unitPerMillionTokens"),
        note: t("dashboard.models.noteReferencePrice"),
      };
    }

    return {
      inputPrice: billingFallback,
      outputPrice: "—",
      unit: t("dashboard.models.unitPerMillionTokens"),
      note: billingFallback,
    };
  }

  if (isImageModelEntry(model)) {
    const credits = resolveImageCreditsPerGeneration(model, dbPricing);

    if (credits != null) {
      return {
        inputPrice: "—",
        outputPrice: formatDbImageCreditsPerGeneration(credits, locale),
        unit: t("dashboard.models.unitPerGeneration"),
        note: t("dashboard.models.noteImageEndpoint"),
      };
    }

    return {
      inputPrice: "—",
      outputPrice: billingFallback,
      unit: t("dashboard.models.unitPerGeneration"),
      note: billingFallback,
    };
  }

  const pricePending = t("dashboard.models.pricePending");

  return {
    inputPrice: pricePending,
    outputPrice: pricePending,
    unit: model.type === "video" ? t("dashboard.models.unitPerGeneration") : "—",
    note:
      model.status === "coming_soon"
        ? t("dashboard.models.noteComingSoon")
        : pricePending,
  };
}
