/** Matches TOKFAI_API_KEY_PLACEHOLDER in tokfai-api.ts — kept local so this module can run standalone in offline checks. */
const API_KEY_PLACEHOLDER = "sk-tokfai_xxx";

export type PayloadIndustry = "hospital" | "auto" | "ecommerce" | "support" | "general";

export type PayloadApi = "chat" | "responses" | "image" | "batch";

export type PayloadModel = "auto-fast" | "auto-pro" | "auto-cheap" | "gpt-image-2";

export type PayloadBuilderInput = {
  industry: PayloadIndustry;
  api: PayloadApi;
  model: PayloadModel;
  fields: Record<string, string | string[]>;
};

export type FieldSchemaType = "input" | "textarea" | "tags";

export type PayloadFieldSchema = {
  id: string;
  labelKey: string;
  type: FieldSchemaType;
  required?: boolean;
  placeholderKey?: string;
};

export type GeneratedPayload = {
  title: string;
  endpoint: string;
  model: string;
  requestJson: string;
  oneLineCurl: string;
  nodePayload: string;
  pythonPayload: string;
  batchItems?: string;
  expectedOutput: string[];
  reconcileSteps: string[];
  safetyBoundary: string[];
  validationWarnings: string[];
};

export type TranslateFn = (key: string) => string;

export const PAYLOAD_BUILDER_PATH = "/dashboard/payload-builder";
export const PAYLOAD_BUILDER_STORAGE_KEY = "tokfai-payload-builder-prefs";

const API_ROOT = "https://api.tokfai.com/v1";

const SAFETY_BOUNDARY_KEYS: Record<PayloadIndustry, string> = {
  general: "integration.payloadBuilder.safetyGeneral",
  hospital: "integration.industryTemplates.hospital.boundary",
  auto: "integration.industryTemplates.automotive.boundary",
  ecommerce: "integration.industryTemplates.ecommerce.boundary",
  support: "integration.industryTemplates.support.boundary",
};

const INDUSTRY_FIELD_IDS: Record<PayloadIndustry, string[]> = {
  hospital: [
    "patient_context",
    "symptoms_or_summary",
    "visit_goal",
    "doctor_notes",
    "output_format",
    "boundary_note",
  ],
  auto: [
    "ticket_title",
    "vehicle_model",
    "issue_description",
    "service_history",
    "customer_message",
    "output_format",
    "reviewer_note",
  ],
  ecommerce: [
    "product_title",
    "sku_list",
    "product_specs",
    "selling_points",
    "target_audience",
    "tone",
    "publish_review_note",
  ],
  support: [
    "ticket_subject",
    "customer_message",
    "conversation_history",
    "urgency",
    "policy_context",
    "output_format",
    "no_refund_commitment_note",
  ],
  general: ["task", "context", "input_text", "output_format", "constraints"],
};

const TAG_FIELDS = new Set(["sku_list"]);

export function getIndustryFieldSchema(industry: PayloadIndustry, api: PayloadApi): PayloadFieldSchema[] {
  const ids = INDUSTRY_FIELD_IDS[industry];
  return ids.map((id) => {
    const isTextarea =
      id.includes("note") ||
      id.includes("history") ||
      id.includes("description") ||
      id.includes("context") ||
      id === "input_text" ||
      id === "product_specs" ||
      id === "selling_points";
    const type: FieldSchemaType = TAG_FIELDS.has(id) ? "tags" : isTextarea ? "textarea" : "input";
    return {
      id,
      labelKey: `integration.payloadBuilder.field.${industry}.${id}`,
      type,
      required:
        id !== "doctor_notes" &&
        id !== "service_history" &&
        id !== "reviewer_note" &&
        id !== "publish_review_note" &&
        id !== "no_refund_commitment_note" &&
        id !== "constraints" &&
        id !== "boundary_note",
      placeholderKey: `integration.payloadBuilder.placeholder.${industry}.${id}`,
    };
  }).filter((field) => {
    if (api === "image") {
      return ["product_title", "product_specs", "selling_points", "target_audience", "tone", "publish_review_note", "vehicle_model", "issue_description"].includes(field.id) || (industry === "general" && field.id === "input_text");
    }
    if (api === "responses") {
      return !TAG_FIELDS.has(field.id) && field.id !== "sku_list";
    }
    return true;
  });
}

export function recommendPayloadModel(
  industry: PayloadIndustry,
  api: PayloadApi
): PayloadModel {
  if (api === "image") return "gpt-image-2";
  if (industry === "ecommerce" && api === "batch") return "auto-cheap";
  if (industry === "hospital" || industry === "auto") return "auto-pro";
  return "auto-fast";
}

export function emptyFieldsForIndustry(industry: PayloadIndustry): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const id of INDUSTRY_FIELD_IDS[industry]) {
    fields[id] = TAG_FIELDS.has(id) ? [] : "";
  }
  return fields;
}

export function sampleFieldsForIndustry(industry: PayloadIndustry): Record<string, string | string[]> {
  switch (industry) {
    case "hospital":
      return {
        patient_context: "45岁，既往高血压，本次门诊随访。",
        symptoms_or_summary: "头痛三天，偶有恶心，无发热，无视力模糊。",
        visit_goal: "整理病历摘要供医生审阅",
        doctor_notes: "建议观察，暂不开药",
        output_format: "主诉、持续时间、伴随症状、需医生确认项",
        boundary_note: "仅辅助整理，不诊断，不给治疗方案",
      };
    case "auto":
      return {
        ticket_title: "发动机故障灯偶发亮起",
        vehicle_model: "某品牌 SUV 2022款",
        issue_description: "怠速不稳，低速转弯时偶有抖动",
        service_history: "上次保养更换机油机滤，里程 3.2 万公里",
        customer_message: "最近开车感觉不太顺，希望尽快检查",
        output_format: "问题类型、模块、需人工确认项、建议回复草稿",
        reviewer_note: "最终维修判断由企业人员确认",
      };
    case "ecommerce":
      return {
        product_title: "无线蓝牙耳机",
        sku_list: ["SKU-EAR-001", "SKU-EAR-002"],
        product_specs: "蓝牙5.3，续航30小时，IPX5防水",
        selling_points: "低延迟游戏模式、舒适佩戴、快充",
        target_audience: "通勤与轻度游戏用户",
        tone: "专业简洁",
        publish_review_note: "上架前由运营审核文案与图片",
      };
    case "support":
      return {
        ticket_subject: "退货咨询",
        customer_message: "我买了10天还能退吗？",
        conversation_history: "用户已签收10天，订单号 A1001",
        urgency: "普通",
        policy_context: "FAQ：退货需在签收7天内申请",
        output_format: "回复草稿，不承诺退款时效",
        no_refund_commitment_note: "不自动承诺退款、赔付或发货时间",
      };
    default:
      return {
        task: "Summarize the input in three bullet points",
        context: "Internal ops note — not customer-facing",
        input_text: "Tokfai API integration smoke test message.",
        output_format: "Bullet list",
        constraints: "English only, under 80 words",
      };
  }
}

function fieldText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return (value ?? "").trim();
}

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function curlPostOneLine(path: string, apiKey: string, body: Record<string, unknown>): string {
  const payload = shellSingleQuotedJson(body);
  return `curl -sS ${API_ROOT}${path} -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${payload}'`;
}

function buildChatUserContent(industry: PayloadIndustry, fields: Record<string, string | string[]>): string {
  switch (industry) {
    case "hospital":
      return [
        fields.output_format ? `输出格式：${fieldText(fields.output_format)}` : "",
        fields.boundary_note ? `边界：${fieldText(fields.boundary_note)}` : "",
        `患者背景：${fieldText(fields.patient_context)}`,
        `症状/摘要：${fieldText(fields.symptoms_or_summary)}`,
        `就诊目的：${fieldText(fields.visit_goal)}`,
        fieldText(fields.doctor_notes) ? `医生备注：${fieldText(fields.doctor_notes)}` : "",
        "不要诊断，不要给治疗方案，不替代医生。",
      ]
        .filter(Boolean)
        .join("\n");
    case "auto":
      return [
        fields.output_format ? `输出格式：${fieldText(fields.output_format)}` : "",
        fields.reviewer_note ? `审核说明：${fieldText(fields.reviewer_note)}` : "",
        `工单标题：${fieldText(fields.ticket_title)}`,
        `车型：${fieldText(fields.vehicle_model)}`,
        `问题描述：${fieldText(fields.issue_description)}`,
        fieldText(fields.service_history) ? `维修历史：${fieldText(fields.service_history)}` : "",
        `客户留言：${fieldText(fields.customer_message)}`,
        "最终判断由企业人员确认后进入工单。",
      ]
        .filter(Boolean)
        .join("\n");
    case "ecommerce":
      return [
        fields.publish_review_note ? `发布说明：${fieldText(fields.publish_review_note)}` : "",
        `商品：${fieldText(fields.product_title)}`,
        fieldText(fields.sku_list) ? `SKU：${fieldText(fields.sku_list)}` : "",
        `规格：${fieldText(fields.product_specs)}`,
        `卖点：${fieldText(fields.selling_points)}`,
        `受众：${fieldText(fields.target_audience)}`,
        `语气：${fieldText(fields.tone)}`,
        "发布前由业务人员审核。",
      ]
        .filter(Boolean)
        .join("\n");
    case "support":
      return [
        fields.output_format ? `输出格式：${fieldText(fields.output_format)}` : "",
        fields.no_refund_commitment_note ? `边界：${fieldText(fields.no_refund_commitment_note)}` : "",
        `主题：${fieldText(fields.ticket_subject)}`,
        `客户消息：${fieldText(fields.customer_message)}`,
        fieldText(fields.conversation_history) ? `会话历史：${fieldText(fields.conversation_history)}` : "",
        `紧急程度：${fieldText(fields.urgency)}`,
        `政策上下文：${fieldText(fields.policy_context)}`,
        "不自动承诺退款、赔付或业务结果。",
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return [
        `任务：${fieldText(fields.task)}`,
        fieldText(fields.context) ? `上下文：${fieldText(fields.context)}` : "",
        `输入：${fieldText(fields.input_text)}`,
        fields.output_format ? `输出格式：${fieldText(fields.output_format)}` : "",
        fieldText(fields.constraints) ? `约束：${fieldText(fields.constraints)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
  }
}

function buildResponsesInput(industry: PayloadIndustry, fields: Record<string, string | string[]>): string {
  if (industry === "general") return fieldText(fields.input_text) || fieldText(fields.task);
  return buildChatUserContent(industry, fields);
}

function buildImagePrompt(industry: PayloadIndustry, fields: Record<string, string | string[]>): string {
  if (industry === "ecommerce") {
    return `Product listing image: ${fieldText(fields.product_title)}. Specs: ${fieldText(fields.product_specs)}. Style: ${fieldText(fields.tone)}, audience: ${fieldText(fields.target_audience)}. Clean ecommerce background.`;
  }
  if (industry === "auto") {
    return `Vehicle service reference image assist for ${fieldText(fields.vehicle_model)}: ${fieldText(fields.issue_description)}. No safety verdict — descriptive only.`;
  }
  return fieldText(fields.input_text) || `Professional product-style image for: ${fieldText(fields.task)}`;
}

export function buildChatPayloadBody(model: string, userContent: string): Record<string, unknown> {
  return {
    model,
    messages: [{ role: "user", content: userContent }],
    stream: false,
  };
}

export function buildResponsesPayloadBody(model: string, input: string): Record<string, unknown> {
  return { model, input };
}

export function buildImagePayloadBody(model: string, prompt: string): Record<string, unknown> {
  return {
    model,
    prompt,
    size: "1024x1024",
    n: 1,
    response_format: "url",
  };
}

export function buildBatchPayloadBody(
  model: string,
  items: Array<{ messages: Array<{ role: string; content: string }> }>
): Record<string, unknown> {
  return { model, items };
}

function buildBatchItemsFromFields(
  industry: PayloadIndustry,
  fields: Record<string, string | string[]>,
  model: string
): Array<{ messages: Array<{ role: string; content: string }> }> {
  if (industry === "ecommerce" && Array.isArray(fields.sku_list) && fields.sku_list.length > 0) {
    return fields.sku_list.map((sku) => ({
      messages: [
        {
          role: "user",
          content: `SKU ${sku} — 商品：${fieldText(fields.product_title)}。规格：${fieldText(fields.product_specs)}。生成标题、3条卖点、80字内详情文案。发布前人工审核。`,
        },
      ],
    }));
  }
  const base = buildChatUserContent(industry, fields);
  const variants = [
    base,
    `${base}\n\n请用更简短的要点格式输出。`,
    `${base}\n\n请用表格友好的结构化格式输出。`,
  ];
  return variants.map((content) => ({
    messages: [{ role: "user", content }],
  }));
}

export function validatePayloadFields(input: PayloadBuilderInput): string[] {
  const warnings: string[] = [];
  const schema = getIndustryFieldSchema(input.industry, input.api);
  for (const field of schema) {
    if (!field.required) continue;
    const value = input.fields[field.id];
    if (Array.isArray(value) && value.length === 0) {
      warnings.push(`field_missing:${field.id}`);
    } else if (!fieldText(value)) {
      warnings.push(`field_missing:${field.id}`);
    }
  }
  if (input.api === "image" && input.model !== "gpt-image-2") {
    warnings.push("image_model_mismatch");
  }
  warnings.push("browser_sensitive_data");
  return warnings;
}

function metaOutput(t: TranslateFn, api: PayloadApi): Pick<GeneratedPayload, "expectedOutput" | "reconcileSteps"> {
  const chatExpected = [
    t("integration.starterTemplates.template.one-line-chat-curl.expected1"),
    t("integration.starterTemplates.template.one-line-chat-curl.expected2"),
  ];
  const imageExpected = [
    t("integration.starterTemplates.template.one-line-image-curl.expected1"),
    t("integration.starterTemplates.template.one-line-image-curl.expected2"),
  ];
  const batchExpected = [
    t("integration.starterTemplates.template.one-line-batch-create-curl.expected1"),
    t("integration.starterTemplates.template.one-line-batch-poll-curl.expected2"),
  ];
  const responsesExpected = [
    t("integration.starterTemplates.template.one-line-responses-curl.expected1"),
    t("integration.starterTemplates.template.one-line-responses-curl.expected2"),
  ];
  const reconcileChat = [
    t("integration.starterTemplates.reconcileStep1"),
    t("integration.starterTemplates.reconcileStep2"),
    t("integration.starterTemplates.reconcileStep3"),
  ];
  const reconcileBatch = [
    t("integration.starterTemplates.reconcileBatchStep1"),
    t("integration.starterTemplates.reconcileBatchStep2"),
    t("integration.starterTemplates.reconcileBatchStep3"),
  ];
  return {
    expectedOutput:
      api === "image" ? imageExpected : api === "batch" ? batchExpected : api === "responses" ? responsesExpected : chatExpected,
    reconcileSteps: api === "batch" ? reconcileBatch : reconcileChat,
  };
}

function nodePayloadSnippet(body: Record<string, unknown>): string {
  const json = JSON.stringify(body, null, 2);
  return `const payload = ${json};`;
}

function pythonPayloadSnippet(body: Record<string, unknown>): string {
  const json = JSON.stringify(body, null, 2)
    .replace(/true/g, "True")
    .replace(/false/g, "False")
    .replace(/null/g, "None");
  return `payload = ${json}`;
}

export function buildPayloadBuilderHref(
  partial: Partial<Pick<PayloadBuilderInput, "industry" | "api" | "model">> = {}
): string {
  const params = new URLSearchParams();
  if (partial.industry) params.set("industry", partial.industry);
  if (partial.api) params.set("api", partial.api);
  if (partial.model) params.set("model", partial.model);
  const qs = params.toString();
  return qs ? `${PAYLOAD_BUILDER_PATH}?${qs}` : PAYLOAD_BUILDER_PATH;
}

export function parsePayloadBuilderSearchParams(searchParams: URLSearchParams): Partial<PayloadBuilderInput> {
  const partial: Partial<PayloadBuilderInput> = {};
  const industry = searchParams.get("industry");
  const api = searchParams.get("api");
  const model = searchParams.get("model");
  if (industry === "hospital" || industry === "auto" || industry === "ecommerce" || industry === "support" || industry === "general") {
    partial.industry = industry;
  }
  if (api === "chat" || api === "responses" || api === "image" || api === "batch") {
    partial.api = api;
  }
  if (model === "auto-fast" || model === "auto-pro" || model === "auto-cheap" || model === "gpt-image-2") {
    partial.model = model;
  }
  return partial;
}

export type PayloadBuilderPrefs = {
  industry: PayloadIndustry;
  api: PayloadApi;
  model: PayloadModel;
};

export function readPayloadBuilderPrefs(): PayloadBuilderPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PAYLOAD_BUILDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PayloadBuilderPrefs;
    if (!parsed.industry || !parsed.api || !parsed.model) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePayloadBuilderPrefs(prefs: PayloadBuilderPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PAYLOAD_BUILDER_STORAGE_KEY,
      JSON.stringify({ industry: prefs.industry, api: prefs.api, model: prefs.model })
    );
  } catch {
    /* ignore */
  }
}

export function buildPayload(
  input: PayloadBuilderInput,
  apiKey = API_KEY_PLACEHOLDER,
  t: TranslateFn = (key) => key
): GeneratedPayload {
  const model = input.api === "image" ? "gpt-image-2" : input.model;
  const validationWarnings = validatePayloadFields(input);
  const meta = metaOutput(t, input.api);
  const safetyKey = SAFETY_BOUNDARY_KEYS[input.industry];
  const safetyBoundary = [t(safetyKey)];

  let endpoint = "POST /v1/chat/completions";
  let body: Record<string, unknown>;
  let batchItems: string | undefined;

  if (input.api === "chat") {
    endpoint = "POST /v1/chat/completions";
    body = buildChatPayloadBody(model, buildChatUserContent(input.industry, input.fields));
  } else if (input.api === "responses") {
    endpoint = "POST /v1/responses";
    body = buildResponsesPayloadBody(model, buildResponsesInput(input.industry, input.fields));
  } else if (input.api === "image") {
    endpoint = "POST /v1/images/generations";
    body = buildImagePayloadBody("gpt-image-2", buildImagePrompt(input.industry, input.fields));
  } else {
    endpoint = "POST /v1/batches/chat";
    const items = buildBatchItemsFromFields(input.industry, input.fields, model);
    body = buildBatchPayloadBody(model, items);
    batchItems = JSON.stringify(items, null, 2);
  }

  const requestJson = JSON.stringify(body, null, 2);
  const path =
    input.api === "chat"
      ? "/chat/completions"
      : input.api === "responses"
        ? "/responses"
        : input.api === "image"
          ? "/images/generations"
          : "/batches/chat";

  const oneLineCurl = curlPostOneLine(path, apiKey, body);
  const nodePayload = nodePayloadSnippet(body);
  const pythonPayload = pythonPayloadSnippet(body);

  const titleKey = `integration.payloadBuilder.generatedTitle.${input.api}`;

  return {
    title: t(titleKey),
    endpoint,
    model: input.api === "image" ? "gpt-image-2" : model,
    requestJson,
    oneLineCurl,
    nodePayload,
    pythonPayload,
    batchItems,
    expectedOutput: meta.expectedOutput,
    reconcileSteps: meta.reconcileSteps,
    safetyBoundary,
    validationWarnings,
  };
}

export function buildConfiguratorHrefFromPayload(
  input: Pick<PayloadBuilderInput, "industry" | "api" | "model">
): string {
  const params = new URLSearchParams();
  params.set("industry", input.industry);
  params.set("api", input.api);
  params.set("model", input.model);
  params.set("language", "curl");
  params.set("workload", input.api === "batch" ? "small-batch" : "single");
  return `/dashboard/starter-templates#template-configurator?${params.toString()}`;
}
