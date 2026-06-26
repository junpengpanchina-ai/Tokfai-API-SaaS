import {
  batchCreateCurlOneLine,
  batchItemsCurlOneLine,
  batchPollCurlOneLine,
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
  imageCurlOneLine,
  responsesCurlOneLine,
} from "@/lib/customer-curl-oneline";
import {
  buildTemplateCurlOneLine,
  type IndustryTemplateId,
} from "@/lib/customer-industry-templates";
import {
  buildNodeChatFetchExample,
  buildPythonChatRequestsExample,
} from "@/lib/customer-openai-sdk-chapter";
import { buildSafeClientSnippet } from "@/lib/customer-safe-client-snippets";
import { buildTrafficGovernorSnippet } from "@/lib/customer-traffic-governor-snippets";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export type StarterTemplateCategory =
  | "curl"
  | "powershell"
  | "node"
  | "python"
  | "batch"
  | "retry"
  | "traffic-governor"
  | "industry";

export type StarterTemplateIndustry =
  | "hospital"
  | "auto"
  | "ecommerce"
  | "support"
  | "general";

export type StarterTemplateApi = "chat" | "responses" | "image" | "batch";

export type StarterTemplateLanguage = "curl" | "powershell" | "node" | "python";

export type StarterTemplatePattern = "retry" | "batch" | "traffic-governor";

export type StarterCopyKind =
  | "chat-curl-oneline"
  | "responses-curl-oneline"
  | "image-curl-oneline"
  | "batch-create-curl-oneline"
  | "batch-poll-curl-oneline"
  | "batch-items-curl-oneline"
  | "powershell-chat-oneline"
  | "node-chat-fetch"
  | "python-chat-requests"
  | "node-safe-retry"
  | "python-safe-retry"
  | "node-traffic-governor"
  | "python-traffic-governor"
  | "node-batch-worker"
  | "python-batch-worker"
  | "industry-curl";

export type StarterTemplate = {
  id: string;
  titleKey: string;
  category: StarterTemplateCategory;
  industry?: StarterTemplateIndustry;
  industryTemplateId?: IndustryTemplateId;
  endpoint: string;
  model: string;
  useCaseKey: string;
  whenToUseKeys: string[];
  inputShapeKey: string;
  expectedOutputKeys: string[];
  reconcileStepKeys: string[];
  retryAdviceKeys: string[];
  relatedDocs: string[];
  safetyBoundaryKey?: string;
  copyKind: StarterCopyKind;
  featured?: boolean;
  api: StarterTemplateApi;
  language?: StarterTemplateLanguage;
  patterns?: StarterTemplatePattern[];
};

const base = (id: string) => `integration.starterTemplates.template.${id}`;

const RECONCILE_CHAT = [
  "integration.starterTemplates.reconcileStep1",
  "integration.starterTemplates.reconcileStep2",
  "integration.starterTemplates.reconcileStep3",
];

const RECONCILE_BATCH = [
  "integration.starterTemplates.reconcileBatchStep1",
  "integration.starterTemplates.reconcileBatchStep2",
  "integration.starterTemplates.reconcileBatchStep3",
];

const RETRY_STANDARD = [
  "integration.starterTemplates.retryAdvice1",
  "integration.starterTemplates.retryAdvice2",
];

const RETRY_NONE = ["integration.starterTemplates.retryAdviceNo"];

function mkBasic(
  id: string,
  category: StarterTemplateCategory,
  endpoint: string,
  model: string,
  copyKind: StarterCopyKind,
  api: StarterTemplateApi,
  language?: StarterTemplateLanguage,
  patterns?: StarterTemplatePattern[],
  featured = false,
  reconcileSteps = RECONCILE_CHAT,
  retryAdvice = RETRY_STANDARD
): StarterTemplate {
  const key = base(id);
  return {
    id,
    titleKey: `${key}.title`,
    category,
    endpoint,
    model,
    useCaseKey: `${key}.useCase`,
    whenToUseKeys: [`${key}.when1`, `${key}.when2`],
    inputShapeKey: `${key}.inputShape`,
    expectedOutputKeys: [`${key}.expected1`, `${key}.expected2`],
    reconcileStepKeys: reconcileSteps,
    retryAdviceKeys: retryAdvice,
    relatedDocs: ["starter-templates", "quick-start", "usage-credits"],
    copyKind,
    featured,
    api,
    language,
    patterns,
  };
}

function mkIndustry(
  id: string,
  industryTemplateId: IndustryTemplateId,
  industry: StarterTemplateIndustry,
  titleKey: string,
  useCaseKey: string,
  whenKeys: string[],
  inputShapeKey: string,
  expectedKeys: string[],
  reconcileKeys: string[],
  retryKeys: string[],
  safetyBoundaryKey: string,
  endpoint: string,
  model: string,
  api: StarterTemplateApi,
  featured = false
): StarterTemplate {
  return {
    id,
    titleKey,
    category: "industry",
    industry,
    industryTemplateId,
    endpoint,
    model,
    useCaseKey,
    whenToUseKeys: whenKeys,
    inputShapeKey,
    expectedOutputKeys: expectedKeys,
    reconcileStepKeys: reconcileKeys,
    retryAdviceKeys: retryKeys,
    relatedDocs: ["starter-templates", "industry-examples", "usage-credits"],
    safetyBoundaryKey,
    copyKind: "industry-curl",
    featured,
    api,
    language: "curl",
    patterns: api === "batch" ? ["batch"] : undefined,
  };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  mkBasic(
    "one-line-chat-curl",
    "curl",
    "POST /v1/chat/completions",
    "auto-fast",
    "chat-curl-oneline",
    "chat",
    "curl",
    undefined,
    true
  ),
  mkBasic(
    "one-line-responses-curl",
    "curl",
    "POST /v1/responses",
    "auto-fast",
    "responses-curl-oneline",
    "responses",
    "curl"
  ),
  mkBasic(
    "one-line-image-curl",
    "curl",
    "POST /v1/images/generations",
    "gpt-image-2",
    "image-curl-oneline",
    "image",
    "curl"
  ),
  mkBasic(
    "one-line-batch-create-curl",
    "curl",
    "POST /v1/batches/chat",
    "auto-fast",
    "batch-create-curl-oneline",
    "batch",
    "curl",
    ["batch"],
    false,
    RECONCILE_BATCH
  ),
  mkBasic(
    "one-line-batch-poll-curl",
    "curl",
    "GET /v1/batches/{id}",
    "—",
    "batch-poll-curl-oneline",
    "batch",
    "curl",
    ["batch"],
    false,
    RECONCILE_BATCH,
    RETRY_STANDARD
  ),
  mkBasic(
    "one-line-batch-items-curl",
    "curl",
    "GET /v1/batches/{id}/items",
    "—",
    "batch-items-curl-oneline",
    "batch",
    "curl",
    ["batch"],
    false,
    RECONCILE_BATCH
  ),
  mkBasic(
    "powershell-chat-curl",
    "powershell",
    "POST /v1/chat/completions",
    "auto-fast",
    "powershell-chat-oneline",
    "chat",
    "powershell"
  ),
  mkBasic(
    "node-chat-fetch",
    "node",
    "POST /v1/chat/completions",
    "auto-fast",
    "node-chat-fetch",
    "chat",
    "node",
    undefined,
    true
  ),
  mkBasic(
    "python-chat-requests",
    "python",
    "POST /v1/chat/completions",
    "auto-fast",
    "python-chat-requests",
    "chat",
    "python",
    undefined,
    true
  ),
  mkBasic(
    "node-safe-retry",
    "retry",
    "POST /v1/chat/completions",
    "auto-fast",
    "node-safe-retry",
    "chat",
    "node",
    ["retry"]
  ),
  mkBasic(
    "python-safe-retry",
    "retry",
    "POST /v1/chat/completions",
    "auto-fast",
    "python-safe-retry",
    "chat",
    "python",
    ["retry"]
  ),
  mkBasic(
    "node-traffic-governor",
    "traffic-governor",
    "POST /v1/chat/completions",
    "auto-fast",
    "node-traffic-governor",
    "chat",
    "node",
    ["traffic-governor"]
  ),
  mkBasic(
    "python-traffic-governor",
    "traffic-governor",
    "POST /v1/chat/completions",
    "auto-fast",
    "python-traffic-governor",
    "chat",
    "python",
    ["traffic-governor"]
  ),
  mkBasic(
    "node-batch-worker",
    "batch",
    "POST /v1/batches/chat",
    "auto-fast",
    "node-batch-worker",
    "batch",
    "node",
    ["batch", "traffic-governor"],
    true,
    RECONCILE_BATCH
  ),
  mkBasic(
    "python-batch-worker",
    "batch",
    "POST /v1/batches/chat",
    "auto-fast",
    "python-batch-worker",
    "batch",
    "python",
    ["batch", "traffic-governor"],
    false,
    RECONCILE_BATCH
  ),
  mkIndustry(
    "hospital-chart-summary",
    "hospital-chart-summary",
    "hospital",
    "integration.starterTemplates.industry.hospitalChart.title",
    "integration.industryTemplates.hospital.chartSummary.useCase",
    [
      "integration.starterTemplates.industry.hospitalChart.when1",
      "integration.starterTemplates.industry.hospitalChart.when2",
    ],
    "integration.industryTemplates.hospital.chartSummary.input",
    [
      "integration.starterTemplates.template.one-line-chat-curl.expected1",
      "integration.industryTemplates.chatSuccessFields",
    ],
    [
      "integration.starterTemplates.reconcileStep1",
      "integration.industryTemplates.reconcileChat",
    ],
    RETRY_NONE,
    "integration.industryTemplates.hospital.boundary",
    "POST /v1/chat/completions",
    "auto-pro",
    "chat",
    true
  ),
  mkIndustry(
    "hospital-batch-follow-up",
    "hospital-batch-follow-up",
    "hospital",
    "integration.starterTemplates.industry.hospitalFollowUp.title",
    "integration.industryTemplates.hospital.batchFollowUp.useCase",
    [
      "integration.starterTemplates.industry.hospitalFollowUp.when1",
      "integration.starterTemplates.industry.hospitalFollowUp.when2",
    ],
    "integration.industryTemplates.hospital.batchFollowUp.input",
    ["integration.industryTemplates.batchSuccessFields"],
    RECONCILE_BATCH,
    RETRY_STANDARD,
    "integration.industryTemplates.hospital.boundary",
    "POST /v1/batches/chat",
    "auto-fast",
    "batch"
  ),
  mkIndustry(
    "hospital-image-assist",
    "hospital-image-assist",
    "hospital",
    "integration.starterTemplates.industry.hospitalImage.title",
    "integration.industryTemplates.hospital.imageAssist.useCase",
    ["integration.starterTemplates.industry.hospitalImage.when1"],
    "integration.industryTemplates.hospital.imageAssist.input",
    ["integration.industryTemplates.chatSuccessFields"],
    RECONCILE_CHAT,
    RETRY_NONE,
    "integration.industryTemplates.hospital.boundary",
    "POST /v1/chat/completions",
    "auto-fast",
    "chat"
  ),
  mkIndustry(
    "auto-ticket-summary",
    "auto-ticket-summary",
    "auto",
    "integration.starterTemplates.industry.autoTicket.title",
    "integration.industryTemplates.automotive.ticketSummary.useCase",
    [
      "integration.starterTemplates.industry.autoTicket.when1",
      "integration.starterTemplates.industry.autoTicket.when2",
    ],
    "integration.industryTemplates.automotive.ticketSummary.input",
    ["integration.industryTemplates.chatSuccessFields"],
    RECONCILE_CHAT,
    RETRY_NONE,
    "integration.industryTemplates.automotive.boundary",
    "POST /v1/chat/completions",
    "auto-pro",
    "chat",
    true
  ),
  mkIndustry(
    "auto-work-order-classify",
    "auto-batch-tickets",
    "auto",
    "integration.starterTemplates.industry.autoClassify.title",
    "integration.industryTemplates.automotive.batchTickets.useCase",
    ["integration.starterTemplates.industry.autoClassify.when1"],
    "integration.industryTemplates.automotive.batchTickets.input",
    ["integration.industryTemplates.batchSuccessFields"],
    RECONCILE_BATCH,
    RETRY_STANDARD,
    "integration.industryTemplates.automotive.boundary",
    "POST /v1/batches/chat",
    "auto-pro",
    "batch"
  ),
  mkIndustry(
    "auto-vehicle-image",
    "auto-damage-image",
    "auto",
    "integration.starterTemplates.industry.autoImage.title",
    "integration.industryTemplates.automotive.damageImage.useCase",
    ["integration.starterTemplates.industry.autoImage.when1"],
    "integration.industryTemplates.automotive.damageImage.input",
    ["integration.industryTemplates.imageSuccessFields"],
    RECONCILE_CHAT,
    RETRY_STANDARD,
    "integration.industryTemplates.automotive.boundary",
    "POST /v1/images/generations",
    "gpt-image-2",
    "image"
  ),
  mkIndustry(
    "ecommerce-sku-batch",
    "ecommerce-batch-sku",
    "ecommerce",
    "integration.starterTemplates.industry.ecommerceSku.title",
    "integration.industryTemplates.ecommerce.batchSku.useCase",
    [
      "integration.starterTemplates.industry.ecommerceSku.when1",
      "integration.starterTemplates.industry.ecommerceSku.when2",
    ],
    "integration.industryTemplates.ecommerce.batchSku.input",
    ["integration.industryTemplates.batchSuccessFields"],
    RECONCILE_BATCH,
    RETRY_STANDARD,
    "integration.industryTemplates.ecommerce.boundary",
    "POST /v1/batches/chat",
    "auto-cheap",
    "batch",
    true
  ),
  mkIndustry(
    "ecommerce-product-image",
    "ecommerce-product-image",
    "ecommerce",
    "integration.starterTemplates.industry.ecommerceImage.title",
    "integration.industryTemplates.ecommerce.productImage.useCase",
    ["integration.starterTemplates.industry.ecommerceImage.when1"],
    "integration.industryTemplates.ecommerce.productImage.input",
    ["integration.industryTemplates.imageSuccessFields"],
    RECONCILE_CHAT,
    RETRY_STANDARD,
    "integration.industryTemplates.ecommerce.boundary",
    "POST /v1/images/generations",
    "gpt-image-2",
    "image"
  ),
  mkIndustry(
    "ecommerce-faq-chat",
    "ecommerce-faq-chat",
    "ecommerce",
    "integration.starterTemplates.industry.ecommerceFaq.title",
    "integration.industryTemplates.ecommerce.faqChat.useCase",
    ["integration.starterTemplates.industry.ecommerceFaq.when1"],
    "integration.industryTemplates.ecommerce.faqChat.input",
    ["integration.industryTemplates.chatSuccessFields"],
    RECONCILE_CHAT,
    RETRY_NONE,
    "integration.industryTemplates.ecommerce.boundary",
    "POST /v1/chat/completions",
    "auto-fast",
    "chat"
  ),
  mkIndustry(
    "support-ticket-classify",
    "support-batch-qa",
    "support",
    "integration.starterTemplates.industry.supportClassify.title",
    "integration.industryTemplates.support.batchQa.useCase",
    ["integration.starterTemplates.industry.supportClassify.when1"],
    "integration.industryTemplates.support.batchQa.input",
    ["integration.industryTemplates.batchSuccessFields"],
    RECONCILE_BATCH,
    RETRY_STANDARD,
    "integration.industryTemplates.support.boundary",
    "POST /v1/batches/chat",
    "auto-fast",
    "batch",
    true
  ),
  mkIndustry(
    "support-reply-draft",
    "support-ticket-classify",
    "support",
    "integration.starterTemplates.industry.supportReply.title",
    "integration.industryTemplates.support.ticketClassify.useCase",
    ["integration.starterTemplates.industry.supportReply.when1"],
    "integration.industryTemplates.support.ticketClassify.input",
    ["integration.industryTemplates.chatSuccessFields"],
    RECONCILE_CHAT,
    RETRY_NONE,
    "integration.industryTemplates.support.boundary",
    "POST /v1/chat/completions",
    "auto-fast",
    "chat"
  ),
  mkIndustry(
    "support-conversation-summary",
    "support-summary-chat",
    "support",
    "integration.starterTemplates.industry.supportSummary.title",
    "integration.industryTemplates.support.summaryChat.useCase",
    ["integration.starterTemplates.industry.supportSummary.when1"],
    "integration.industryTemplates.support.summaryChat.input",
    ["integration.industryTemplates.chatSuccessFields"],
    RECONCILE_CHAT,
    RETRY_NONE,
    "integration.industryTemplates.support.boundary",
    "POST /v1/chat/completions",
    "auto-fast",
    "chat"
  ),
];

export const STARTER_TEMPLATE_FEATURED_IDS = [
  "one-line-chat-curl",
  "node-chat-fetch",
  "python-chat-requests",
  "node-batch-worker",
  "hospital-chart-summary",
  "auto-ticket-summary",
  "ecommerce-sku-batch",
  "support-ticket-classify",
];

export const STARTER_TEMPLATES_DASHBOARD_PATH = "/dashboard/starter-templates";

export function getStarterTemplateCopyText(
  template: StarterTemplate,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model?: string
): string {
  switch (template.copyKind) {
    case "chat-curl-oneline":
      return chatCurlOneLine(apiKey, model ?? template.model);
    case "responses-curl-oneline":
      return responsesCurlOneLine(apiKey);
    case "image-curl-oneline":
      return imageCurlOneLine(apiKey);
    case "batch-create-curl-oneline":
      return batchCreateCurlOneLine(apiKey, model ?? template.model);
    case "batch-poll-curl-oneline":
      return batchPollCurlOneLine(apiKey);
    case "batch-items-curl-oneline":
      return batchItemsCurlOneLine(apiKey);
    case "powershell-chat-oneline":
      return chatCurlPowerShellOneLine(apiKey, model ?? template.model);
    case "node-chat-fetch":
      return buildNodeChatFetchExample(apiKey);
    case "python-chat-requests":
      return buildPythonChatRequestsExample(apiKey);
    case "node-safe-retry":
      return buildSafeClientSnippet("node-safe-retry", apiKey);
    case "python-safe-retry":
      return buildSafeClientSnippet("python-safe-retry", apiKey);
    case "node-traffic-governor":
      return buildTrafficGovernorSnippet("node-traffic-governor", apiKey);
    case "python-traffic-governor":
      return buildTrafficGovernorSnippet("python-traffic-governor", apiKey);
    case "node-batch-worker":
      return buildTrafficGovernorSnippet("node-batch-worker", apiKey);
    case "python-batch-worker":
      return buildTrafficGovernorSnippet("python-batch-worker", apiKey);
    case "industry-curl":
      if (!template.industryTemplateId) return "";
      return buildTemplateCurlOneLine(template.industryTemplateId, apiKey);
    default:
      return "";
  }
}

export function starterTemplateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}

export function filterStarterTemplates(
  templates: StarterTemplate[],
  filters: {
    language?: StarterTemplateLanguage | "all";
    api?: StarterTemplateApi | "all";
    industry?: StarterTemplateIndustry | "all";
    pattern?: StarterTemplatePattern | "all";
    query?: string;
  },
  t: (key: string) => string
): StarterTemplate[] {
  let result = templates;
  if (filters.language && filters.language !== "all") {
    result = result.filter((t) => t.language === filters.language);
  }
  if (filters.api && filters.api !== "all") {
    result = result.filter((t) => t.api === filters.api);
  }
  if (filters.industry && filters.industry !== "all") {
    result = result.filter((t) => t.industry === filters.industry);
  }
  if (filters.pattern && filters.pattern !== "all") {
    const pattern = filters.pattern;
    result = result.filter((t) => t.patterns?.includes(pattern));
  }
  const q = filters.query?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (item) =>
        item.id.includes(q) ||
        t(item.titleKey).toLowerCase().includes(q) ||
        t(item.useCaseKey).toLowerCase().includes(q) ||
        item.endpoint.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q)
    );
  }
  return result;
}

export function sortStarterTemplatesFeatured(templates: StarterTemplate[]): StarterTemplate[] {
  const featuredSet = new Set(STARTER_TEMPLATE_FEATURED_IDS);
  return [...templates].sort((a, b) => {
    const af = featuredSet.has(a.id) ? 0 : 1;
    const bf = featuredSet.has(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    return STARTER_TEMPLATE_FEATURED_IDS.indexOf(a.id) - STARTER_TEMPLATE_FEATURED_IDS.indexOf(b.id);
  });
}

export function starterTemplateDocHref(hash: string): string {
  if (hash === "starter-templates") return STARTER_TEMPLATES_DASHBOARD_PATH;
  if (hash === "usage-credits") return "/dashboard/docs#usage-credits";
  if (hash === "quick-start") return "/dashboard/docs#quick-start";
  if (hash === "industry-examples") return "/dashboard/docs#industry-examples";
  return `/dashboard/docs#${hash}`;
}

export const STARTER_DOC_LABEL_KEYS: Record<string, string> = {
  "starter-templates": "integration.starterTemplates.openLibrary",
  "usage-credits": "integration.navUsageCredits",
  "quick-start": "integration.navQuickStart",
  "industry-examples": "integration.navIndustry",
};
