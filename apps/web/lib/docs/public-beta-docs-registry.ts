/**
 * Public-beta consumer / developer docs registry.
 *
 * Single source of truth for /docs, /dashboard/docs, and /admin/docs.
 * Docs are config-published in this phase — not editable online.
 *
 * Consumer docs show Tokfai public API only — never upstream brands, hosts, or paths.
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
  | "auth"
  | "chat"
  | "responses"
  | "image"
  | "cherry-studio"
  | "gemini"
  | "billing"
  | "troubleshooting"
  | "errors"
  | "faq";
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

const UPDATED_AT = "2026-07-13";

const QUICKSTART_CURL = modelsCurlMultiline();
const CHAT_CURL = chatCurlMultiline();
const IMAGE_CURL = imageCurlMultiline();
const RESPONSES_CURL = `curl -sS ${TOKFAI_API_BASE_URL}/responses \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${TOKFAI_RECOMMENDED_MODEL}","input":"Say ok only."}'`;

const IMAGE_JS = `fetch("https://api.tokfai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${TOKFAI_API_KEY_PLACEHOLDER}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-image-2",
    prompt: "生成一张边牧与古牧正在直播间带货的电商主图",
    size: "1024x1024",
    response_format: "url"
  })
})`;

const IMAGE_PY = `import requests

res = requests.post(
    "https://api.tokfai.com/v1/images/generations",
    headers={
        "Authorization": "Bearer ${TOKFAI_API_KEY_PLACEHOLDER}",
        "Content-Type": "application/json"
    },
    json={
        "model": "gpt-image-2",
        "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
        "size": "1024x1024",
        "response_format": "url"
    }
)
print(res.json())`;

const IMAGE_REF_CURL = `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "保留主体，换成直播间带货主图风格",
    "images": ["https://example.com/your-reference-image.jpg"],
    "size": "1024x1024",
    "response_format": "url"
  }'`;

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
- 请使用独立的 Tokfai API Key  
- 成功请求按用量扣算力积分；失败请求通常不扣费，以 Usage / Credits 记录为准  
- Base URL 必须是 \`https://api.tokfai.com\``,
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
- Base URL must be \`https://api.tokfai.com\``,
    },
  },
  {
    slug: "authentication",
    title: { zh: "认证方式", en: "Authentication" },
    audience: "developer",
    category: "auth",
    language: "zh",
    apiPaths: [],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 认证方式

所有公开 API 使用：

\`\`\`http
Authorization: Bearer sk-tokfai_xxx
\`\`\`

- Base URL：\`https://api.tokfai.com\`  
- API Key 在控制台创建，前缀必须是 \`sk-tokfai_\`  
- Dashboard 登录会话 **不能** 代替 API Key 调用 \`/v1/chat/completions\`、\`/v1/images/generations\` 等公开接口  
- 不要把 Key 写进前端公开仓库；服务端持有即可`,
      en: `# Authentication

All public APIs use:

\`\`\`http
Authorization: Bearer sk-tokfai_xxx
\`\`\`

- Base URL: \`https://api.tokfai.com\`  
- Create keys in the dashboard; they must start with \`sk-tokfai_\`  
- Dashboard session tokens are **not** accepted on public endpoints like \`/v1/chat/completions\` or \`/v1/images/generations\`  
- Keep keys on your server — not in public frontend repos`,
    },
  },
  {
    slug: "chat-completions",
    title: { zh: "文本对话 API", en: "Chat Completions" },
    audience: "developer",
    category: "chat",
    language: "zh",
    apiPaths: ["POST /v1/chat/completions"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 文本对话 API

路径：\`POST ${TOKFAI_API_BASE_URL}/chat/completions\`  
推荐起步模型：\`${TOKFAI_RECOMMENDED_MODEL}\`

\`\`\`bash
${CHAT_CURL}
\`\`\`

OpenAI 兼容；按用量扣算力积分。模型能力与单价见模型页 / 定价页，不要在此处混入价格表。`,
      en: `# Chat Completions

Path: \`POST ${TOKFAI_API_BASE_URL}/chat/completions\`  
Recommended starter model: \`${TOKFAI_RECOMMENDED_MODEL}\`

\`\`\`bash
${CHAT_CURL}
\`\`\`

OpenAI-compatible. Charged in compute credits by usage. See Models / Pricing for capabilities and rates — keep prices off this page.`,
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

单行示例：

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
    title: { zh: "图片生成 API", en: "Image Generation API" },
    audience: "developer",
    category: "image",
    language: "zh",
    apiPaths: [
      "POST /v1/images/generations",
      "GET /v1/images/generations/{id}",
    ],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 图片生成 API

Base URL：\`https://api.tokfai.com\`  
Endpoint：\`POST /v1/images/generations\`  
Auth：\`Authorization: Bearer sk-tokfai_xxx\`

## 三种用法（同一公开接口）

| 场景 | 怎么区分 |
|---|---|
| 文生图 | \`images\` 为空或不传 |
| 参考图改图 | \`images\` / \`image_urls\` 非空 |
| 电商图生成 | 文生图或带商品参考图；用电商场景 prompt（控制台 Image Playground 也有电商模板） |

兼容字段：\`model\`、\`prompt\`、\`images\`、\`size\`、\`aspect_ratio\`、\`aspectRatio\`、\`response_format\`

## Shell

\`\`\`bash
${IMAGE_CURL}
\`\`\`

## JavaScript

\`\`\`javascript
${IMAGE_JS}
\`\`\`

## Python

\`\`\`python
${IMAGE_PY}
\`\`\`

## 成功响应（Tokfai 格式）

返回字段包括：\`id\`、\`object\`、\`created\`、\`model\`、\`status\`、\`data\`、\`usage\`、\`tokfai\`。  
成功才扣费；失败通常不扣费（以 Usage / Credits 为准）。

## 异步查询（beta）

\`GET /v1/images/generations/{id}\` 可按 \`request_id\` 查询状态。公测阶段为 beta：图片 URL 以 POST 成功响应为准，查询接口主要返回状态与计费字段。`,
      en: `# Image Generation API

Base URL: \`https://api.tokfai.com\`  
Endpoint: \`POST /v1/images/generations\`  
Auth: \`Authorization: Bearer sk-tokfai_xxx\`

## Three modes (one public endpoint)

| Mode | How to tell |
|---|---|
| Text-to-image | omit \`images\` or pass \`[]\` |
| Reference edit | non-empty \`images\` / \`image_urls\` |
| Ecommerce image | text-to-image or product reference + ecommerce prompt (also in Image Playground) |

Compatible fields: \`model\`, \`prompt\`, \`images\`, \`size\`, \`aspect_ratio\`, \`aspectRatio\`, \`response_format\`

## Shell

\`\`\`bash
${IMAGE_CURL}
\`\`\`

## JavaScript

\`\`\`javascript
${IMAGE_JS}
\`\`\`

## Python

\`\`\`python
${IMAGE_PY}
\`\`\`

## Success response (Tokfai shape)

Fields include: \`id\`, \`object\`, \`created\`, \`model\`, \`status\`, \`data\`, \`usage\`, \`tokfai\`.  
Credits are charged only on success; failures usually are not billed (see Usage / Credits).

## Async lookup (beta)

\`GET /v1/images/generations/{id}\` looks up status by \`request_id\`. Beta during public preview: use the POST success body for the image URL; GET mainly returns status and billing fields.`,
    },
  },
  {
    slug: "image-reference-edit",
    title: { zh: "参考图改图", en: "Reference image edit" },
    audience: "developer",
    category: "image",
    language: "zh",
    apiPaths: ["POST /v1/images/generations"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 参考图改图

同一路径：\`POST https://api.tokfai.com/v1/images/generations\`

在请求体中传入参考图（\`images\` 或 \`image_urls\`）。支持：

- 公网 \`https://…\` 图片 URL  
- \`data:image/…;base64,…\`  
- 已上传到 Tokfai 存储后的 URL  

**不支持** \`blob:\`、\`file:\`、\`localhost\`。

\`\`\`bash
${IMAGE_REF_CURL}
\`\`\`

若改图意图明确但未上传参考图，会返回：

\`\`\`json
{
  "error": {
    "message": "请先上传参考图片，或改用文生图模式。",
    "code": "reference_image_required",
    "type": "validation_error",
    "request_id": "…"
  }
}
\`\`\``,
      en: `# Reference image edit

Same path: \`POST https://api.tokfai.com/v1/images/generations\`

Pass reference images via \`images\` or \`image_urls\`. Supported:

- public \`https://…\` image URLs  
- \`data:image/…;base64,…\`  
- Tokfai storage URLs after upload  

**Not supported:** \`blob:\`, \`file:\`, \`localhost\`.

\`\`\`bash
${IMAGE_REF_CURL}
\`\`\`

If edit intent is clear but no reference image is provided:

\`\`\`json
{
  "error": {
    "message": "请先上传参考图片，或改用文生图模式。",
    "code": "reference_image_required",
    "type": "validation_error",
    "request_id": "…"
  }
}
\`\`\``,
    },
  },
  {
    slug: "cherry-studio",
    title: { zh: "Cherry Studio 接入", en: "Cherry Studio" },
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
- 是否误用了其它服务的旧配置

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
    slug: "models-and-pricing",
    title: { zh: "模型与价格", en: "Models & pricing" },
    audience: "consumer",
    category: "billing",
    language: "zh",
    apiPaths: [],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 模型与价格

文档页只讲怎么调用。模型能力与价格请分开查看：

- **模型页**：模型 ID、适合场景、输入/输出类型、推荐人群  
- **定价页**：算力积分单价、充值套餐  

不要在文档示例里混入价格表。`,
      en: `# Models & pricing

This docs site covers how to call the API. Capabilities and rates live elsewhere:

- **Models**: model id, use cases, input/output types, who it’s for  
- **Pricing**: compute-credit rates and recharge packs  

Do not mix price tables into API examples.`,
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

- 消费者看到的是 **算力积分（compute credits）**  
- 充值套餐以人民币标价，到账为算力积分（可能含赠送）  
- Chat / Responses：按用量扣算力积分  
- Image：按次扣算力积分  
- 失败请求通常不扣费，以 Usage 与 Credits 账本为准  
- 详细套餐与单价请看定价页；模型能力请看模型页`,
      en: `# Billing

- Consumers see **compute credits**  
- Recharge packs are priced in CNY and credit compute credits (bonus may apply)  
- Chat / Responses: charged by usage in compute credits  
- Image: charged per generation in compute credits  
- Failed requests are usually not charged — Usage and Credits are authoritative  
- See Pricing for packs and rates; see Models for capabilities`,
    },
  },
  {
    slug: "error-codes",
    title: { zh: "错误码", en: "Error codes" },
    audience: "developer",
    category: "errors",
    language: "zh",
    apiPaths: [],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 错误码

公开错误只返回友好 \`message\` + 稳定 \`code\` + \`request_id\`。技术细节进内部日志。

| code | 说明 |
|---|---|
| \`insufficient_credits\` | 算力积分不足，请充值后再试 |
| \`reference_image_required\` | 请先上传参考图片，或改用文生图模式 |
| \`image_generation_timeout\` | 图片生成时间较长，请稍后重试或更换模型 |
| \`invalid_image_url\` | 图片地址不合法（含 blob / localhost 等） |
| \`unauthorized\` / \`invalid_token\` | 鉴权失败 |

示例：

\`\`\`json
{
  "error": {
    "message": "算力积分不足，请充值后再试。",
    "code": "insufficient_credits",
    "type": "billing_error",
    "request_id": "…"
  }
}
\`\`\``,
      en: `# Error codes

Public errors return a friendly \`message\`, stable \`code\`, and \`request_id\`. Technical detail stays in internal logs.

| code | Meaning |
|---|---|
| \`insufficient_credits\` | Top up compute credits and retry |
| \`reference_image_required\` | Upload a reference image, or use text-to-image |
| \`image_generation_timeout\` | Generation took too long — retry or switch model |
| \`invalid_image_url\` | Invalid image URL (including blob / localhost) |
| \`unauthorized\` / \`invalid_token\` | Auth failure |

Example:

\`\`\`json
{
  "error": {
    "message": "算力积分不足，请充值后再试。",
    "code": "insufficient_credits",
    "type": "billing_error",
    "request_id": "…"
  }
}
\`\`\``,
    },
  },
  {
    slug: "faq",
    title: { zh: "常见问题", en: "FAQ" },
    audience: "consumer",
    category: "faq",
    language: "zh",
    apiPaths: ["GET /v1/health"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 常见问题

## Base URL 填什么？
\`https://api.tokfai.com\`

## 图片接口路径是什么？
\`POST /v1/images/generations\`（不是其它历史路径）

## 文生图和改图是不是两个接口？
不是。同一公开接口；有无 \`images\` 区分模式。

## 失败会扣费吗？
通常不扣；以 Usage / Credits 为准。用 \`request_id\` 对账。

## 健康检查
\`${TOKFAI_API_ORIGIN}/v1/health\``,
      en: `# FAQ

## What Base URL should I use?
\`https://api.tokfai.com\`

## What is the image endpoint?
\`POST /v1/images/generations\` (not other legacy paths)

## Are text-to-image and edit separate APIs?
No. One public endpoint; presence of \`images\` selects the mode.

## Are failures billed?
Usually not — Usage / Credits are authoritative. Reconcile with \`request_id\`.

## Health check
\`${TOKFAI_API_ORIGIN}/v1/health\``,
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

## 有调用但 Usage 无条目
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
