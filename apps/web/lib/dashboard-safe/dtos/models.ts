/** Plain JSON DTOs for /dashboard/models client islands. */

export interface ModelsOverviewStats {
  totalAvailable: number;
  chatCount: number;
  imageCount: number;
  defaultModelId: string;
}

export interface ModelsTableRow {
  id: string;
  type: string;
  status: string;
  useCase: string;
  inputPrice: string;
  outputPrice: string;
  unit: string;
  note: string;
  shortEstimate: string;
  longEstimate: string;
  approxRmb: string;
}

export interface ModelsPackageRow {
  planId: string;
  planLabel: string;
  amountLabel: string;
  credits: number;
  usageFitLabel: string;
}

export interface ModelsClientData {
  stats: ModelsOverviewStats;
  rows: ModelsTableRow[];
  packageRows: ModelsPackageRow[];
  defaultImage: string;
  hasCatalogPricing: boolean;
}
