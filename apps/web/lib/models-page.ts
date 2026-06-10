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
  resolveDbChatCredits,
  resolveDbImageCredits,
} from "@/lib/model-pricing-display";
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

  return models.map((model) => {
    const dbPricing = pricingByModelId.get(model.id) ?? null;
    const useCase =
      model.type === "image"
        ? getImageModelUseCase(model.id, t)
        : model.type === "chat"
          ? getChatModelUseCase(model.id, t)
          : model.description;

    const prices = resolveModelPrices(model, dbPricing, t, locale, billingFallback);

    return {
      id: model.id,
      type: model.type,
      status: model.status,
      useCase: useCase === "—" ? model.description : useCase,
      inputPrice: prices.inputPrice,
      outputPrice: prices.outputPrice,
      unit: prices.unit,
      note: prices.note,
    };
  });
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
    const dbChat = resolveDbChatCredits(dbPricing, model.type);
    if (dbChat) {
      return {
        inputPrice: formatDbChatInputCreditsPerMillion(
          dbChat.inputPerMillion,
          locale
        ),
        outputPrice: formatDbChatOutputCreditsPerMillion(
          dbChat.outputPerMillion,
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
    const dbCredits = resolveDbImageCredits(dbPricing, model.type);
    const credits =
      dbCredits ??
      (isImageModelEntry(model) ? model.pricing.creditsPerRequest : null);

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

  return {
    inputPrice: "—",
    outputPrice: "—",
    unit: "—",
    note:
      model.status === "coming_soon"
        ? t("dashboard.models.noteComingSoon")
        : billingFallback,
  };
}
