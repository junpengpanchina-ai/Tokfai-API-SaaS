import {
  buildIndustryCurlOneLine as buildPackIndustryCurlOneLine,
  buildIndustryPowerShellCurlOneLine,
  buildTemplateCurlOneLine,
  buildTemplatePowerShellCurlOneLine,
  INDUSTRY_PRIMARY_TEMPLATE,
  type IndustryPackId,
  type IndustryTemplateId,
} from "@/lib/customer-industry-templates";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export type IndustryChapterId = IndustryPackId;

export function buildHospitalCaseSummaryChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplateCurlOneLine("hospital-chart-summary", apiKey);
}

export function buildAutoServiceTicketChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplateCurlOneLine("auto-ticket-summary", apiKey);
}

export function buildCustomerServiceQaChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplateCurlOneLine("support-ticket-classify", apiKey);
}

export function buildEcommerceBatchCopyCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplateCurlOneLine("ecommerce-batch-sku", apiKey);
}

export function buildIndustryCurlOneLine(
  id: IndustryChapterId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildPackIndustryCurlOneLine(id, apiKey);
}

export {
  buildIndustryPowerShellCurlOneLine,
  buildTemplateCurlOneLine,
  buildTemplatePowerShellCurlOneLine,
  INDUSTRY_PRIMARY_TEMPLATE,
  type IndustryTemplateId,
};

export type IndustryOverviewRow = {
  id: string;
  scenarioKey: string;
  systemKey: string;
  apiKey: string;
  modelKey: string;
  fieldsKey: string;
  reconcileKey: string;
};

export const CUSTOMER_INDUSTRY_OVERVIEW_ROWS: IndustryOverviewRow[] = [
  {
    id: "hospital",
    scenarioKey: "integration.industryOverview.hospital.scenario",
    systemKey: "integration.industryOverview.hospital.system",
    apiKey: "integration.industryOverview.hospital.api",
    modelKey: "integration.industryOverview.hospital.model",
    fieldsKey: "integration.industryOverview.hospital.fields",
    reconcileKey: "integration.industryOverview.hospital.reconcile",
  },
  {
    id: "automotive",
    scenarioKey: "integration.industryOverview.automotive.scenario",
    systemKey: "integration.industryOverview.automotive.system",
    apiKey: "integration.industryOverview.automotive.api",
    modelKey: "integration.industryOverview.automotive.model",
    fieldsKey: "integration.industryOverview.automotive.fields",
    reconcileKey: "integration.industryOverview.automotive.reconcile",
  },
  {
    id: "ecommerce",
    scenarioKey: "integration.industryOverview.ecommerce.scenario",
    systemKey: "integration.industryOverview.ecommerce.system",
    apiKey: "integration.industryOverview.ecommerce.api",
    modelKey: "integration.industryOverview.ecommerce.model",
    fieldsKey: "integration.industryOverview.ecommerce.fields",
    reconcileKey: "integration.industryOverview.ecommerce.reconcile",
  },
  {
    id: "support",
    scenarioKey: "integration.industryOverview.support.scenario",
    systemKey: "integration.industryOverview.support.system",
    apiKey: "integration.industryOverview.support.api",
    modelKey: "integration.industryOverview.support.model",
    fieldsKey: "integration.industryOverview.support.fields",
    reconcileKey: "integration.industryOverview.support.reconcile",
  },
];
