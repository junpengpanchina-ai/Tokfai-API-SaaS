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

const UPDATED_AT = "2026-07-14";

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
      "POST /v1beta/models/{model}:generateContent",
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
| 图片生成 | \`POST https://api.tokfai.com/v1/images/generations\` |
| Gemini 原生格式 | \`POST https://api.tokfai.com/v1beta/models/{model}:generateContent\` |

### 步骤 3：在请求中选择模型

API Key 不绑定模型。每次请求通过 \`model\` 参数选择模型。

\`\`\`json
{
  "model": "gpt-5.5",
  "input": "Say OK in one short sentence."
}
\`\`\`

> Chat Completions 使用 \`messages\` 字段；Gemini 原生走 \`/v1beta/models/{model}:generateContent\`。详见各接口文档。

## 验证连通性

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

说明：
- Base URL 必须是 \`https://api.tokfai.com\`
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
| Image generation | \`POST https://api.tokfai.com/v1/images/generations\` |
| Gemini native | \`POST https://api.tokfai.com/v1beta/models/{model}:generateContent\` |

### Step 3: Select the model in the request

API keys are not bound to a model. Pass \`model\` on every request.

\`\`\`json
{
  "model": "gpt-5.5",
  "input": "Say OK in one short sentence."
}
\`\`\`

> Chat Completions uses \`messages\`; Gemini native uses \`/v1beta/models/{model}:generateContent\`. See each API doc for details.

## Verify connectivity

\`\`\`bash
${QUICKSTART_CURL}
\`\`\`

Notes:
- Base URL must be \`https://api.tokfai.com\`
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
- 推荐模型：\`gpt-5.5\`、\`gpt-5.5-pro\`、\`gpt-5-pro\`

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
- Recommended models: \`gpt-5.5\`, \`gpt-5.5-pro\`, \`gpt-5-pro\`

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

## API Key 会绑定模型吗？
**不会。** API Key 只用于鉴权；每次请求在 body 里指定 \`model\` 即可切换模型。

## GPT-5.5 应该用哪个接口？
推荐 \`POST /v1/responses\`（复杂推理、长上下文、工具调用、Agent / Codex）。简单聊天仍可用 \`/v1/chat/completions\`。

## MATLAB 能接入吗？
可以。MATLAB 通过 HTTP JSON 调用 Tokfai API；GPT-5.5 等场景推荐 \`/v1/responses\`。详见 [MATLAB 接入](/docs/matlab)。

## 图片接口路径是什么？
\`POST /v1/images/generations\`（不是其它历史路径）

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
\`POST /v1/images/generations\` (not other legacy paths)

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
