import { buildImageApiCurlOneLine } from "@/lib/customer-image-api-chapter";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
} from "@/lib/tokfai-api";

export type ConfiguratorIndustry = "hospital" | "auto" | "ecommerce" | "support" | "general";

export type ConfiguratorApi = "chat" | "responses" | "image" | "batch";

export type ConfiguratorLanguage = "curl" | "powershell" | "node" | "python";

export type ConfiguratorModel = "auto-fast" | "auto-pro" | "auto-cheap" | "gpt-image-2";

export type ConfiguratorWorkloadSize = "single" | "small-batch" | "large-batch";

export type TemplateConfiguratorInput = {
  industry: ConfiguratorIndustry;
  api: ConfiguratorApi;
  language: ConfiguratorLanguage;
  model: ConfiguratorModel;
  workloadSize: ConfiguratorWorkloadSize;
  useCase?: string;
};

export type GeneratedTemplate = {
  title: string;
  endpoint: string;
  model: string;
  copyText: string;
  expectedOutput: string[];
  reconcileSteps: string[];
  retryAdvice: string[];
  safetyBoundary: string[];
  relatedDocs: string[];
};

export type TranslateFn = (key: string) => string;

export const TEMPLATE_CONFIGURATOR_HASH = "template-configurator";
export const TEMPLATE_CONFIGURATOR_PATH = `/dashboard/starter-templates#${TEMPLATE_CONFIGURATOR_HASH}`;

export const DEFAULT_CONFIGURATOR_INPUT: TemplateConfiguratorInput = {
  industry: "general",
  api: "chat",
  language: "curl",
  model: "auto-fast",
  workloadSize: "single",
};

const API_ROOT = "https://api.tokfai.com/v1";
const BATCH_ID_PLACEHOLDER = "batch_xxx";

const GENERAL_CHAT_PROMPT = "Say ok only.";
const GENERAL_RESPONSES_INPUT = "Say ok only.";

const HOSPITAL_CHAT_PROMPT =
  "请把以下患者自述整理成结构化摘要，分为主诉、持续时间、伴随症状、需医生确认的问题。不要诊断，不要给治疗方案。\n\n患者自述：头痛三天，偶有恶心，无发热。";

const AUTO_CHAT_PROMPT =
  "请把以下售后工单整理为：问题类型、用户描述、可能涉及模块、需要人工确认的问题、建议回复草稿。\n\n工单：车辆怠速不稳，仪表盘偶尔亮起发动机故障灯。";

const ECOMMERCE_CHAT_PROMPT =
  "商品：无线蓝牙耳机。请生成 FAQ 回答草稿（不承诺退款、发货时间）。用户问：续航多久？";

const SUPPORT_CHAT_PROMPT =
  "请基于 FAQ 和用户问题，生成客服回复草稿。不要承诺退款、赔偿、发货时间。\n\nFAQ：退货需在签收7天内申请。用户问：我买了10天还能退吗？";

const ECOMMERCE_IMAGE_PROMPT =
  "Clean product photo of wireless earbuds on white background, ecommerce listing style.";

const AUTO_IMAGE_PROMPT =
  "Vehicle exterior damage photo assist — describe visible damage areas for service ticket (no safety verdict).";

const BATCH_ITEM_TEMPLATES: Record<ConfiguratorIndustry, string[]> = {
  general: [
    "Say ok only.",
    "Say hello only.",
    "Say hi only.",
    "Reply with one word: ready.",
    "Reply with one word: done.",
    "Reply with one word: yes.",
    "Reply with one word: go.",
    "Reply with one word: ok.",
  ],
  hospital: [
    "整理问诊文本为结构化要点（主诉、持续时间、需医生确认项）。不要诊断。\n\n患者：咳嗽一周，夜间加重。",
    "整理问诊文本为结构化要点。不要诊断。\n\n患者：腹痛两天，饭后明显。",
    "生成复诊提醒草稿（不含诊断与治疗建议）。患者：上周头痛就诊，医嘱观察随访。",
    "生成复诊提醒草稿。患者：高血压随访，提醒测量血压。",
    "整理问诊要点。不要诊断。\n\n患者：皮疹三天，无发热。",
    "整理问诊要点。不要诊断。\n\n患者：腰痛一周，久坐加重。",
  ],
  auto: [
    "归类售后工单：问题类型、模块、需人工确认项。\n\n工单：刹车异响，低速转弯摩擦声。",
    "归类售后工单。\n\n工单：空调制冷弱，出风口风量小。",
    "归类售后工单。\n\n工单：中控屏偶发黑屏。",
    "归类售后工单。\n\n工单：充电口接触不良。",
    "归类售后工单。\n\n工单：轮胎胎压报警。",
    "归类售后工单。\n\n工单：发动机异响，冷启动明显。",
  ],
  ecommerce: [
    "商品：无线蓝牙耳机。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：便携榨汁杯。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：瑜伽垫。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：保温杯。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：电动牙刷。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：旅行背包。请生成标题、3条卖点、详情页短文案（80字内）。",
    "商品：智能手表。请生成标题、3条卖点、详情页短文案（80字内）。",
  ],
  support: [
    "工单分类与意图。输入：我要退款，订单号 A1001。",
    "工单分类与意图。输入：快递三天没更新，什么时候到？",
    "工单分类与意图。输入：产品无法开机，需要维修指引。",
    "工单分类与意图。输入：优惠券未生效，请核实。",
    "工单分类与意图。输入：发票抬头需要修改。",
    "工单分类与意图。输入：换货流程是什么？",
  ],
};

const SAFETY_BOUNDARY_KEYS: Record<ConfiguratorIndustry, string | null> = {
  general: "integration.templateConfigurator.safetyGeneral",
  hospital: "integration.industryTemplates.hospital.boundary",
  auto: "integration.industryTemplates.automotive.boundary",
  ecommerce: "integration.industryTemplates.ecommerce.boundary",
  support: "integration.industryTemplates.support.boundary",
};

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

function curlPostOneLine(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): string {
  const payload = shellSingleQuotedJson(body);
  return `curl -sS ${API_ROOT}${path} -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${payload}'`;
}

function curlGetOneLine(path: string, apiKey: string): string {
  return `curl -sS ${API_ROOT}${path} -H "Authorization: Bearer ${apiKey}"`;
}

function powershellPostOneLine(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): string {
  const payload = powershellJsonBody(body);
  return `curl.exe -sS "${API_ROOT}${path}" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${payload}"`;
}

function powershellGetOneLine(path: string, apiKey: string): string {
  return `curl.exe -sS "${API_ROOT}${path}" -H "Authorization: Bearer ${apiKey}"`;
}

export function recommendConfiguratorModel(
  input: Pick<TemplateConfiguratorInput, "industry" | "api" | "workloadSize">
): ConfiguratorModel {
  if (input.api === "image") return "gpt-image-2";
  if (
    input.industry === "ecommerce" &&
    (input.api === "batch" || input.workloadSize !== "single")
  ) {
    return "auto-cheap";
  }
  if (input.industry === "hospital" && input.api === "chat") return "auto-pro";
  if (input.industry === "auto" && input.api === "chat") return "auto-pro";
  if (input.industry === "support") return "auto-fast";
  return "auto-fast";
}

export function resolveEffectiveConfiguratorApi(
  input: TemplateConfiguratorInput
): ConfiguratorApi {
  if (input.api === "image" || input.api === "responses") return input.api;
  if (input.api === "batch") return "batch";
  if (input.workloadSize !== "single") return "batch";
  return "chat";
}

function batchItemCount(workloadSize: ConfiguratorWorkloadSize): number {
  if (workloadSize === "single") return 1;
  if (workloadSize === "small-batch") return 3;
  return 6;
}

function buildBatchItems(industry: ConfiguratorIndustry, count: number): unknown[] {
  const templates = BATCH_ITEM_TEMPLATES[industry];
  return templates.slice(0, count).map((content) => ({
    messages: [{ role: "user", content }],
  }));
}

function chatPromptForIndustry(industry: ConfiguratorIndustry): string {
  switch (industry) {
    case "hospital":
      return HOSPITAL_CHAT_PROMPT;
    case "auto":
      return AUTO_CHAT_PROMPT;
    case "ecommerce":
      return ECOMMERCE_CHAT_PROMPT;
    case "support":
      return SUPPORT_CHAT_PROMPT;
    default:
      return GENERAL_CHAT_PROMPT;
  }
}

function imagePromptForIndustry(industry: ConfiguratorIndustry): string {
  switch (industry) {
    case "auto":
      return AUTO_IMAGE_PROMPT;
    case "ecommerce":
      return ECOMMERCE_IMAGE_PROMPT;
    default:
      return "Create a clean product-style image for your use case.";
  }
}

function chatBody(model: string, content: string) {
  return {
    model,
    messages: [{ role: "user", content }],
    stream: false,
  };
}

function responsesBody(model: string, input: string) {
  return { model, input };
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

function batchBody(model: string, items: unknown[]) {
  return { model, items };
}

export function buildConfiguratorBatchTripleCurl(
  apiKey: string,
  model: string,
  items: unknown[],
  language: ConfiguratorLanguage
): string {
  const createBody = batchBody(model, items);
  const create =
    language === "powershell"
      ? powershellPostOneLine("/batches/chat", apiKey, createBody)
      : curlPostOneLine("/batches/chat", apiKey, createBody);
  const poll =
    language === "powershell"
      ? powershellGetOneLine(`/batches/${BATCH_ID_PLACEHOLDER}`, apiKey)
      : curlGetOneLine(`/batches/${BATCH_ID_PLACEHOLDER}`, apiKey);
  const listItems =
    language === "powershell"
      ? powershellGetOneLine(`/batches/${BATCH_ID_PLACEHOLDER}/items`, apiKey)
      : curlGetOneLine(`/batches/${BATCH_ID_PLACEHOLDER}/items`, apiKey);

  return `# 1) Create batch\n${create}\n\n# 2) Poll status (replace batch id from step 1)\n${poll}\n\n# 3) List items\n${listItems}`;
}

function buildNodeChatFile(apiKey: string, model: string, prompt: string): string {
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `// Node fetch — save as tokfai-chat.mjs and run with: node tokfai-chat.mjs
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";

const res = await fetch("${TOKFAI_API_BASE_URL}/chat/completions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "${escapedPrompt}" }],
    stream: false,
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(body.error?.code, body.error?.message);
  throw new Error(body.error?.code ?? "request_failed");
}

console.log(body.choices[0]?.message?.content);
console.log("request_id:", body.request_id ?? body.tokfai?.request_id);
console.log("credits_charged:", body.credits_charged ?? body.tokfai?.credits_charged);
console.log("resolved_model:", body.tokfai?.resolved_model ?? body.model);`;
}

function buildPythonChatFile(apiKey: string, model: string, prompt: string): string {
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `# pip install requests — save as tokfai_chat.py
import os
import requests

api_key = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
url = "${TOKFAI_API_BASE_URL}/chat/completions"
headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
payload = {
    "model": "${model}",
    "messages": [{"role": "user", "content": "${escapedPrompt}"}],
    "stream": False,
}

res = requests.post(url, headers=headers, json=payload, timeout=60)
body = res.json()
if res.status_code != 200:
    print(body.get("error", {}).get("code"), body.get("error", {}).get("message"))
    raise SystemExit(1)

print(body["choices"][0]["message"]["content"])
tokfai = body.get("tokfai") or {}
print("request_id:", body.get("request_id") or tokfai.get("request_id"))
print("credits_charged:", body.get("credits_charged") or tokfai.get("credits_charged"))
print("resolved_model:", tokfai.get("resolved_model") or body.get("model"))`;
}

function buildNodeResponsesFile(apiKey: string, model: string, input: string): string {
  const escaped = input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `// Node fetch — Responses API
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";

const res = await fetch("${TOKFAI_API_BASE_URL}/responses", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "${model}", input: "${escaped}" }),
});

const body = await res.json();
console.log(JSON.stringify(body, null, 2));
console.log("request_id:", body.request_id ?? body.tokfai?.request_id);`;
}

function buildPythonResponsesFile(apiKey: string, model: string, input: string): string {
  const escaped = input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `# pip install requests — Responses API
import os
import requests

api_key = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
res = requests.post(
    "${TOKFAI_API_BASE_URL}/responses",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    json={"model": "${model}", "input": "${escaped}"},
    timeout=60,
)
body = res.json()
print(body)
print("request_id:", body.get("request_id") or (body.get("tokfai") or {}).get("request_id"))`;
}

function buildNodeImageFile(apiKey: string, model: string, prompt: string): string {
  const escaped = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `// Node fetch — Image API (response_format url)
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";

const res = await fetch("${TOKFAI_API_BASE_URL}/images/generations", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${model}",
    prompt: "${escaped}",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  }),
});

const body = await res.json();
console.log("url:", body.data?.[0]?.url);
console.log("request_id:", body.request_id ?? body.tokfai?.request_id);
console.log("credits_charged:", body.credits_charged ?? body.tokfai?.credits_charged);`;
}

function buildPythonImageFile(apiKey: string, model: string, prompt: string): string {
  const escaped = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `# pip install requests — Image API
import os
import requests

api_key = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
res = requests.post(
    "${TOKFAI_API_BASE_URL}/images/generations",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    json={
        "model": "${model}",
        "prompt": "${escaped}",
        "size": "1024x1024",
        "n": 1,
        "response_format": "url",
    },
    timeout=120,
)
body = res.json()
print("url:", (body.get("data") or [{}])[0].get("url"))
print("request_id:", body.get("request_id") or (body.get("tokfai") or {}).get("request_id"))`;
}

function buildNodeBatchFile(apiKey: string, model: string, items: unknown[]): string {
  const itemsLiteral = JSON.stringify(items);
  return `// Node fetch — Batch create / poll / items
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";
const baseURL = "${TOKFAI_API_BASE_URL}";

const createRes = await fetch(\`\${baseURL}/batches/chat\`, {
  method: "POST",
  headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "${model}",
    items: ${itemsLiteral},
  }),
});
const batch = await createRes.json();
console.log("batch id:", batch.id);

const pollRes = await fetch(\`\${baseURL}/batches/\${batch.id}\`, {
  headers: { Authorization: \`Bearer \${apiKey}\` },
});
console.log("status:", (await pollRes.json()).status);

const itemsRes = await fetch(\`\${baseURL}/batches/\${batch.id}/items\`, {
  headers: { Authorization: \`Bearer \${apiKey}\` },
});
const itemsBody = await itemsRes.json();
for (const item of itemsBody.data ?? []) {
  console.log("item", item.index, item.status, item.request_id, item.credits_charged);
}`;
}

function buildPythonBatchFile(apiKey: string, model: string, items: unknown[]): string {
  const itemsLiteral = JSON.stringify(items, null, 4).replace(/\n/g, "\n    ");
  return `# pip install requests — Batch create / poll / items
import os
import requests

base_url = "${TOKFAI_API_BASE_URL}"
api_key = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

create = requests.post(
    f"{base_url}/batches/chat",
    headers=headers,
    json={
        "model": "${model}",
        "items": ${itemsLiteral},
    },
    timeout=60,
)
batch = create.json()
print("batch id:", batch.get("id"))

poll = requests.get(f"{base_url}/batches/{batch['id']}", headers=headers, timeout=30)
print("status:", poll.json().get("status"))

items = requests.get(f"{base_url}/batches/{batch['id']}/items", headers=headers, timeout=30)
for item in items.json().get("data") or []:
    print("item", item.get("index"), item.get("status"), item.get("request_id"), item.get("credits_charged"))`;
}

function metaLists(
  t: TranslateFn,
  effectiveApi: ConfiguratorApi
): Pick<
  GeneratedTemplate,
  "expectedOutput" | "reconcileSteps" | "retryAdvice" | "safetyBoundary" | "relatedDocs"
> {
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

  const retryAdvice = [
    t("integration.starterTemplates.retryAdvice1"),
    t("integration.starterTemplates.retryAdvice2"),
  ];

  return {
    expectedOutput:
      effectiveApi === "image"
        ? imageExpected
        : effectiveApi === "batch"
          ? batchExpected
          : effectiveApi === "responses"
            ? responsesExpected
            : chatExpected,
    reconcileSteps: effectiveApi === "batch" ? reconcileBatch : reconcileChat,
    retryAdvice,
    safetyBoundary: [],
    relatedDocs: ["template-configurator", "starter-templates", "usage-credits"],
  };
}

export function buildConfiguratorHref(
  partial: Partial<TemplateConfiguratorInput> = {}
): string {
  const params = new URLSearchParams();
  if (partial.industry) params.set("industry", partial.industry);
  if (partial.api) params.set("api", partial.api);
  if (partial.language) params.set("language", partial.language);
  if (partial.model) params.set("model", partial.model);
  if (partial.workloadSize) params.set("workload", partial.workloadSize);
  const qs = params.toString();
  return qs ? `${TEMPLATE_CONFIGURATOR_PATH}?${qs}` : TEMPLATE_CONFIGURATOR_PATH;
}

export function parseConfiguratorSearchParams(
  searchParams: URLSearchParams
): Partial<TemplateConfiguratorInput> {
  const industry = searchParams.get("industry");
  const api = searchParams.get("api");
  const language = searchParams.get("language");
  const model = searchParams.get("model");
  const workload = searchParams.get("workload");

  const partial: Partial<TemplateConfiguratorInput> = {};
  if (
    industry === "hospital" ||
    industry === "auto" ||
    industry === "ecommerce" ||
    industry === "support" ||
    industry === "general"
  ) {
    partial.industry = industry;
  }
  if (
    api === "chat" ||
    api === "responses" ||
    api === "image" ||
    api === "batch"
  ) {
    partial.api = api;
  }
  if (
    language === "curl" ||
    language === "powershell" ||
    language === "node" ||
    language === "python"
  ) {
    partial.language = language;
  }
  if (
    model === "auto-fast" ||
    model === "auto-pro" ||
    model === "auto-cheap" ||
    model === "gpt-image-2"
  ) {
    partial.model = model;
  }
  if (
    workload === "single" ||
    workload === "small-batch" ||
    workload === "large-batch"
  ) {
    partial.workloadSize = workload;
  }
  return partial;
}

export function buildGeneratedTemplate(
  input: TemplateConfiguratorInput,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  t: TranslateFn = (key) => key
): GeneratedTemplate {
  const effectiveApi = resolveEffectiveConfiguratorApi(input);
  const model =
    input.api === "image"
      ? "gpt-image-2"
      : input.model || recommendConfiguratorModel(input);
  const chatPrompt = input.useCase?.trim() || chatPromptForIndustry(input.industry);
  const imagePrompt = input.useCase?.trim() || imagePromptForIndustry(input.industry);
  const itemCount = batchItemCount(
    effectiveApi === "batch" ? input.workloadSize : "single"
  );
  const batchItems = buildBatchItems(input.industry, itemCount);

  let endpoint = "POST /v1/chat/completions";
  let copyText = "";

  if (effectiveApi === "chat") {
    endpoint = "POST /v1/chat/completions";
    const body = chatBody(model, chatPrompt);
    if (input.language === "curl") {
      copyText = curlPostOneLine("/chat/completions", apiKey, body);
    } else if (input.language === "powershell") {
      copyText = powershellPostOneLine("/chat/completions", apiKey, body);
    } else if (input.language === "node") {
      copyText = buildNodeChatFile(apiKey, model, chatPrompt);
    } else {
      copyText = buildPythonChatFile(apiKey, model, chatPrompt);
    }
  } else if (effectiveApi === "responses") {
    endpoint = "POST /v1/responses";
    const body = responsesBody(model, GENERAL_RESPONSES_INPUT);
    if (input.language === "curl") {
      copyText = curlPostOneLine("/responses", apiKey, body);
    } else if (input.language === "powershell") {
      copyText = powershellPostOneLine("/responses", apiKey, body);
    } else if (input.language === "node") {
      copyText = buildNodeResponsesFile(apiKey, model, GENERAL_RESPONSES_INPUT);
    } else {
      copyText = buildPythonResponsesFile(apiKey, model, GENERAL_RESPONSES_INPUT);
    }
  } else if (effectiveApi === "image") {
    endpoint = "POST /v1/images/generations";
    const imageModel = "gpt-image-2";
    if (input.language === "curl") {
      copyText = buildImageApiCurlOneLine(apiKey, {
        model: imageModel,
        prompt: imagePrompt,
        response_format: "url",
      });
    } else if (input.language === "powershell") {
      const body = imageBody(imageModel, imagePrompt);
      copyText = powershellPostOneLine("/images/generations", apiKey, body);
    } else if (input.language === "node") {
      copyText = buildNodeImageFile(apiKey, imageModel, imagePrompt);
    } else {
      copyText = buildPythonImageFile(apiKey, imageModel, imagePrompt);
    }
  } else {
    endpoint = "POST /v1/batches/chat + GET poll + GET items";
    if (input.language === "curl" || input.language === "powershell") {
      copyText = buildConfiguratorBatchTripleCurl(apiKey, model, batchItems, input.language);
    } else if (input.language === "node") {
      copyText = buildNodeBatchFile(apiKey, model, batchItems);
    } else {
      copyText = buildPythonBatchFile(apiKey, model, batchItems);
    }
  }

  const meta = metaLists(t, effectiveApi);
  const boundaryKey = SAFETY_BOUNDARY_KEYS[input.industry];
  if (boundaryKey) {
    meta.safetyBoundary = [t(boundaryKey)];
  }

  const titleKey = `integration.templateConfigurator.generatedTitle.${effectiveApi}`;
  const title = t(titleKey);

  return {
    title,
    endpoint,
    model: effectiveApi === "image" ? "gpt-image-2" : model,
    copyText,
    expectedOutput: meta.expectedOutput,
    reconcileSteps: meta.reconcileSteps,
    retryAdvice: meta.retryAdvice,
    safetyBoundary: meta.safetyBoundary,
    relatedDocs: meta.relatedDocs,
  };
}
