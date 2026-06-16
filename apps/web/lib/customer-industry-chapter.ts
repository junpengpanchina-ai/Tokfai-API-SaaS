import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export type IndustryChapterId = "hospital" | "automotive" | "ecommerce" | "support";

const API_ROOT = "https://api.tokfai.com/v1";

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

const HOSPITAL_CASE_PROMPT =
  "请把以下患者自述整理成结构化摘要，分为主诉、持续时间、伴随症状、需医生确认的问题。不要诊断，不要给治疗方案。\n\n患者自述：头痛三天，偶有恶心，无发热。";

const AUTO_TICKET_PROMPT =
  "请把以下售后工单整理为：问题类型、用户描述、可能涉及模块、需要人工确认的问题、建议回复草稿。\n\n工单：车辆怠速不稳，仪表盘偶尔亮起发动机故障灯。";

const CUSTOMER_SERVICE_PROMPT =
  "请基于以下 FAQ 和用户问题，生成客服回复草稿。不要承诺退款、赔偿、发货时间，涉及政策时提示人工确认。\n\nFAQ：退货需在签收7天内申请。用户问：我买了10天还能退吗？";

const ECOMMERCE_BATCH_ITEMS = [
  {
    messages: [
      {
        role: "user",
        content: "商品：无线蓝牙耳机。请生成标题、3条卖点、详情页短文案（80字内）。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content: "商品：便携榨汁杯。请生成标题、3条卖点、详情页短文案（80字内）。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content: "商品：瑜伽垫。请生成标题、3条卖点、详情页短文案（80字内）。",
      },
    ],
  },
];

export function buildHospitalCaseSummaryChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = shellSingleQuotedJson({
    model: "auto-pro",
    messages: [{ role: "user", content: HOSPITAL_CASE_PROMPT }],
    stream: false,
  });
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function buildAutoServiceTicketChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = shellSingleQuotedJson({
    model: "auto-pro",
    messages: [{ role: "user", content: AUTO_TICKET_PROMPT }],
    stream: false,
  });
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function buildCustomerServiceQaChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = shellSingleQuotedJson({
    model: "auto-fast",
    messages: [{ role: "user", content: CUSTOMER_SERVICE_PROMPT }],
    stream: false,
  });
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function buildEcommerceBatchCopyCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = shellSingleQuotedJson({
    model: "auto-cheap",
    items: ECOMMERCE_BATCH_ITEMS,
  });
  return `curl -sS ${API_ROOT}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function buildIndustryCurlOneLine(
  id: IndustryChapterId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  switch (id) {
    case "hospital":
      return buildHospitalCaseSummaryChatCurlOneLine(apiKey);
    case "automotive":
      return buildAutoServiceTicketChatCurlOneLine(apiKey);
    case "ecommerce":
      return buildEcommerceBatchCopyCurlOneLine(apiKey);
    case "support":
      return buildCustomerServiceQaChatCurlOneLine(apiKey);
  }
}

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
