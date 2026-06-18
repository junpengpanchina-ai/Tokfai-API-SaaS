import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export type IndustryPackId = "hospital" | "automotive" | "ecommerce" | "support";

export type IndustryTemplateId =
  | "hospital-chart-summary"
  | "hospital-batch-consult"
  | "hospital-batch-follow-up"
  | "hospital-image-assist"
  | "auto-ticket-summary"
  | "auto-damage-image"
  | "auto-batch-tickets"
  | "ecommerce-batch-sku"
  | "ecommerce-product-image"
  | "ecommerce-faq-chat"
  | "support-ticket-classify"
  | "support-batch-qa"
  | "support-summary-chat";

export type IndustryTemplateApiKind = "chat" | "batch" | "image";

export type IndustryTemplateDef = {
  id: IndustryTemplateId;
  industryId: IndustryPackId;
  apiKind: IndustryTemplateApiKind;
  endpoint: string;
  model: string;
  body: Record<string, unknown>;
  useCaseKey: string;
  inputExampleKey: string;
  expectedResponseKey: string;
  reconcileKey: string;
  billingKey: string;
  boundaryKey: string;
  nextStepKey: string;
  curlLabelKey: string;
};

const API_ROOT = "https://api.tokfai.com/v1";

const HOSPITAL_CHART_PROMPT =
  "请把以下患者自述整理成结构化摘要，分为主诉、持续时间、伴随症状、需医生确认的问题。不要诊断，不要给治疗方案。\n\n患者自述：头痛三天，偶有恶心，无发热。";

const HOSPITAL_BATCH_ITEMS = [
  {
    messages: [
      {
        role: "user",
        content:
          "整理问诊文本为结构化要点（主诉、持续时间、需医生确认项）。不要诊断。\n\n患者：咳嗽一周，夜间加重，无胸痛。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content:
          "整理问诊文本为结构化要点（主诉、持续时间、需医生确认项）。不要诊断。\n\n患者：腹痛两天，饭后明显，无便血。",
      },
    ],
  },
];

const HOSPITAL_FOLLOW_UP_ITEMS = [
  {
    messages: [
      {
        role: "user",
        content:
          "生成复诊提醒短信草稿（不含诊断与治疗建议）。患者：上周因头痛就诊，医嘱为观察随访。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content:
          "生成复诊提醒短信草稿（不含诊断与治疗建议）。患者：高血压随访，需提醒测量血压并预约复诊。",
      },
    ],
  },
];

const HOSPITAL_IMAGE_ASSIST_PROMPT =
  "根据以下影像检查文字描述，整理为结构化要点（检查部位、所见描述、需医生确认项）。不要诊断，不要治疗方案。\n\n描述：头颅 CT 报告草稿：未见明显占位，建议结合临床。";

const AUTO_TICKET_PROMPT =
  "请把以下售后工单整理为：问题类型、用户描述、可能涉及模块、需要人工确认的问题、建议回复草稿。\n\n工单：车辆怠速不稳，仪表盘偶尔亮起发动机故障灯。";

const AUTO_BATCH_ITEMS = [
  {
    messages: [
      {
        role: "user",
        content:
          "归类售后工单：问题类型、模块、需人工确认项。\n\n工单：刹车异响，低速转弯时有摩擦声。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content:
          "归类售后工单：问题类型、模块、需人工确认项。\n\n工单：空调制冷弱，出风口风量小。",
      },
    ],
  },
];

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

const SUPPORT_CLASSIFY_PROMPT =
  "请基于以下 FAQ 和用户问题，生成客服回复草稿。不要承诺退款、赔偿、发货时间，涉及政策时提示人工确认。\n\nFAQ：退货需在签收7天内申请。用户问：我买了10天还能退吗？";

const SUPPORT_BATCH_ITEMS = [
  {
    messages: [
      {
        role: "user",
        content:
          "工单分类与意图：退款申请 / 物流咨询 / 产品故障。输入：我要退款，订单号 A1001。",
      },
    ],
  },
  {
    messages: [
      {
        role: "user",
        content:
          "工单分类与意图：退款申请 / 物流咨询 / 产品故障。输入：快递三天没更新，什么时候到？",
      },
    ],
  },
];

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

function chatBody(model: string, content: string) {
  return {
    model,
    messages: [{ role: "user", content }],
    stream: false,
  };
}

function batchBody(model: string, items: unknown[]) {
  return { model, items };
}

function imageBody(model: string, prompt: string) {
  return {
    model,
    prompt,
    size: "1024x1024",
    n: 1,
    response_format: "url",
  };
}

export const INDUSTRY_TEMPLATES: Record<IndustryTemplateId, IndustryTemplateDef> = {
  "hospital-chart-summary": {
    id: "hospital-chart-summary",
    industryId: "hospital",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-pro",
    body: chatBody("auto-pro", HOSPITAL_CHART_PROMPT),
    useCaseKey: "integration.industryTemplates.hospital.chartSummary.useCase",
    inputExampleKey: "integration.industryTemplates.hospital.chartSummary.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.hospital.boundary",
    nextStepKey: "integration.industryTemplates.hospital.chartSummary.nextStep",
    curlLabelKey: "integration.industryTemplates.hospital.chartSummary.curlLabel",
  },
  "hospital-batch-consult": {
    id: "hospital-batch-consult",
    industryId: "hospital",
    apiKind: "batch",
    endpoint: "/v1/batches/chat",
    model: "auto-fast",
    body: batchBody("auto-fast", HOSPITAL_BATCH_ITEMS),
    useCaseKey: "integration.industryTemplates.hospital.batchConsult.useCase",
    inputExampleKey: "integration.industryTemplates.hospital.batchConsult.input",
    expectedResponseKey: "integration.industryTemplates.batchSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileBatch",
    billingKey: "integration.industryTemplates.billingBatch",
    boundaryKey: "integration.industryTemplates.hospital.boundary",
    nextStepKey: "integration.industryTemplates.hospital.batchConsult.nextStep",
    curlLabelKey: "integration.industryTemplates.hospital.batchConsult.curlLabel",
  },
  "hospital-batch-follow-up": {
    id: "hospital-batch-follow-up",
    industryId: "hospital",
    apiKind: "batch",
    endpoint: "/v1/batches/chat",
    model: "auto-fast",
    body: batchBody("auto-fast", HOSPITAL_FOLLOW_UP_ITEMS),
    useCaseKey: "integration.industryTemplates.hospital.batchFollowUp.useCase",
    inputExampleKey: "integration.industryTemplates.hospital.batchFollowUp.input",
    expectedResponseKey: "integration.industryTemplates.batchSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileBatch",
    billingKey: "integration.industryTemplates.billingBatch",
    boundaryKey: "integration.industryTemplates.hospital.boundary",
    nextStepKey: "integration.industryTemplates.hospital.batchFollowUp.nextStep",
    curlLabelKey: "integration.industryTemplates.hospital.batchFollowUp.curlLabel",
  },
  "hospital-image-assist": {
    id: "hospital-image-assist",
    industryId: "hospital",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-fast",
    body: chatBody("auto-fast", HOSPITAL_IMAGE_ASSIST_PROMPT),
    useCaseKey: "integration.industryTemplates.hospital.imageAssist.useCase",
    inputExampleKey: "integration.industryTemplates.hospital.imageAssist.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.hospital.boundary",
    nextStepKey: "integration.industryTemplates.hospital.imageAssist.nextStep",
    curlLabelKey: "integration.industryTemplates.hospital.imageAssist.curlLabel",
  },
  "auto-ticket-summary": {
    id: "auto-ticket-summary",
    industryId: "automotive",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-pro",
    body: chatBody("auto-pro", AUTO_TICKET_PROMPT),
    useCaseKey: "integration.industryTemplates.automotive.ticketSummary.useCase",
    inputExampleKey: "integration.industryTemplates.automotive.ticketSummary.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.automotive.boundary",
    nextStepKey: "integration.industryTemplates.automotive.ticketSummary.nextStep",
    curlLabelKey: "integration.industryTemplates.automotive.ticketSummary.curlLabel",
  },
  "auto-damage-image": {
    id: "auto-damage-image",
    industryId: "automotive",
    apiKind: "image",
    endpoint: "/v1/images/generations",
    model: "gpt-image-2",
    body: imageBody(
      "gpt-image-2",
      "Clean studio photo of a car front bumper with minor scratch for service documentation."
    ),
    useCaseKey: "integration.industryTemplates.automotive.damageImage.useCase",
    inputExampleKey: "integration.industryTemplates.automotive.damageImage.input",
    expectedResponseKey: "integration.industryTemplates.imageSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingImage",
    boundaryKey: "integration.industryTemplates.automotive.boundary",
    nextStepKey: "integration.industryTemplates.automotive.damageImage.nextStep",
    curlLabelKey: "integration.industryTemplates.automotive.damageImage.curlLabel",
  },
  "auto-batch-tickets": {
    id: "auto-batch-tickets",
    industryId: "automotive",
    apiKind: "batch",
    endpoint: "/v1/batches/chat",
    model: "auto-pro",
    body: batchBody("auto-pro", AUTO_BATCH_ITEMS),
    useCaseKey: "integration.industryTemplates.automotive.batchTickets.useCase",
    inputExampleKey: "integration.industryTemplates.automotive.batchTickets.input",
    expectedResponseKey: "integration.industryTemplates.batchSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileBatch",
    billingKey: "integration.industryTemplates.billingBatch",
    boundaryKey: "integration.industryTemplates.automotive.boundary",
    nextStepKey: "integration.industryTemplates.automotive.batchTickets.nextStep",
    curlLabelKey: "integration.industryTemplates.automotive.batchTickets.curlLabel",
  },
  "ecommerce-batch-sku": {
    id: "ecommerce-batch-sku",
    industryId: "ecommerce",
    apiKind: "batch",
    endpoint: "/v1/batches/chat",
    model: "auto-cheap",
    body: batchBody("auto-cheap", ECOMMERCE_BATCH_ITEMS),
    useCaseKey: "integration.industryTemplates.ecommerce.batchSku.useCase",
    inputExampleKey: "integration.industryTemplates.ecommerce.batchSku.input",
    expectedResponseKey: "integration.industryTemplates.batchSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileBatch",
    billingKey: "integration.industryTemplates.billingBatch",
    boundaryKey: "integration.industryTemplates.ecommerce.boundary",
    nextStepKey: "integration.industryTemplates.ecommerce.batchSku.nextStep",
    curlLabelKey: "integration.industryTemplates.ecommerce.batchSku.curlLabel",
  },
  "ecommerce-product-image": {
    id: "ecommerce-product-image",
    industryId: "ecommerce",
    apiKind: "image",
    endpoint: "/v1/images/generations",
    model: "gpt-image-2",
    body: imageBody(
      "gpt-image-2",
      "Product photo of wireless earbuds on white background, e-commerce listing style."
    ),
    useCaseKey: "integration.industryTemplates.ecommerce.productImage.useCase",
    inputExampleKey: "integration.industryTemplates.ecommerce.productImage.input",
    expectedResponseKey: "integration.industryTemplates.imageSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingImage",
    boundaryKey: "integration.industryTemplates.ecommerce.boundary",
    nextStepKey: "integration.industryTemplates.ecommerce.productImage.nextStep",
    curlLabelKey: "integration.industryTemplates.ecommerce.productImage.curlLabel",
  },
  "ecommerce-faq-chat": {
    id: "ecommerce-faq-chat",
    industryId: "ecommerce",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-fast",
    body: chatBody(
      "auto-fast",
      "为以下商品生成3条客服 FAQ 问答草稿（不含承诺发货时效与赔偿）。商品：便携榨汁杯。"
    ),
    useCaseKey: "integration.industryTemplates.ecommerce.faqChat.useCase",
    inputExampleKey: "integration.industryTemplates.ecommerce.faqChat.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.ecommerce.boundary",
    nextStepKey: "integration.industryTemplates.ecommerce.faqChat.nextStep",
    curlLabelKey: "integration.industryTemplates.ecommerce.faqChat.curlLabel",
  },
  "support-ticket-classify": {
    id: "support-ticket-classify",
    industryId: "support",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-fast",
    body: chatBody("auto-fast", SUPPORT_CLASSIFY_PROMPT),
    useCaseKey: "integration.industryTemplates.support.ticketClassify.useCase",
    inputExampleKey: "integration.industryTemplates.support.ticketClassify.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.support.boundary",
    nextStepKey: "integration.industryTemplates.support.ticketClassify.nextStep",
    curlLabelKey: "integration.industryTemplates.support.ticketClassify.curlLabel",
  },
  "support-batch-qa": {
    id: "support-batch-qa",
    industryId: "support",
    apiKind: "batch",
    endpoint: "/v1/batches/chat",
    model: "auto-fast",
    body: batchBody("auto-fast", SUPPORT_BATCH_ITEMS),
    useCaseKey: "integration.industryTemplates.support.batchQa.useCase",
    inputExampleKey: "integration.industryTemplates.support.batchQa.input",
    expectedResponseKey: "integration.industryTemplates.batchSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileBatch",
    billingKey: "integration.industryTemplates.billingBatch",
    boundaryKey: "integration.industryTemplates.support.boundary",
    nextStepKey: "integration.industryTemplates.support.batchQa.nextStep",
    curlLabelKey: "integration.industryTemplates.support.batchQa.curlLabel",
  },
  "support-summary-chat": {
    id: "support-summary-chat",
    industryId: "support",
    apiKind: "chat",
    endpoint: "/v1/chat/completions",
    model: "auto-fast",
    body: chatBody(
      "auto-fast",
      "摘要以下客服对话并标注待人工确认项：用户投诉物流慢，客服已致歉并查询运单。"
    ),
    useCaseKey: "integration.industryTemplates.support.summaryChat.useCase",
    inputExampleKey: "integration.industryTemplates.support.summaryChat.input",
    expectedResponseKey: "integration.industryTemplates.chatSuccessFields",
    reconcileKey: "integration.industryTemplates.reconcileChat",
    billingKey: "integration.industryTemplates.billingChat",
    boundaryKey: "integration.industryTemplates.support.boundary",
    nextStepKey: "integration.industryTemplates.support.summaryChat.nextStep",
    curlLabelKey: "integration.industryTemplates.support.summaryChat.curlLabel",
  },
};

export const INDUSTRY_TEMPLATE_PACKS: {
  id: IndustryPackId;
  titleKey: string;
  templateIds: IndustryTemplateId[];
}[] = [
  {
    id: "hospital",
    titleKey: "integration.industry.hospital.title",
    templateIds: [
      "hospital-batch-consult",
      "hospital-batch-follow-up",
      "hospital-chart-summary",
      "hospital-image-assist",
    ],
  },
  {
    id: "automotive",
    titleKey: "integration.industry.automotive.title",
    templateIds: [
      "auto-batch-tickets",
      "auto-ticket-summary",
      "auto-damage-image",
    ],
  },
  {
    id: "ecommerce",
    titleKey: "integration.industry.ecommerce.title",
    templateIds: [
      "ecommerce-batch-sku",
      "ecommerce-product-image",
      "ecommerce-faq-chat",
    ],
  },
  {
    id: "support",
    titleKey: "integration.industry.support.title",
    templateIds: [
      "support-batch-qa",
      "support-ticket-classify",
      "support-summary-chat",
    ],
  },
];

export const INDUSTRY_PRIMARY_TEMPLATE: Record<IndustryPackId, IndustryTemplateId> = {
  hospital: "hospital-batch-consult",
  automotive: "auto-batch-tickets",
  ecommerce: "ecommerce-batch-sku",
  support: "support-batch-qa",
};

export const HOSPITAL_TEMPLATE = INDUSTRY_TEMPLATES["hospital-chart-summary"];
export const AUTO_SERVICE_TEMPLATE = INDUSTRY_TEMPLATES["auto-ticket-summary"];
export const ECOMMERCE_TEMPLATE = INDUSTRY_TEMPLATES["ecommerce-batch-sku"];
export const CUSTOMER_SERVICE_TEMPLATE = INDUSTRY_TEMPLATES["support-ticket-classify"];

function curlFromBody(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>
): string {
  const payload = shellSingleQuotedJson(body);
  return `curl -sS ${API_ROOT}${endpoint} -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${payload}'`;
}

function powershellFromBody(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>
): string {
  const payload = powershellJsonBody(body);
  return `curl.exe -sS "${API_ROOT}${endpoint}" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${payload}"`;
}

export function buildTemplateCurlOneLine(
  templateId: IndustryTemplateId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const template = INDUSTRY_TEMPLATES[templateId];
  return curlFromBody(template.endpoint, apiKey, template.body);
}

export function buildTemplatePowerShellCurlOneLine(
  templateId: IndustryTemplateId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const template = INDUSTRY_TEMPLATES[templateId];
  return powershellFromBody(template.endpoint, apiKey, template.body);
}

export function buildIndustryCurlOneLine(
  industryId: IndustryPackId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplateCurlOneLine(INDUSTRY_PRIMARY_TEMPLATE[industryId], apiKey);
}

export function buildIndustryPowerShellCurlOneLine(
  industryId: IndustryPackId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildTemplatePowerShellCurlOneLine(INDUSTRY_PRIMARY_TEMPLATE[industryId], apiKey);
}

export function getTemplateInputJson(templateId: IndustryTemplateId): string {
  return JSON.stringify(INDUSTRY_TEMPLATES[templateId].body, null, 2);
}
