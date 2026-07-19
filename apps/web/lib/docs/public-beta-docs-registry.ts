/**
 * Public-beta consumer / developer docs registry.
 *
 * Single source of truth for /docs, /dashboard/docs, and /admin/docs.
 * Docs are config-published in this phase — not editable online.
 *
 * Consumer docs show Tokfai public API only — never upstream brands, hosts, or paths.
 */

import {
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

const UPDATED_AT = "2026-07-16";

const QUICKSTART_CURL = modelsCurlMultiline();
const RESPONSES_CURL = `curl -sS ${TOKFAI_API_BASE_URL}/responses \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${TOKFAI_RECOMMENDED_MODEL}","input":"Say ok only."}'`;

const RESPONSES_GPT55_CURL = `curl https://api.tokfai.com/v1/responses \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "input": "Say OK in one short sentence."
  }'`;

const RESPONSES_EXAMPLE_JSON = `{
  "id": "resp_xxx",
  "object": "response",
  "status": "completed",
  "model": "gpt-5.5",
  "output_text": "OK."
}`;

const MATLAB_RESPONSES_WEBWRITE = `url = "https://api.tokfai.com/v1/responses";
apiKey = "sk-tokfai_xxx";
body = struct("model", "gpt-5.5", "input", "Say OK in one short sentence.");
options = weboptions( ...
    "HeaderFields", { ...
        "Authorization", "Bearer " + apiKey; ...
        "Content-Type", "application/json" ...
    }, ...
    "MediaType", "application/json" ...
);
response = webwrite(url, body, options);
disp(response);`;

const MATLAB_RESPONSES_REQUEST_MESSAGE = `apiKey = "sk-tokfai_xxx";
url = "https://api.tokfai.com/v1/responses";

headers = [
    matlab.net.http.field.AuthorizationField("Bearer " + apiKey)
    matlab.net.http.field.ContentTypeField("application/json")
];

body = struct;
body.model = "gpt-5.5";
body.input = "Say OK in one short sentence.";

request = matlab.net.http.RequestMessage( ...
    "POST", ...
    headers, ...
    matlab.net.http.MessageBody(jsonencode(body)) ...
);

response = request.send(url);
disp(response.Body.Data)`;

const IMAGE_REF_CURL = `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "保留主体，换成直播间带货主图风格",
    "image": ["https://example.com/your-reference-image.jpg"],
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
    apiPaths: [
      "GET /v1/models",
      "POST /v1/chat/completions",
      "POST /v1/responses",
      "POST /v1/images/generations",
    ],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 快速开始

官网：https://www.tokfai.com  
API Base URL：\`${TOKFAI_API_ORIGIN}\`（完整路径前缀 \`${TOKFAI_API_BASE_URL}\`）

注册并充值算力积分后，按下面三步接入 Tokfai API。

## 三步接入

### 步骤 1：创建 API Key

在控制台创建 \`sk-tokfai_xxx\` API Key。**API Key 不绑定模型**——Key 只负责鉴权，模型在每次请求的 body 里指定。

### 步骤 2：选择接口

| 场景 | 接口 |
|---|---|
| 普通聊天 | \`POST https://api.tokfai.com/v1/chat/completions\` |
| GPT-5.5 / 工具调用 / Codex 类场景 | \`POST https://api.tokfai.com/v1/responses\` |
| 图片生成 | \`POST https://api.tokfai.com/v1/images/generations\`（或 Dashboard 图片工作台） |

### 步骤 3：在请求中选择模型

API Key 不绑定模型。每次请求通过 \`model\` 参数选择模型。

\`\`\`json
{
  "model": "gpt-5.5",
  "input": "Say OK in one short sentence."
}
\`\`\`

> Chat Completions 使用 \`messages\` 字段。\`GET /v1/models\` 只返回通用文本/聊天模型；图片专用模型请使用 Tokfai 图片工作台或 OpenAI-compatible 图片接口。

## 验证连通性

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

说明：
- Base URL 必须是 \`https://api.tokfai.com\`
- 第三方客户端（Cherry Studio / Chatbox 等）必须选择 **Tokfai**（界面常显示为 \`| tokfai\`）供应商下的模型
- 成功请求按用量扣算力积分；失败通常不扣费，以 Usage / Credits 为准

## MATLAB 用户

MATLAB 可通过 HTTP JSON 接入 Tokfai。GPT-5.5 等复杂推理、工具调用场景推荐 \`/v1/responses\`——详见 [MATLAB 接入](/docs/matlab) 或 [Responses API](/docs/responses-api)。`,
      en: `# Quickstart

Website: https://www.tokfai.com  
API Base URL: \`${TOKFAI_API_ORIGIN}\` (paths under \`${TOKFAI_API_BASE_URL}\`)

After sign-up and topping up compute credits, integrate in three steps.

## Three-step integration

### Step 1: Create an API Key

Create an \`sk-tokfai_xxx\` API key in the dashboard. **The API key is not bound to a model** — it only authenticates; pick the model in each request body.

### Step 2: Choose an endpoint

| Use case | Endpoint |
|---|---|
| Chat | \`POST https://api.tokfai.com/v1/chat/completions\` |
| GPT-5.5 / tools / Codex-like agents | \`POST https://api.tokfai.com/v1/responses\` |
| Image generation | \`POST https://api.tokfai.com/v1/images/generations\` (or Dashboard Image Workbench) |

### Step 3: Select the model in the request

API keys are not bound to a model. Pass \`model\` on every request.

\`\`\`json
{
  "model": "gpt-5.5",
  "input": "Say OK in one short sentence."
}
\`\`\`

> Chat Completions uses \`messages\`. \`GET /v1/models\` returns general text/chat models only; use Tokfai Image Workbench or the OpenAI-compatible Image API for image-only models.

## Verify connectivity

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

Notes:
- Base URL must be \`https://api.tokfai.com\`
- In third-party clients (Cherry Studio / Chatbox, etc.), always pick models under the **Tokfai** provider (often shown as \`| tokfai\`)
- Successful calls debit compute credits; failures are usually not charged — Usage / Credits are authoritative

## MATLAB users

MATLAB can call Tokfai over HTTP JSON. For GPT-5.5 and complex reasoning / tool use, prefer \`/v1/responses\` — see [MATLAB integration](/docs/matlab) or [Responses API](/docs/responses-api).`,
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
    title: {
      zh: "文本对话 API / OpenAI Chat Completions 兼容",
      en: "Chat Completions / OpenAI-compatible",
    },
    audience: "developer",
    category: "chat",
    language: "zh",
    apiPaths: ["POST /v1/chat/completions"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 文本对话 API

路径：\`POST https://api.tokfai.com/v1/chat/completions\`

该接口兼容 OpenAI Chat Completions 形态，适合普通对话、多轮问答、客户端接入与大多数 OpenAI Compatible 工具。

## 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| \`model\` | string | 是 | 模型 ID。API Key 不绑定模型，模型由每次请求指定 |
| \`messages\` | array | 是 | OpenAI 风格消息数组 |
| \`stream\` | boolean | 否 | \`false\` 返回 JSON；\`true\` 返回 SSE 流 |
| \`temperature\` | number | 否 | 采样温度 |
| \`top_p\` | number | 否 | nucleus sampling |
| \`max_tokens\` | number | 否 | 最大输出 token |

## Shell 示例

\`\`\`bash
curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto-fast",
    "stream": false,
    "messages": [
      { "role": "user", "content": "Say OK only." }
    ]
  }'
\`\`\`

## 流式示例

\`\`\`bash
curl -N https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto-fast",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Say OK only." }
    ]
  }'
\`\`\`

## Python 示例

\`\`\`python
import requests

res = requests.post(
    "https://api.tokfai.com/v1/chat/completions",
    headers={
        "Authorization": "Bearer sk-tokfai_xxx",
        "Content-Type": "application/json"
    },
    json={
        "model": "auto-fast",
        "stream": False,
        "messages": [
            {"role": "user", "content": "你好"}
        ]
    }
)

print(res.json())
\`\`\`

## 成功响应示例

\`\`\`json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "created": 1777897048,
  "model": "auto-fast",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "OK."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 2,
    "completion_tokens": 6,
    "total_tokens": 8
  }
}
\`\`\`

说明：

- \`stream=true\` 时返回 SSE 流
- 成功请求按用量扣算力积分
- 失败通常不扣费，以 Usage / Credits 为准
- 需要 Responses 字段风格时，请使用 \`/v1/responses\``,
      en: `# Chat Completions

Path: \`POST https://api.tokfai.com/v1/chat/completions\`

OpenAI Chat Completions compatible — for chat, multi-turn Q&A, client apps, and most OpenAI-compatible tools.

## Request fields

| Field | Type | Required | Notes |
|---|---|---:|---|
| \`model\` | string | yes | Model id. API key is not bound to a model |
| \`messages\` | array | yes | OpenAI-style messages |
| \`stream\` | boolean | no | \`false\` → JSON; \`true\` → SSE |
| \`temperature\` | number | no | sampling temperature |
| \`top_p\` | number | no | nucleus sampling |
| \`max_tokens\` | number | no | max output tokens |

## Shell

\`\`\`bash
curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto-fast",
    "stream": false,
    "messages": [
      { "role": "user", "content": "Say OK only." }
    ]
  }'
\`\`\`

## Streaming

\`\`\`bash
curl -N https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto-fast",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Say OK only." }
    ]
  }'
\`\`\`

## Python

\`\`\`python
import requests

res = requests.post(
    "https://api.tokfai.com/v1/chat/completions",
    headers={
        "Authorization": "Bearer sk-tokfai_xxx",
        "Content-Type": "application/json"
    },
    json={
        "model": "auto-fast",
        "stream": False,
        "messages": [
            {"role": "user", "content": "你好"}
        ]
    }
)

print(res.json())
\`\`\`

## Success response

\`\`\`json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "created": 1777897048,
  "model": "auto-fast",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "OK."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 2,
    "completion_tokens": 6,
    "total_tokens": 8
  }
}
\`\`\`

Notes:

- \`stream=true\` returns SSE
- Successful calls debit compute credits
- Failures usually are not charged — Usage / Credits are authoritative
- For Responses-shaped clients, use \`/v1/responses\``,
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
Auth：\`Authorization: Bearer sk-tokfai_xxx\`

\`\`\`bash
${RESPONSES_CURL}
\`\`\`

单行示例：

\`\`\`bash
${responsesCurlOneLine()}
\`\`\`

## GPT-5.5 推荐接入方式

**GPT-5.5 及复杂场景优先使用 \`/v1/responses\`**，包括：

- 复杂推理与长上下文
- 工具调用（function / tool calling）
- Agent / Codex 类代码自动化与工作流

简单多轮聊天仍可用 \`POST /v1/chat/completions\`；需要 Responses 语义、工具链或 Agent 客户端时，请切到本接口。

API Key **不绑定模型**——在 body 里指定 \`model\` 即可。

### GPT-5.5 标准 curl

\`\`\`bash
${RESPONSES_GPT55_CURL}
\`\`\`

### 响应示例

\`\`\`json
${RESPONSES_EXAMPLE_JSON}
\`\`\`

## Codex / Agent 工具调用场景

Tokfai 提供 OpenAI 兼容 API 网关。Codex、Agent、IDE 插件等需要工具调用的客户端，**优先配置 \`POST /v1/responses\`**：

- Base URL：\`https://api.tokfai.com\`
- API Key：\`sk-tokfai_xxx\`
- 推荐模型：\`gpt-5.5\`、\`gpt-5-pro\`

按客户端要求传入 \`tools\`、\`tool_choice\` 等 Responses 字段；计费仍按算力积分，以 Usage 为准。

## MATLAB

MATLAB 可通过 HTTP JSON 调用 \`/v1/responses\`。任选 \`webwrite\` 或 \`RequestMessage\`：

### webwrite

\`\`\`matlab
${MATLAB_RESPONSES_WEBWRITE}
\`\`\`

### RequestMessage（R2016b+）

\`\`\`matlab
${MATLAB_RESPONSES_REQUEST_MESSAGE}
\`\`\`

更多说明见 [MATLAB 接入](/docs/matlab)。`,
      en: `# Responses API

Path: \`POST ${TOKFAI_API_BASE_URL}/responses\`  
Auth: \`Authorization: Bearer sk-tokfai_xxx\`

\`\`\`bash
${RESPONSES_CURL}
\`\`\`

One-line variant:

\`\`\`bash
${responsesCurlOneLine()}
\`\`\`

## Recommended path for GPT-5.5

**Prefer \`/v1/responses\` for GPT-5.5 and advanced workloads**, including:

- Complex reasoning and long context
- Tool calling (function / tool calling)
- Agent / Codex-style code automation and workflows

Simple multi-turn chat can still use \`POST /v1/chat/completions\`. Switch here when your client expects the Responses surface, tool chains, or Agent integrations.

**The API key is not bound to a model** — set \`model\` in the request body.

### Standard curl for GPT-5.5

\`\`\`bash
${RESPONSES_GPT55_CURL}
\`\`\`

### Response example

\`\`\`json
${RESPONSES_EXAMPLE_JSON}
\`\`\`

## Codex / Agent tool-calling

Tokfai exposes an OpenAI-compatible API gateway. For Codex, Agents, IDE plugins, and other tool-calling clients, **prefer \`POST /v1/responses\`**:

- Base URL: \`https://api.tokfai.com\`
- API Key: \`sk-tokfai_xxx\`
- Recommended models: \`gpt-5.5\`, \`gpt-5-pro\`

Pass \`tools\`, \`tool_choice\`, and other Responses fields as your client requires. Billing still uses compute credits; Usage is authoritative.

## MATLAB

MATLAB can call \`/v1/responses\` over HTTP JSON. Use either \`webwrite\` or \`RequestMessage\`:

### webwrite

\`\`\`matlab
${MATLAB_RESPONSES_WEBWRITE}
\`\`\`

### RequestMessage (R2016b+)

\`\`\`matlab
${MATLAB_RESPONSES_REQUEST_MESSAGE}
\`\`\`

See also [MATLAB integration](/docs/matlab).`,
    },
  },
  {
    slug: "matlab",
    title: { zh: "MATLAB 接入", en: "MATLAB integration" },
    audience: "developer",
    category: "quickstart",
    language: "zh",
    apiPaths: ["POST /v1/responses", "POST /v1/chat/completions"],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# MATLAB 接入

Tokfai API 可通过 HTTP JSON 从 MATLAB 调用。Base URL：\`https://api.tokfai.com\`；鉴权：\`Authorization: Bearer sk-tokfai_xxx\`。

**API Key 不绑定模型**——在请求 body 里指定 \`model\` 即可。

## 推荐：GPT-5.5 + Responses

复杂推理、长上下文、工具调用、Agent / Codex 场景优先使用 \`POST /v1/responses\`。完整说明见 [Responses API](/docs/responses-api)。

### webwrite

\`\`\`matlab
${MATLAB_RESPONSES_WEBWRITE}
\`\`\`

### RequestMessage（R2016b+）

\`\`\`matlab
${MATLAB_RESPONSES_REQUEST_MESSAGE}
\`\`\`

## 简单对话：Chat Completions

多轮聊天可用 \`POST /v1/chat/completions\`，body 使用 \`messages\` 字段。详见 [文本对话 API](/docs/chat-completions)。`,
      en: `# MATLAB integration

Call the Tokfai API from MATLAB over HTTP JSON. Base URL: \`https://api.tokfai.com\`; auth: \`Authorization: Bearer sk-tokfai_xxx\`.

**The API key is not bound to a model** — set \`model\` in each request body.

## Recommended: GPT-5.5 + Responses

For complex reasoning, long context, tool calling, and Agent / Codex workloads, prefer \`POST /v1/responses\`. Full details: [Responses API](/docs/responses-api).

### webwrite

\`\`\`matlab
${MATLAB_RESPONSES_WEBWRITE}
\`\`\`

### RequestMessage (R2016b+)

\`\`\`matlab
${MATLAB_RESPONSES_REQUEST_MESSAGE}
\`\`\`

## Simple chat: Chat Completions

For multi-turn chat, use \`POST /v1/chat/completions\` with a \`messages\` array. See [Chat Completions](/docs/chat-completions).`,
    },
  },
  {
    slug: "image-api",
    title: {
      zh: "图片生成 API / OpenAI Images Generations 兼容",
      en: "Image Generation / OpenAI Images compatible",
    },
    audience: "developer",
    category: "image",
    language: "zh",
    apiPaths: [
      "POST /v1/images/generations",
      "GET /v1/images/generations/{id}",
      "GET /v1/api/result",
    ],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# 图片生成 API

路径：\`POST https://api.tokfai.com/v1/images/generations\`

该接口兼容 OpenAI Images Generations 形态，用于文生图、参考图改图、电商主图生成等场景。

> 图片专用模型**不会**出现在普通聊天客户端的 \`GET /v1/models\` 列表中。请使用 **Tokfai 图片工作台**（Dashboard）或本文档的 OpenAI-compatible 图片接口；不要在 Cherry Studio / Chatbox 里把图片模型当对话模型使用。

## 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| \`model\` | string | 否 | 图片模型 ID。未传时使用默认图片模型 |
| \`prompt\` | string | 是 | 图片生成提示词 |
| \`image\` | array[string] | 否 | 参考图 URL 或 base64 data URL。与下列别名字段等价 |
| \`images\` | array[string] | 否 | \`image\` 的兼容别名 |
| \`image_urls\` | array[string] | 否 | \`image\` 的兼容别名 |
| \`reference_images\` | array[string] | 否 | \`image\` 的兼容别名 |
| \`input_images\` | array[string] | 否 | \`image\` 的兼容别名 |
| \`size\` | string | 否 | 如 \`1024x1024\` |
| \`aspect_ratio\` / \`aspectRatio\` | string | 否 | 如 \`1:1\`、\`16:9\`、\`9:16\` |
| \`response_format\` | string | 否 | 当前支持 \`url\` |
| \`n\` | number | 否 | 当前仅支持 \`1\` |

\`image\`、\`images\`、\`image_urls\`、\`reference_images\`、\`input_images\` 都会归一化为参考图列表。

## 文生图示例

\`\`\`bash
curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
    "image": [],
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

## 参考图改图示例

\`\`\`bash
curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "保留主体，把背景换成科技感直播间带货主图",
    "image": [
      "https://example.com/reference.jpg"
    ],
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

## Python 示例

\`\`\`python
import requests

res = requests.post(
    "https://api.tokfai.com/v1/images/generations",
    headers={
        "Authorization": "Bearer sk-tokfai_xxx",
        "Content-Type": "application/json"
    },
    json={
        "model": "gpt-image-2",
        "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
        "image": [],
        "size": "1024x1024",
        "response_format": "url"
    }
)

print(res.json())
\`\`\`

## 成功响应示例

\`\`\`json
{
  "created": 1777689832,
  "data": [
    {
      "url": "https://example-cdn.tokfai.com/file/xxx.png"
    }
  ],
  "usage": {
    "total_tokens": 6267,
    "input_tokens": 17,
    "output_tokens": 6250,
    "input_tokens_details": {}
  }
}
\`\`\`

实际响应还可能包含：

\`\`\`json
{
  "id": "img_xxx",
  "object": "image.generation",
  "model": "gpt-image-2",
  "status": "succeeded",
  "tokfai": {
    "request_id": "xxx",
    "credits_charged": 123.45
  }
}
\`\`\`

## 异步结果查询

如果接口返回 \`id\` 或 \`request_id\`，可查询任务状态：

\`\`\`bash
curl "https://api.tokfai.com/v1/api/result?id=REQUEST_ID" \\
  -H "Authorization: Bearer sk-tokfai_xxx"
\`\`\`

兼容返回：

\`\`\`json
{
  "id": "REQUEST_ID",
  "status": "succeeded",
  "results": [
    {
      "url": "https://example-cdn.tokfai.com/file/xxx.png"
    }
  ]
}
\`\`\`

说明：

- 文生图：\`image\` 传空数组或不传
- 参考图改图：\`image\` / \`images\` / \`image_urls\` / \`reference_images\` / \`input_images\` 任一字段非空
- 当前 \`response_format\` 仅支持 \`url\`
- 当前 \`n\` 仅支持 \`1\`
- 不支持 \`blob:\`、\`file:\`、\`localhost\`、内网地址
- 成功才扣算力积分；失败通常不扣费，以 Usage / Credits 为准`,
      en: `# Image Generation

Path: \`POST https://api.tokfai.com/v1/images/generations\`

OpenAI Images Generations compatible — text-to-image, reference edit, ecommerce creatives.

> Image-only models are **not** listed on \`GET /v1/models\` for ordinary chat clients. Use **Tokfai Image Workbench** (Dashboard) or this OpenAI-compatible Image API — do not treat image models as chat models in Cherry Studio / Chatbox.

## Request fields

| Field | Type | Required | Notes |
|---|---|---:|---|
| \`model\` | string | no | Image model id; default applies if omitted |
| \`prompt\` | string | yes | Generation prompt |
| \`image\` | array[string] | no | Reference URL or base64 data URL |
| \`images\` | array[string] | no | Alias of \`image\` |
| \`image_urls\` | array[string] | no | Alias of \`image\` |
| \`reference_images\` | array[string] | no | Alias of \`image\` |
| \`input_images\` | array[string] | no | Alias of \`image\` |
| \`size\` | string | no | e.g. \`1024x1024\` |
| \`aspect_ratio\` / \`aspectRatio\` | string | no | e.g. \`1:1\`, \`16:9\`, \`9:16\` |
| \`response_format\` | string | no | \`url\` supported today |
| \`n\` | number | no | \`1\` only today |

\`image\`, \`images\`, \`image_urls\`, \`reference_images\`, and \`input_images\` merge into one reference list.

## Text-to-image

\`\`\`bash
curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
    "image": [],
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

## Reference edit

\`\`\`bash
curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "保留主体，把背景换成科技感直播间带货主图",
    "image": [
      "https://example.com/reference.jpg"
    ],
    "size": "1024x1024",
    "response_format": "url"
  }'
\`\`\`

## Python

\`\`\`python
import requests

res = requests.post(
    "https://api.tokfai.com/v1/images/generations",
    headers={
        "Authorization": "Bearer sk-tokfai_xxx",
        "Content-Type": "application/json"
    },
    json={
        "model": "gpt-image-2",
        "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
        "image": [],
        "size": "1024x1024",
        "response_format": "url"
    }
)

print(res.json())
\`\`\`

## Success response

\`\`\`json
{
  "created": 1777689832,
  "data": [
    {
      "url": "https://example-cdn.tokfai.com/file/xxx.png"
    }
  ],
  "usage": {
    "total_tokens": 6267,
    "input_tokens": 17,
    "output_tokens": 6250,
    "input_tokens_details": {}
  }
}
\`\`\`

May also include:

\`\`\`json
{
  "id": "img_xxx",
  "object": "image.generation",
  "model": "gpt-image-2",
  "status": "succeeded",
  "tokfai": {
    "request_id": "xxx",
    "credits_charged": 123.45
  }
}
\`\`\`

## Async result lookup

If the response includes \`id\` or \`request_id\`:

\`\`\`bash
curl "https://api.tokfai.com/v1/api/result?id=REQUEST_ID" \\
  -H "Authorization: Bearer sk-tokfai_xxx"
\`\`\`

Compatible shape:

\`\`\`json
{
  "id": "REQUEST_ID",
  "status": "succeeded",
  "results": [
    {
      "url": "https://example-cdn.tokfai.com/file/xxx.png"
    }
  ]
}
\`\`\`

Notes:

- Text-to-image: omit \`image\` or pass \`[]\`
- Reference edit: any of \`image\` / \`images\` / \`image_urls\` / \`reference_images\` / \`input_images\` non-empty
- \`response_format\` supports \`url\` only today
- \`n\` supports \`1\` only today
- \`blob:\`, \`file:\`, \`localhost\`, private networks are not supported
- Credits charged on success; failures usually are not billed — Usage / Credits are authoritative`,
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

在请求体中传入参考图。\`image\`、\`images\`、\`image_urls\`、\`reference_images\`、\`input_images\` 都会归一化为参考图列表。支持：

- 公网 \`https://…\` / \`http://…\` 图片 URL  
- \`data:image/…;base64,…\`  

**不支持** \`blob:\`、\`file:\`、\`localhost\` 与私有网段。

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

Pass reference images via \`image\`, \`images\`, \`image_urls\`, \`reference_images\`, or \`input_images\` (all normalized to one list). Supported:

- public \`https://…\` / \`http://…\` image URLs  
- \`data:image/…;base64,…\`  

**Not supported:** \`blob:\`, \`file:\`, \`localhost\`, private networks.

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

**只配置 Tokfai 自定义供应商，不要使用 Cherry Studio 内置 OpenAI / Gemini / Google 供应商。**

对外只配置：

- 供应商类型：**OpenAI Compatible** / 自定义 OpenAI 兼容
- 供应商名称：\`Tokfai\`
- API 地址：\`https://api.tokfai.com/v1\`
- API Key：Tokfai 控制台生成的 \`sk-tokfai_…\`
- 模型：**必须从 Tokfai 供应商下选择**（展示名如 \`Tokfai GPT-5.4 Pro\` / \`Tokfai GPT-5.5\` / \`Tokfai Gemini 3 Pro\`）

**不是选择 GPT-5 / Gemini 就代表正在使用 Tokfai。**  
**不要选择 OpenAI / Gemini 内置供应商**里的同名模型。必须确认模型所属服务商是 Tokfai，且请求路径是 \`https://api.tokfai.com/v1\`。

Chatbox 与其它 OpenAI-compatible 客户端使用相同规则。完整矩阵见 [OpenAI Compatible 客户端](/docs/openai-compatible-clients)。

## 推荐配置

| 项 | 值 |
|---|---|
| 供应商名称 | Tokfai |
| 供应商类型 | OpenAI Compatible / 自定义 OpenAI 兼容 |
| Base URL / API Host | \`https://api.tokfai.com/v1\` |
| API Key | Tokfai 控制台生成的 \`sk-tokfai_…\` |
| 推荐模型 id | \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\` |
| 界面展示名 | \`Tokfai GPT-5\`、\`Tokfai GPT-5.4 Pro\`、\`Tokfai GPT-5.5\`、\`Tokfai Gemini 3 Pro\` |
| 顶部必须显示 | \`| Tokfai\` / \`| tokfai\` |

说明：\`gpt-5.4\` 兼容映射到 \`gpt-5\`；\`gpt-5.4-pro\` / \`GPT 5.4 Pro\` 兼容映射到 \`gpt-5-pro\`（\`tokfai.requested_model\` 保留原值，\`tokfai.resolved_model\` 为内部 id）。

## 正确 vs 错误

- **正确**：\`Tokfai GPT-5.4 Pro | Tokfai\`、\`Tokfai GPT-5.5 | Tokfai\`、\`Tokfai Gemini 3 Pro | Tokfai\` → 请求走 \`https://api.tokfai.com/v1\`
- **错误**：\`GPT 5.4 Pro | OpenAI\` → **不是 Tokfai**（内置 OpenAI）
- **错误**：\`Gemini 3.1 Pro Preview | Gemini\` → **不是 Tokfai**（内置 Gemini）
- **错误**：\`Gemini xxx | Google\` → **不是 Tokfai**（内置 Google）
- **错误**：请求路径不是 \`api.tokfai.com\` → **没有走 Tokfai**

## 强制隔离测试（必做）

1. 先只启用 **Tokfai** 服务商（OpenAI Compatible 自定义）  
2. 关闭其它非 Tokfai 服务商（含内置 OpenAI / Gemini / Google）  
3. 在 Tokfai 服务商下点击 **获取模型列表**  
4. **新建话题**（避免旧话题绑着错误供应商）  
5. 确认顶部模型显示 \`| Tokfai\` / \`| tokfai\`（例如 \`Tokfai GPT-5.4 Pro | Tokfai\`）  
6. 测试 Prompt：\`只回答 TOKFAI_READY，不要解释。\`  
7. 到 Tokfai Usage 确认出现记录

## 错误排查

- 错误详情请求路径是 \`https://api.tokfai.com/v1\` → 已走 Tokfai；检查模型名  
- **如果请求路径不是 api.tokfai.com，说明没有走 Tokfai**——这不是 Tokfai API 错误，而是 Cherry Studio 供应商选错  
- 若错误详情出现 \`grsaiapi.com\`、\`openai.com\`、\`googleapis.com\`、\`generativelanguage.googleapis.com\` 等主机 → 选错了内置供应商，请求未经过 Tokfai  
- 如果出现 grsaiapi.com，说明没有走 Tokfai — 请切回 \`| Tokfai\` / \`| tokfai\`，Base URL 填 \`https://api.tokfai.com/v1\`  
- \`model_not_available\` → 换 \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\`（仍须在 Tokfai 供应商下）  
- \`insufficient_credits\` → Dashboard → Credits 充值  
- \`rate_limited\` → 降低并发后重试  
- \`upstream_busy\` → 稍后重试或换模型  
- 401 / \`invalid_token\` → 从控制台重新复制 \`sk-tokfai_…\`  

只使用 \`https://api.tokfai.com/v1\` 作为接入地址。不要把其它厂商主机填成 Base URL。`,
      en: `# Cherry Studio

**Configure only a custom Tokfai provider. Do not use Cherry Studio built-in OpenAI / Gemini / Google providers.**

Only configure:

- Provider type: **OpenAI Compatible** / custom OpenAI-compatible
- Service name: \`Tokfai\`
- API base: \`https://api.tokfai.com/v1\`
- API Key: generated in the Tokfai console (\`sk-tokfai_…\`)
- Model: **must be selected under the Tokfai provider** (e.g. \`Tokfai GPT-5.4 Pro\` / \`Tokfai GPT-5.5\` / \`Tokfai Gemini 3 Pro\`)

**Picking a GPT-5 / Gemini label does not mean you are using Tokfai.**  
**Do not pick models from built-in OpenAI / Gemini providers.** Confirm the provider is Tokfai and the request path is \`https://api.tokfai.com/v1\`.

Chatbox and other OpenAI-compatible clients follow the same rules. See the [OpenAI-compatible client matrix](/docs/openai-compatible-clients).

## Recommended setup

| Field | Value |
|---|---|
| Service name | Tokfai |
| Type | OpenAI Compatible / custom OpenAI-compatible |
| Base URL / API Host | \`https://api.tokfai.com/v1\` |
| API Key | From Tokfai console (\`sk-tokfai_…\`) |
| Recommended model ids | \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\` |
| UI display names | \`Tokfai GPT-5\`, \`Tokfai GPT-5.4 Pro\`, \`Tokfai GPT-5.5\`, \`Tokfai Gemini 3 Pro\` |
| Header must show | \`| Tokfai\` / \`| tokfai\` |

Note: \`gpt-5.4\` maps to \`gpt-5\`; \`gpt-5.4-pro\` / \`GPT 5.4 Pro\` map to \`gpt-5-pro\` (\`tokfai.requested_model\` keeps the original; \`tokfai.resolved_model\` is the internal id).

## Correct vs incorrect

- **Correct**: \`Tokfai GPT-5.4 Pro | Tokfai\`, \`Tokfai GPT-5.5 | Tokfai\`, \`Tokfai Gemini 3 Pro | Tokfai\` → \`https://api.tokfai.com/v1\`
- **Wrong**: \`GPT 5.4 Pro | OpenAI\` → **not Tokfai** (built-in OpenAI)
- **Wrong**: \`Gemini 3.1 Pro Preview | Gemini\` → **not Tokfai** (built-in Gemini)
- **Wrong**: \`Gemini xxx | Google\` → **not Tokfai** (built-in Google)
- **Wrong**: request path is not \`api.tokfai.com\` → **not Tokfai**

## Forced isolation test (required)

1. Enable **only** the Tokfai provider (custom OpenAI Compatible)  
2. Disable every non-Tokfai provider (including built-in OpenAI / Gemini / Google)  
3. Click **Fetch models** under Tokfai  
4. **Create a new topic** (old topics may keep a wrong provider)  
5. Confirm the header shows \`| Tokfai\` / \`| tokfai\` (e.g. \`Tokfai GPT-5.4 Pro | Tokfai\`)  
6. Test prompt: \`Reply with TOKFAI_READY only. No explanation.\`  
7. Confirm a row appears in Tokfai Usage

## Troubleshooting

- Error path is \`https://api.tokfai.com/v1\` → you hit Tokfai; check the model id  
- **If the request path is not api.tokfai.com, the request did not go through Tokfai** — this is a wrong Cherry Studio provider selection, not a Tokfai API failure  
- If error details show \`grsaiapi.com\`, \`openai.com\`, \`googleapis.com\`, or \`generativelanguage.googleapis.com\` → built-in provider selected; traffic never hit Tokfai  
- If error details show grsaiapi.com, the request did not go through Tokfai — switch back to \`| Tokfai\` / \`| tokfai\` and set Base URL to \`https://api.tokfai.com/v1\`  
- \`model_not_available\` → use \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\` (still under Tokfai)  
- \`insufficient_credits\` → top up in Dashboard → Credits  
- \`rate_limited\` → reduce concurrency and retry  
- \`upstream_busy\` → retry shortly or switch model  
- 401 / \`invalid_token\` → re-copy \`sk-tokfai_…\` from the console  

Use only \`https://api.tokfai.com/v1\` as the integration Base URL. Do not paste other vendor hosts as Base URL.`,
    },
  },
  {
    slug: "openai-compatible-clients",
    title: {
      zh: "OpenAI Compatible 客户端矩阵",
      en: "OpenAI-compatible client matrix",
    },
    audience: "consumer",
    category: "quickstart",
    language: "zh",
    apiPaths: [
      "GET /v1/models",
      "POST /v1/chat/completions",
      "POST /v1/responses",
    ],
    updatedAt: UPDATED_AT,
    markdown: {
      zh: `# OpenAI Compatible 客户端矩阵

Tokfai 是 **OpenAI-compatible API 中转聚合网关**。  
仓库完整步骤见 \`docs/tokfai-third-party-clients.zh.md\`。

| 项 | 值 |
|---|---|
| Base URL | \`https://api.tokfai.com/v1\` |
| API Key | Tokfai 控制台 \`sk-tokfai_…\` |
| 供应商 | **Tokfai**（\`| tokfai\`） |
| 推荐模型 id | \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\` |
| 界面展示 | \`Tokfai GPT-5\`、\`Tokfai GPT-5.4\`、\`Tokfai GPT-5 Pro\`、\`Tokfai GPT-5.4 Pro\`、\`Tokfai GPT-5.5\`、\`Tokfai Gemini 3 Pro\`、\`Tokfai Gemini 2.5 Flash\` |

只填写 \`https://api.tokfai.com/v1\`，不要填写其它厂商主机。

## 模型说明

| id | 展示名 | 备注 |
|---|---|---|
| \`gpt-5\` | Tokfai GPT-5 | 通用 |
| \`gpt-5.4\` | Tokfai GPT-5.4 | 兼容别名 → \`gpt-5\` |
| \`gpt-5-pro\` | Tokfai GPT-5 Pro | 高质量 |
| \`gpt-5.4-pro\` | Tokfai GPT-5.4 Pro | 兼容别名 → \`gpt-5-pro\` |
| \`gpt-5.5\` | Tokfai GPT-5.5 | 高推理 |
| \`gemini-3-pro\` | Tokfai Gemini 3 Pro | Gemini |
| \`gemini-2.5-flash\` | Tokfai Gemini 2.5 Flash | 低延迟 |

## Cherry Studio

1. 添加 **OpenAI Compatible**（自定义），名称 \`Tokfai\` — **不要选择 OpenAI / Gemini 内置供应商**  
2. Base URL = \`https://api.tokfai.com/v1\`，Key = \`sk-tokfai_…\`  
3. 从 Tokfai 下选模型（正确：\`Tokfai GPT-5.4 Pro | Tokfai\`；错误：\`GPT 5.4 Pro | OpenAI\` / \`Gemini 3.1 Pro Preview | Gemini\`）  
4. 新建话题测试；**如果请求路径不是 api.tokfai.com，说明没有走 Tokfai**  

详见 [Cherry Studio](/docs/cherry-studio)。

## Chatbox

设置 → OpenAI Compatible：Base URL \`https://api.tokfai.com/v1\`，模型填上表 id（如 \`gpt-5.5\` / \`gemini-3-pro\`）。

## NextChat

自定义 OpenAI：Base URL \`https://api.tokfai.com/v1\`，API Key \`sk-tokfai_…\`，模型 \`gpt-5\` 或 \`gemini-2.5-flash\`。

## OpenWebUI

Admin → Connections → OpenAI：API Base URL \`https://api.tokfai.com/v1\`，同步模型后选用 Tokfai 展示名 / id（含 \`gpt-5.4\`）。

## Dify

模型供应商选 **OpenAI-API-compatible**，API Endpoint \`https://api.tokfai.com/v1\`，模型名填 \`gpt-5.5\` / \`gemini-3-pro\` 等。

## FastGPT

添加 OpenAI 兼容渠道：Base URL \`https://api.tokfai.com/v1\`，模型 \`gpt-5-pro\` / \`gemini-2.5-flash\` 等。

## Continue

\`apiBase: https://api.tokfai.com/v1\`，\`model: gpt-5.5\`（或其它上表 id），\`apiKey: sk-tokfai_…\`。

## Cline

OpenAI Compatible：Base URL \`https://api.tokfai.com/v1\`，Model ID \`gpt-5.5\` / \`gpt-5-pro\`。

## Roo Code

OpenAI Compatible：Base URL \`https://api.tokfai.com/v1\`，Model \`gpt-5.4-pro\` / \`gpt-5-pro\` / \`gpt-5.5\`。

## Codex / LangChain / LlamaIndex

- Codex 只是其中一个 case：Base URL 仍为 \`https://api.tokfai.com/v1\`，复杂工具链可优先 \`POST /v1/responses\`。
- LangChain OpenAI-compatible：\`ChatOpenAI(base_url="https://api.tokfai.com/v1", api_key="sk-tokfai_…")\`。
- LlamaIndex OpenAI-compatible：同样使用 \`https://api.tokfai.com/v1\` 与 Tokfai 模型 id。

## 客户端错误口径

只提示 Tokfai 口径：

| 提示 | 含义 |
|---|---|
| \`model_not_available\` | 模型不可用 |
| \`insufficient_credits\` | 算力积分不足 |
| \`rate_limited\` | 请求过快 |
| \`upstream_busy\` | 模型繁忙 |

错误文案不得出现上游域名或上游原始错误。`,
      en: `# OpenAI-compatible client matrix

Tokfai is a **universal OpenAI-compatible API gateway**.  
Full steps: \`docs/tokfai-third-party-clients.zh.md\`.

| Field | Value |
|---|---|
| Base URL | \`https://api.tokfai.com/v1\` |
| API Key | Tokfai console \`sk-tokfai_…\` |
| Provider | **Tokfai** (\`| tokfai\`) |
| Model ids | \`gpt-5\` / \`gpt-5.4\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\` / \`gemini-3-pro\` / \`gemini-2.5-flash\` |
| Display names | \`Tokfai GPT-5\`, \`Tokfai GPT-5.4\`, \`Tokfai GPT-5 Pro\`, \`Tokfai GPT-5.4 Pro\`, \`Tokfai GPT-5.5\`, \`Tokfai Gemini 3 Pro\`, \`Tokfai Gemini 2.5 Flash\` |

Use only \`https://api.tokfai.com/v1\` — never other vendor hosts.

## Models

| id | Display | Notes |
|---|---|---|
| \`gpt-5\` | Tokfai GPT-5 | General |
| \`gpt-5.4\` | Tokfai GPT-5.4 | Alias → \`gpt-5\` |
| \`gpt-5-pro\` | Tokfai GPT-5 Pro | Quality |
| \`gpt-5.4-pro\` | Tokfai GPT-5.4 Pro | Alias → \`gpt-5-pro\` |
| \`gpt-5.5\` | Tokfai GPT-5.5 | Reasoning |
| \`gemini-3-pro\` | Tokfai Gemini 3 Pro | Gemini |
| \`gemini-2.5-flash\` | Tokfai Gemini 2.5 Flash | Low latency |

## Cherry Studio

Add custom **OpenAI Compatible** named Tokfai; Base URL \`https://api.tokfai.com/v1\`; pick models under Tokfai only — do not use built-in OpenAI / Gemini providers. If the request path is not api.tokfai.com, the request did not go through Tokfai. See [Cherry Studio](/docs/cherry-studio).

## Chatbox

OpenAI Compatible; Base URL \`https://api.tokfai.com/v1\`; model ids from the table (e.g. \`gpt-5.5\` / \`gemini-3-pro\`).

## NextChat

Custom OpenAI; Base URL \`https://api.tokfai.com/v1\`; models \`gpt-5\` or \`gemini-2.5-flash\`.

## OpenWebUI

OpenAI connection; API Base URL \`https://api.tokfai.com/v1\`; pick Tokfai display names / ids (including \`gpt-5.4\`).

## Dify

**OpenAI-API-compatible**; endpoint \`https://api.tokfai.com/v1\`; model \`gpt-5.5\` / \`gemini-3-pro\`.

## FastGPT

OpenAI-compatible channel; Base URL \`https://api.tokfai.com/v1\`; model \`gpt-5-pro\` / \`gemini-2.5-flash\`.

## Continue

\`apiBase: https://api.tokfai.com/v1\`, \`model: gpt-5.5\`, \`apiKey: sk-tokfai_…\`.

## Cline

OpenAI Compatible; Base URL \`https://api.tokfai.com/v1\`; Model ID \`gpt-5.5\` / \`gpt-5-pro\`.

## Roo Code

OpenAI Compatible; Base URL \`https://api.tokfai.com/v1\`; Model \`gpt-5.4-pro\` / \`gpt-5-pro\` / \`gpt-5.5\`.

## Codex / LangChain / LlamaIndex

- Codex is one case among many: Base URL remains \`https://api.tokfai.com/v1\`; prefer \`POST /v1/responses\` for tool-heavy flows.
- LangChain OpenAI-compatible: \`ChatOpenAI(base_url="https://api.tokfai.com/v1", api_key="sk-tokfai_…")\`.
- LlamaIndex OpenAI-compatible: same \`https://api.tokfai.com/v1\` and Tokfai model ids.

## Client error vocabulary

Tokfai-only prompts:

| Code | Meaning |
|---|---|
| \`model_not_available\` | Model unavailable |
| \`insufficient_credits\` | Out of credits |
| \`rate_limited\` | Rate limited |
| \`upstream_busy\` | Model busy |

Never expose upstream hosts or raw upstream errors.`,
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

**第三方客户端（Cherry Studio / Chatbox 等）请优先用 OpenAI Compatible，并选择 \`| tokfai\` 供应商。**  
不要在客户端里另建 Gemini / OpenAI 原生供应商指向其它域名。

仅当自研客户端强制要求 Gemini 协议时，才走 Tokfai 网关上的：

- \`GET https://api.tokfai.com/v1beta/models\`
- \`POST https://api.tokfai.com/v1beta/models/{model}:generateContent\`

Base URL 必须是 \`${TOKFAI_API_ORIGIN}\`，API Key 仍是 Tokfai \`sk-tokfai_…\`。

可用聊天模型 ID：\`gemini-2.5-flash\`、\`gemini-2.5-pro\`、\`gemini-3-flash\`、\`gemini-3-pro\`。  
图片专用模型不走此接口——请使用 Tokfai 图片工作台或 \`POST /v1/images/generations\`。`,
      en: `# Gemini native compatibility

**For third-party clients (Cherry Studio / Chatbox, etc.), prefer OpenAI Compatible and select the \`| tokfai\` provider.**  
Do not add a separate Gemini / OpenAI native provider pointed at another host.

Only use Tokfai’s Gemini-protocol paths when your own client requires them:

- \`GET https://api.tokfai.com/v1beta/models\`
- \`POST https://api.tokfai.com/v1beta/models/{model}:generateContent\`

Base URL must remain \`${TOKFAI_API_ORIGIN}\`. API key remains your Tokfai \`sk-tokfai_…\` key.

Chat model ids: \`gemini-2.5-flash\`, \`gemini-2.5-pro\`, \`gemini-3-flash\`, \`gemini-3-pro\`.  
Image-only models are not served here — use Tokfai Image Workbench or \`POST /v1/images/generations\`.`,
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

| code | 客户端词汇 | 说明 |
|---|---|---|
| \`model_not_available\` | \`model_not_available\` | 模型不可用，请刷新模型列表 |
| \`insufficient_credits\` | \`insufficient_balance\` | 算力积分不足，请充值后再试 |
| \`too_many_requests\` / \`upstream_rate_limited\` | \`rate_limited\` | 请求过于频繁 |
| \`upstream_model_busy\` | \`upstream_busy\` | 模型繁忙，请稍后重试 |
| \`invalid_request_error\` | \`invalid_request\` | 请求参数不合法 |
| \`reference_image_required\` | — | 请先上传参考图片，或改用文生图模式 |
| \`image_generation_timeout\` | — | 图片生成时间较长，请稍后重试或更换模型 |
| \`invalid_image_url\` | — | 图片地址不合法（含 blob / localhost 等） |
| \`unauthorized\` / \`invalid_token\` | — | 鉴权失败 |

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

| code | Client term | Meaning |
|---|---|---|
| \`model_not_available\` | \`model_not_available\` | Model unavailable — refresh model list |
| \`insufficient_credits\` | \`insufficient_balance\` | Top up compute credits and retry |
| \`too_many_requests\` / \`upstream_rate_limited\` | \`rate_limited\` | Too many requests |
| \`upstream_model_busy\` | \`upstream_busy\` | Model busy — retry or switch |
| \`invalid_request_error\` | \`invalid_request\` | Invalid request |
| \`reference_image_required\` | — | Upload a reference image, or use text-to-image |
| \`image_generation_timeout\` | — | Generation took too long — retry or switch model |
| \`invalid_image_url\` | — | Invalid image URL (including blob / localhost) |
| \`unauthorized\` / \`invalid_token\` | — | Auth failure |

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

## API Key 会绑定模型吗？
**不会。** API Key 只用于鉴权；每次请求在 body 里指定 \`model\` 即可切换模型。

## GPT-5.5 应该用哪个接口？
推荐 \`POST /v1/responses\`（复杂推理、长上下文、工具调用、Agent / Codex）。简单聊天仍可用 \`/v1/chat/completions\`。

## MATLAB 能接入吗？
可以。MATLAB 通过 HTTP JSON 调用 Tokfai API；GPT-5.5 等场景推荐 \`/v1/responses\`。详见 [MATLAB 接入](/docs/matlab)。

## 图片接口路径是什么？
\`POST /v1/images/generations\`（不是其它历史路径）。也可使用 Dashboard **图片工作台**。

## 为什么聊天客户端看不到图片模型？
\`GET /v1/models\` 默认只返回通用文本/聊天模型。图片功能请使用 Tokfai 图片工作台或 OpenAI-compatible 图片接口。

## Cherry Studio 必须选哪个供应商？
必须添加自定义 **OpenAI Compatible** 供应商，名称填 \`Tokfai\`，API 地址填 \`https://api.tokfai.com/v1\`，并从 **Tokfai** 下选模型。  
**不要选择 OpenAI / Gemini 内置供应商。** 若选内置 OpenAI / Gemini / Google，请求不会经过 Tokfai。  
**如果请求路径不是 api.tokfai.com，说明没有走 Tokfai。**

## 文生图和改图是不是两个接口？
不是。同一公开接口；\`image\` / \`images\` / \`image_urls\` 等参考图字段是否为空区分模式。

## 失败会扣费吗？
通常不扣；以 Usage / Credits 为准。用 \`request_id\` 对账。

## 健康检查
\`${TOKFAI_API_ORIGIN}/v1/health\``,
      en: `# FAQ

## What Base URL should I use?
\`https://api.tokfai.com\`

## Is the API key bound to a model?
**No.** The key only authenticates; set \`model\` in each request body to switch models.

## Which endpoint should I use for GPT-5.5?
Prefer \`POST /v1/responses\` (complex reasoning, long context, tool calling, Agent / Codex). Simple chat can still use \`/v1/chat/completions\`.

## Can I integrate from MATLAB?
Yes. MATLAB calls Tokfai over HTTP JSON; for GPT-5.5 and similar workloads, prefer \`/v1/responses\`. See [MATLAB integration](/docs/matlab).

## What is the image endpoint?
\`POST /v1/images/generations\` (not other legacy paths). You can also use the Dashboard **Image Workbench**.

## Why don’t chat clients list image models?
\`GET /v1/models\` returns general text/chat models only. Use Tokfai Image Workbench or the OpenAI-compatible Image API for images.

## Which provider must Cherry Studio use?
Add a custom **OpenAI Compatible** entry called \`Tokfai\`, Base URL \`https://api.tokfai.com/v1\`, and pick models under **Tokfai** only.  
**Do not use built-in OpenAI / Gemini providers.** Selecting built-in OpenAI / Gemini / Google bypasses Tokfai.  
**If the request path is not api.tokfai.com, the request did not go through Tokfai.**

## Are text-to-image and edit separate APIs?
No. One public endpoint; presence of \`image\` / \`images\` / \`image_urls\` (etc.) selects the mode.

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
- 模型 ID 拼写是否正确（\`gpt-5.4-pro\` / \`GPT 5.4 Pro\` 等会在 Tokfai 内兼容映射到 \`gpt-5-pro\`）  
- Cherry / Chatbox 是否选中了 **Tokfai / \`| tokfai\`**（正确：\`Tokfai GPT-5.4 Pro | Tokfai\`；错误：\`GPT 5.4 Pro | OpenAI\`、\`Gemini 3.1 Pro Preview | Gemini\`）  
- **不要选择 OpenAI / Gemini 内置供应商**  
- Base URL 是否为 \`https://api.tokfai.com/v1\`  
- **如果请求路径不是 api.tokfai.com，说明没有走 Tokfai**（这不是 Tokfai API 错误，而是客户端供应商选错）  
- 如果出现 grsaiapi.com，说明没有走 Tokfai  
- 请求路径是 grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com → 选错供应商（不是 Tokfai 能拦截的问题）  
- 请求路径是 \`api.tokfai.com\` → 已走 Tokfai；换 \`gpt-5\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\`  

## 图片模型在聊天客户端报错
- 图片功能请使用 Tokfai 图片工作台或 OpenAI-compatible 图片接口  
- \`GET /v1/models\` 默认不返回图片专用模型给普通聊天客户端

## 有调用但 Usage 无条目
- 可能请求打到了错误的 Base URL 或错误的供应商  
- 到 Credits / Usage 核对 request_id

健康检查：\`${TOKFAI_API_ORIGIN}/v1/health\``,
      en: `# Troubleshooting

## 401 / auth failure
- Confirm \`Authorization: Bearer sk-tokfai_…\`  
- Confirm the key is not revoked

## model not found / model not register
- Check model id spelling (\`gpt-5.4-pro\` / \`GPT 5.4 Pro\` map to \`gpt-5-pro\` inside Tokfai)  
- In Cherry / Chatbox, confirm **Tokfai / \`| tokfai\`** (correct: \`Tokfai GPT-5.4 Pro | Tokfai\`; wrong: \`GPT 5.4 Pro | OpenAI\`, \`Gemini 3.1 Pro Preview | Gemini\`)  
- Do not use built-in OpenAI / Gemini providers  
- Confirm Base URL is \`https://api.tokfai.com/v1\`  
- **If the request path is not api.tokfai.com, the request did not go through Tokfai** (wrong client provider, not a Tokfai API failure)  
- If error details show grsaiapi.com, the request did not go through Tokfai  
- Request path is grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com → wrong provider (Tokfai cannot intercept that traffic)  
- Request path is \`api.tokfai.com\` → you hit Tokfai; try \`gpt-5\` / \`gpt-5-pro\` / \`gpt-5.4-pro\` / \`gpt-5.5\`  

## Image model errors in chat clients
- Use Tokfai Image Workbench or the OpenAI-compatible Image API  
- \`GET /v1/models\` does not expose image-only models to ordinary chat clients

## Calls succeed elsewhere but Tokfai Usage is empty
- The request may have targeted the wrong Base URL or provider  
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
