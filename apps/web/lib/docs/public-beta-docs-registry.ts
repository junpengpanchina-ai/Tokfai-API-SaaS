/**
 * Public-beta consumer / developer docs registry.
 *
 * Single source of truth for /docs, /dashboard/docs, and /admin/docs.
 * Docs are config-published in this phase — not editable online.
 */

import {
  chatCurlMultiline,
  imageCurlMultiline,
  modelsCurlMultiline,
  responsesCurlOneLine,
} from "@/lib/customer-curl-oneline";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_API_ORIGIN,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

export type DocsAudience = "consumer" | "developer" | "admin";
export type DocsCategory =
  | "quickstart"
  | "chat"
  | "responses"
  | "image"
  | "cherry-studio"
  | "gemini"
  | "billing"
  | "troubleshooting";
export type DocsLanguage = "zh" | "en";

export type PublicBetaDoc = {
  slug: string;
  title: { zh: string; en: string };
  audience: DocsAudience;
  category: DocsCategory;
  language: DocsLanguage;
  /** Primary production API path(s) this doc covers. */
  apiPaths: string[];
  updatedAt: string;
  markdown: { zh: string; en: string };
};

const UPDATED_AT = "2026-07-12";

const QUICKSTART_CURL = modelsCurlMultiline();
const CHAT_CURL = chatCurlMultiline();
const IMAGE_CURL = imageCurlMultiline();
const RESPONSES_CURL = `curl -sS ${TOKFAI_API_BASE_URL}/responses \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${TOKFAI_RECOMMENDED_MODEL}","input":"Say ok only."}'`;

export const PUBLIC_BETA_DOCS: PublicBetaDoc[] = [
  {
    slug: "quickstart",
    title: { zh: "快速开始", en: "Quickstart" },
    audience: "consumer",
    category: "quickstart",
    language: "zh",
    apiPaths: ["GET /v1/models", "POST /v1/chat/completions"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 快速开始

官网：https://www.tokfai.com  
API Base URL：\`${TOKFAI_API_ORIGIN}\`（完整路径前缀 \`${TOKFAI_API_BASE_URL}\`）

1. 在官网注册并登录  
2. 充值算力积分（Compute credits）  
3. 在控制台创建 \`sk-tokfai_…\` API Key  
4. 用下方 curl 验证连通性

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

说明：
- 请使用独立的 Tokfai API Key，不要使用其他平台密钥  
- 成功请求按用量扣算力积分；失败请求通常不扣费，以 Usage / Credits 记录为准  
- Base URL 必须是 \`https://api.tokfai.com\`，不要误用其它服务的旧配置`,
      en: `# Quickstart

Website: https://www.tokfai.com  
API Base URL: \`${TOKFAI_API_ORIGIN}\` (paths under \`${TOKFAI_API_BASE_URL}\`)

1. Sign up and sign in  
2. Top up compute credits  
3. Create an \`sk-tokfai_…\` API key in the dashboard  
4. Verify connectivity with the curl below

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

Notes:
- Use your own Tokfai API key  
- Successful calls debit compute credits; failed calls are usually not charged — Usage / Credits are authoritative  
- Base URL must be \`https://api.tokfai.com\` — do not reuse another service’s old config`,
    },
  },
  {
    slug: "chat-completions",
    title: { zh: "Chat Completions", en: "Chat Completions" },
    audience: "developer",
    category: "chat",
    language: "zh",
    apiPaths: ["POST /v1/chat/completions"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# Chat Completions

路径：\`POST ${TOKFAI_API_BASE_URL}/chat/completions\`  
推荐起步模型：\`${TOKFAI_RECOMMENDED_MODEL}\`

\`\`\`bash
${CHAT_CURL}
\`\`\`

要点：
- OpenAI-compatible \`messages\` 格式  
- \`stream: true\` 可用于流式输出  
- 按 token / 请求用量扣算力积分  
- 价格与套餐请看定价页，不要在文档里混入上游成本`,
      en: `# Chat Completions

Path: \`POST ${TOKFAI_API_BASE_URL}/chat/completions\`  
Recommended starter model: \`${TOKFAI_RECOMMENDED_MODEL}\`

\`\`\`bash
${CHAT_CURL}
\`\`\`

Notes:
- OpenAI-compatible \`messages\` payload  
- Use \`stream: true\` for streaming  
- Charged in compute credits by usage  
- See Pricing for rates — docs do not list upstream costs`,
    },
  },
  {
    slug: "responses-api",
    title: { zh: "Responses API", en: "Responses API" },
    audience: "developer",
    category: "responses",
    language: "zh",
    apiPaths: ["POST /v1/responses"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# Responses API

路径：\`POST ${TOKFAI_API_BASE_URL}/responses\`

\`\`\`bash
${RESPONSES_CURL}
\`\`\`

也可用一行版：

\`\`\`bash
${responsesCurlOneLine()}
\`\`\`

适合需要 Responses 语义的客户端。计费仍按算力积分，以 Usage 为准。`,
      en: `# Responses API

Path: \`POST ${TOKFAI_API_BASE_URL}/responses\`

\`\`\`bash
${RESPONSES_CURL}
\`\`\`

One-line variant:

\`\`\`bash
${responsesCurlOneLine()}
\`\`\`

Use this when your client expects the Responses surface. Billing still uses compute credits; Usage is authoritative.`,
    },
  },
  {
    slug: "image-api",
    title: { zh: "Image API", en: "Image API" },
    audience: "developer",
    category: "image",
    language: "zh",
    apiPaths: ["POST /v1/images/generations"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# Image API

路径：\`POST ${TOKFAI_API_BASE_URL}/images/generations\`  
推荐起步模型：\`nano-banana-fast\`

\`\`\`bash
${IMAGE_CURL}
\`\`\`

要点：
- 文生图与参考图改图都走同一路径  
- 有参考图时请求体需要 \`images\` / \`image_urls\`  
- 图片按次扣算力积分  
- 失败请求通常不扣费，以 Usage / Credits 为准`,
      en: `# Image API

Path: \`POST ${TOKFAI_API_BASE_URL}/images/generations\`  
Recommended starter model: \`nano-banana-fast\`

\`\`\`bash
${IMAGE_CURL}
\`\`\`

Notes:
- Text-to-image and reference edit share this path  
- Reference edits must include \`images\` / \`image_urls\`  
- Image calls are charged per generation in compute credits  
- Failed calls are usually not charged — see Usage / Credits`,
    },
  },
  {
    slug: "cherry-studio",
    title: { zh: "Cherry Studio", en: "Cherry Studio" },
    audience: "consumer",
    category: "cherry-studio",
    language: "zh",
    apiPaths: ["POST /v1/chat/completions", "GET /v1/models"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# Cherry Studio 接入

在 Cherry Studio 中新增 **OpenAI Compatible / Custom OpenAI** 服务。

## 推荐配置

- 服务名称：Tokfai  
- Base URL：\`https://api.tokfai.com\`  
- API Key：\`sk-tokfai_xxx\`  
- 推荐用 OpenAI Provider 接入；Tokfai 会自动兼容 Chat Completions、Responses 和部分 Gemini 模型别名  
- 模型 ID 请从 Tokfai 模型列表选择，例如：\`gpt-5.4\`、\`gpt-5.5\`、\`auto-fast\`、\`gemini-3-flash\`

## 常见问题

- Base URL 是否为 \`https://api.tokfai.com\`  
- API Key 是否以 \`sk-tokfai_\` 开头  
- 模型 ID 是否来自 Tokfai 模型列表  
- 是否误用了其它服务商的旧配置

验证：在 Cherry 发送一条短消息，然后到 Tokfai Usage 确认出现记录。`,
      en: `# Cherry Studio

In Cherry Studio, add an **OpenAI Compatible / Custom OpenAI** service.

## Recommended setup

- Service name: Tokfai  
- Base URL: \`https://api.tokfai.com\`  
- API Key: \`sk-tokfai_xxx\`  
- Prefer the OpenAI Provider path; Tokfai automatically supports Chat Completions, Responses, and selected Gemini model aliases  
- Pick model ids from the Tokfai model list, e.g. \`gpt-5.4\`, \`gpt-5.5\`, \`auto-fast\`, \`gemini-3-flash\`

## Checklist

- Is Base URL \`https://api.tokfai.com\`?  
- Does the API Key start with \`sk-tokfai_\`?  
- Is the model id from the Tokfai model list?  
- Did you accidentally reuse another service’s old config?

Verify: send a short message in Cherry, then confirm a row appears in Tokfai Usage.`,
    },
  },
  {
    slug: "gemini-native",
    title: {
      zh: "Gemini 原生兼容",
      en: "Gemini native compatibility",
    },
    audience: "developer",
    category: "gemini",
    language: "zh",
    apiPaths: ["POST /v1beta/models/{model}:generateContent"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# Gemini 原生兼容

仅在客户端必须走 Gemini 原生协议时使用。  
Base URL 仍是 \`${TOKFAI_API_ORIGIN}\`，API Key 仍是 Tokfai \`sk-tokfai_…\`。

可用模型 ID：
- \`gemini-2.5-flash\`
- \`gemini-2.5-pro\`
- \`gemini-3-flash\`
- \`gemini-3-pro\`

大多数场景优先用 OpenAI-compatible \`/v1/chat/completions\`。`,
      en: `# Gemini native compatibility

Use only when your client requires Gemini-native protocol.  
Base URL remains \`${TOKFAI_API_ORIGIN}\`. API key remains your Tokfai \`sk-tokfai_…\` key.

Model ids:
- \`gemini-2.5-flash\`
- \`gemini-2.5-pro\`
- \`gemini-3-flash\`
- \`gemini-3-pro\`

Prefer OpenAI-compatible \`/v1/chat/completions\` for most integrations.`,
    },
  },
  {
    slug: "billing",
    title: { zh: "计费说明", en: "Billing" },
    audience: "consumer",
    category: "billing",
    language: "zh",
    apiPaths: [],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 计费说明

- 消费者看到的是 **算力积分（compute credits）**，不是上游成本  
- 充值套餐以人民币标价，到账为算力积分（可能含赠送）  
- Chat / Responses：按用量扣算力积分  
- Image：按次扣算力积分  
- 失败请求通常不扣费，以 Usage 与 Credits 账本为准  
- 详细套餐与单价请看定价页；模型能力请看模型页`,
      en: `# Billing

- Consumers see **compute credits**, not upstream costs  
- Recharge packs are priced in CNY and credit compute credits (bonus may apply)  
- Chat / Responses: charged by usage in compute credits  
- Image: charged per generation in compute credits  
- Failed requests are usually not charged — Usage and Credits are authoritative  
- See Pricing for packs and rates; see Models for capabilities`,
    },
  },
  {
    slug: "troubleshooting",
    title: { zh: "排障", en: "Troubleshooting" },
    audience: "consumer",
    category: "troubleshooting",
    language: "zh",
    apiPaths: ["GET /v1/health"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 排障

## 401 / 鉴权失败
- 确认使用 \`Authorization: Bearer sk-tokfai_…\`  
- 确认 Key 未被撤销

## model not found / model not register
- 模型 ID 拼写是否正确  
- Cherry 是否选中了 Tokfai Provider  
- Base URL 是否为 \`${TOKFAI_API_ORIGIN}\`

## 有调用但 Usage 无记录
- 可能请求打到了错误的 Base URL  
- 到 Credits / Usage 核对 request_id

健康检查：\`${TOKFAI_API_ORIGIN}/v1/health\``,
      en: `# Troubleshooting

## 401 / auth failure
- Confirm \`Authorization: Bearer sk-tokfai_…\`  
- Confirm the key is not revoked

## model not found / model not register
- Check model id spelling  
- In Cherry, confirm the Tokfai provider is selected  
- Confirm Base URL is \`${TOKFAI_API_ORIGIN}\`

## Calls succeed elsewhere but Tokfai Usage is empty
- The request may have targeted the wrong Base URL  
- Cross-check request_id in Credits / Usage

Health: \`${TOKFAI_API_ORIGIN}/v1/health\``,
    },
  },
];

export function getPublicBetaDoc(slug: string): PublicBetaDoc | undefined {
  return PUBLIC_BETA_DOCS.find((doc) => doc.slug === slug);
}

export function listPublicBetaDocs(
  audience?: DocsAudience
): PublicBetaDoc[] {
  if (!audience) return PUBLIC_BETA_DOCS;
  return PUBLIC_BETA_DOCS.filter(
    (doc) => doc.audience === audience || doc.audience === "developer"
  );
}
