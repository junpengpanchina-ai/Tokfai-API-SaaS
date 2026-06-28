import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import { DASHBOARD_CATALOG_MODELS } from "@/lib/model-catalog";
import {
  buildPackageUsageEstimates,
  getDefaultAvailableImageModel,
} from "@/lib/model-cost-estimate";
import {
  buildModelsTableRows,
  summarizeModelsCatalog,
  type ModelsOverviewStats,
  type ModelsTableRow,
} from "@/lib/models-page";
import { dashboardLabel, type DashboardLocale } from "@/lib/dashboard-safe/labels";

export type ModelsClientData = {
  stats: ModelsOverviewStats;
  rows: ModelsTableRow[];
  packageRows: ReturnType<typeof buildPackageUsageEstimates>;
  defaultImage: string;
  hasCatalogPricing: boolean;
};

export function buildModelsClientData(
  catalogPricing: CatalogModelPricingItem[],
  locale: DashboardLocale = "en"
): ModelsClientData {
  const t = (key: string) => dashboardLabel(key, locale);
  const defaultImageEntry = getDefaultAvailableImageModel();

  return {
    stats: summarizeModelsCatalog(DASHBOARD_CATALOG_MODELS),
    rows: buildModelsTableRows(
      DASHBOARD_CATALOG_MODELS,
      catalogPricing,
      t,
      locale
    ),
    packageRows: buildPackageUsageEstimates(catalogPricing, t),
    defaultImage: defaultImageEntry?.id ?? "gpt-image-2",
    hasCatalogPricing: catalogPricing.length > 0,
  };
}
