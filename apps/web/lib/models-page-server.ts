import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import { DASHBOARD_CATALOG_MODELS, IMAGE_PLAYGROUND_DEFAULT_MODEL } from "@/lib/model-catalog";
import {
  buildPackageUsageEstimates,
  getDefaultAvailableImageModel,
} from "@/lib/model-cost-estimate";
import {
  buildModelsTableRows,
} from "@/lib/models-page";
import { summarizePublicRegistryStats } from "@/lib/public-model-registry";
import { TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";
import { dashboardLabel, type DashboardLocale } from "@/lib/dashboard-safe/labels";
import {
  buildFallbackModelsClientData,
  logDashboardSsrFailOpen,
} from "@/lib/dashboard-safe/catalog-fallback";

import type { ModelsClientData } from "@/lib/dashboard-safe/dtos/models";

export type { ModelsClientData } from "@/lib/dashboard-safe/dtos/models";

export function buildModelsClientData(
  catalogPricing: CatalogModelPricingItem[],
  locale: DashboardLocale = "en"
): ModelsClientData {
  try {
    const t = (key: string) => dashboardLabel(key, locale);
    const defaultImageEntry = getDefaultAvailableImageModel();
    const registryStats = summarizePublicRegistryStats();

    return {
      stats: {
        ...registryStats,
        defaultModelId: TOKFAI_RECOMMENDED_MODEL,
      },
      rows: buildModelsTableRows(
        DASHBOARD_CATALOG_MODELS,
        catalogPricing,
        t,
        locale
      ),
      packageRows: buildPackageUsageEstimates(catalogPricing, t),
      defaultImage: defaultImageEntry?.id ?? IMAGE_PLAYGROUND_DEFAULT_MODEL,
      hasCatalogPricing: catalogPricing.length > 0,
    };
  } catch (error) {
    logDashboardSsrFailOpen(error, "buildModelsClientData");
    return buildFallbackModelsClientData();
  }
}
