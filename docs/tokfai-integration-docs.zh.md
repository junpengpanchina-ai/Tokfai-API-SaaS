# Tokfai 接入文档

> 来源：`apps/web/lib/docs/public-beta-docs-registry.ts`（公测消费者文档）  
> 更新于：2026-07-13

快速开始、认证、文本对话、Responses、图片生成、参考图改图、Cherry Studio、模型与价格入口、错误码与常见问题。模型能力看模型页，价格看定价页。

| 项 | 值 |
|---|---|
| Base URL | `https://api.tokfai.com` |
| API Key | `sk-tokfai_xxx` |
| 官网 | https://www.tokfai.com |
| 计费单位 | 算力积分（compute credits） |

快捷入口：创建 API Key · 查看模型 · 查看定价 · 算力积分账本

## 目录

1. [快速开始](#quickstart)
2. [认证方式](#authentication)
3. [文本对话 API](#chat-completions)
4. [Responses API](#responses-api)
5. [MATLAB 接入](#matlab)
6. [图片生成 API](#image-api)
7. [参考图改图](#image-reference-edit)
8. [Cherry Studio 接入](#cherry-studio)
9. [模型与价格](#models-and-pricing)
10. [Gemini 原生兼容](#gemini-native)
11. [计费说明](#billing)
12. [错误码](#error-codes)
13. [常见问题](#faq)
14. [排障](#troubleshooting)


---

<a id="quickstart"></a>

> 更新于 2026-07-13 · GET /v1/models · POST /v1/chat/completions · POST /v1/responses · POST /v1/images/generations · POST /v1beta/models/{model}:generateContent

# 快速开始

官网：https://www.tokfai.com  
API Base URL：`https://api.tokfai.com`（完整路径前缀 `https://api.tokfai.com/v1`）

注册并充值算力积分后，按下面三步接入 Tokfai API。

## 三步接入

### 步骤 1：创建 API Key

在控制台创建 `sk-tokfai_xxx` API Key。**API Key 不绑定模型**——Key 只负责鉴权，模型在每次请求的 body 里指定。

### 步骤 2：选择接口

| 场景 | 接口 |
|---|---|
| 普通聊天 | `POST https://api.tokfai.com/v1/chat/completions` |
| GPT-5.5 / 工具调用 / Codex 类场景 | `POST https://api.tokfai.com/v1/responses` |
| 图片生成 | `POST https://api.tokfai.com/v1/images/generations`（或 Dashboard 图片工作台） |

### 步骤 3：在请求中选择模型

API Key 不绑定模型。每次请求通过 `model` 参数选择模型。

```json
{
  "model": "gpt-5.5",
  "input": "Say OK in one short sentence."
}
```

> Chat Completions 使用 `messages` 字段。`GET /v1/models` 只返回通用文本/聊天模型；图片专用模型请使用 Tokfai 图片工作台或 OpenAI-compatible 图片接口。

## 验证连通性

```bash
curl https://api.tokfai.com/v1/models \
  -H "Authorization: Bearer sk-tokfai_xxx"
```

说明：
- Base URL 必须是 `https://api.tokfai.com`
- 第三方客户端（Cherry Studio / Chatbox 等）必须选择 **Tokfai**（界面常显示为 `| tokfai`）供应商下的模型
- 成功请求按用量扣算力积分；失败通常不扣费，以 Usage / Credits 为准

## MATLAB 用户

MATLAB 可通过 HTTP JSON 接入 Tokfai。GPT-5.5 等复杂推理、工具调用场景推荐 `/v1/responses`——详见 [MATLAB 接入](/docs/matlab) 或 [Responses API](/docs/responses-api)。

---

<a id="authentication"></a>

> 更新于 2026-07-13

# 认证方式

所有公开 API 使用：

```http
Authorization: Bearer sk-tokfai_xxx
```

- Base URL：`https://api.tokfai.com`  
- API Key 在控制台创建，前缀必须是 `sk-tokfai_`  
- Dashboard 登录会话 **不能** 代替 API Key 调用 `/v1/chat/completions`、`/v1/images/generations` 等公开接口  
- 不要把 Key 写进前端公开仓库；服务端持有即可

---

<a id="chat-completions"></a>

> 更新于 2026-07-13 · POST /v1/chat/completions

# 文本对话 API

路径：`POST https://api.tokfai.com/v1/chat/completions`  
推荐起步模型：`auto-fast`

```bash
curl https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto-fast",
    "messages": [
      { "role": "user", "content": "Say ok only." }
    ],
    "stream": false
  }'
```

OpenAI 兼容；按用量扣算力积分。模型能力与单价见模型页 / 定价页，不要在此处混入价格表。

---

<a id="responses-api"></a>

> 更新于 2026-07-13 · POST /v1/responses

# Responses API

路径：`POST https://api.tokfai.com/v1/responses`  
Auth：`Authorization: Bearer sk-tokfai_xxx`

```bash
curl -sS https://api.tokfai.com/v1/responses \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-fast","input":"Say ok only."}'
```

单行示例：

```bash
curl -sS https://api.tokfai.com/v1/responses -H "Authorization: Bearer sk-tokfai_xxx" -H "Content-Type: application/json" -d '{"model":"auto-fast","input":"Say ok only."}'
```

## GPT-5.5 推荐接入方式

**GPT-5.5 及复杂场景优先使用 `/v1/responses`**，包括：

- 复杂推理与长上下文
- 工具调用（function / tool calling）
- Agent / Codex 类代码自动化与工作流

简单多轮聊天仍可用 `POST /v1/chat/completions`；需要 Responses 语义、工具链或 Agent 客户端时，请切到本接口。

API Key **不绑定模型**——在 body 里指定 `model` 即可。

### GPT-5.5 标准 curl

```bash
curl https://api.tokfai.com/v1/responses \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "input": "Say OK in one short sentence."
  }'
```

### 响应示例

```json
{
  "id": "resp_xxx",
  "object": "response",
  "status": "completed",
  "model": "gpt-5.5",
  "output_text": "OK."
}
```

## Codex / Agent 工具调用场景

Tokfai 提供 OpenAI 兼容 API 网关。Codex、Agent、IDE 插件等需要工具调用的客户端，**优先配置 `POST /v1/responses`**：

- Base URL：`https://api.tokfai.com`
- API Key：`sk-tokfai_xxx`
- 推荐模型：`gpt-5.5`、`gpt-5.5-pro`、`gpt-5-pro`

按客户端要求传入 `tools`、`tool_choice` 等 Responses 字段；计费仍按算力积分，以 Usage 为准。

## MATLAB

MATLAB 可通过 HTTP JSON 调用 `/v1/responses`。任选 `webwrite` 或 `RequestMessage`：

### webwrite

```matlab
url = "https://api.tokfai.com/v1/responses";
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
disp(response);
```

### RequestMessage（R2016b+）

```matlab
apiKey = "sk-tokfai_xxx";
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
disp(response.Body.Data)
```

更多说明见 [MATLAB 接入](/docs/matlab)。

---

<a id="matlab"></a>

> 更新于 2026-07-13 · POST /v1/responses · POST /v1/chat/completions

# MATLAB 接入

Tokfai API 可通过 HTTP JSON 从 MATLAB 调用。Base URL：`https://api.tokfai.com`；鉴权：`Authorization: Bearer sk-tokfai_xxx`。

**API Key 不绑定模型**——在请求 body 里指定 `model` 即可。

## 推荐：GPT-5.5 + Responses

复杂推理、长上下文、工具调用、Agent / Codex 场景优先使用 `POST /v1/responses`。完整说明见 [Responses API](/docs/responses-api)。

### webwrite

```matlab
url = "https://api.tokfai.com/v1/responses";
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
disp(response);
```

### RequestMessage（R2016b+）

```matlab
apiKey = "sk-tokfai_xxx";
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
disp(response.Body.Data)
```

## 简单对话：Chat Completions

多轮聊天可用 `POST /v1/chat/completions`，body 使用 `messages` 字段。详见 [文本对话 API](/docs/chat-completions)。

---

<a id="image-api"></a>

> 更新于 2026-07-13 · POST /v1/images/generations · GET /v1/images/generations/{id}

# 图片生成 API

Base URL：`https://api.tokfai.com`  
Endpoint：`POST /v1/images/generations`  
Auth：`Authorization: Bearer sk-tokfai_xxx`

> 图片专用模型**不会**出现在普通聊天客户端的 `GET /v1/models` 列表中。请使用 **Tokfai 图片工作台** 或本文档的 OpenAI-compatible 图片接口。

## 三种用法（同一公开接口）

| 场景 | 怎么区分 |
|---|---|
| 文生图 | `images` 为空或不传 |
| 参考图改图 | `images` / `image_urls` 非空 |
| 电商图生成 | 文生图或带商品参考图；用电商场景 prompt（控制台 Image Playground 也有电商模板） |

兼容字段：`model`、`prompt`、`images`、`size`、`aspect_ratio`、`aspectRatio`、`response_format`

## Shell

```bash
curl https://api.tokfai.com/v1/images/generations \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "gpt-image-2",
  "prompt": "生成一张边牧与古牧正在直播间带货的电商主图",
  "size": "1024x1024",
  "n": 1,
  "response_format": "url"
}'
```

## JavaScript

```javascript
fetch("https://api.tokfai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk-tokfai_xxx",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-image-2",
    prompt: "生成一张边牧与古牧正在直播间带货的电商主图",
    size: "1024x1024",
    response_format: "url"
  })
})
```

## Python

```python
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
        "size": "1024x1024",
        "response_format": "url"
    }
)
print(res.json())
```

## 成功响应（Tokfai 格式）

返回字段包括：`id`、`object`、`created`、`model`、`status`、`data`、`usage`、`tokfai`。  
成功才扣费；失败通常不扣费（以 Usage / Credits 为准）。

## 异步查询（beta）

`GET /v1/images/generations/{id}` 可按 `request_id` 查询状态。公测阶段为 beta：图片 URL 以 POST 成功响应为准，查询接口主要返回状态与计费字段。

---

<a id="image-reference-edit"></a>

> 更新于 2026-07-13 · POST /v1/images/generations

# 参考图改图

同一路径：`POST https://api.tokfai.com/v1/images/generations`

在请求体中传入参考图（`images` 或 `image_urls`）。支持：

- 公网 `https://…` 图片 URL  
- `data:image/…;base64,…`  
- 已上传到 Tokfai 存储后的 URL  

**不支持** `blob:`、`file:`、`localhost`。

```bash
curl https://api.tokfai.com/v1/images/generations \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "保留主体，换成直播间带货主图风格",
    "images": ["https://example.com/your-reference-image.jpg"],
    "size": "1024x1024",
    "response_format": "url"
  }'
```

若改图意图明确但未上传参考图，会返回：

```json
{
  "error": {
    "message": "请先上传参考图片，或改用文生图模式。",
    "code": "reference_image_required",
    "type": "validation_error",
    "request_id": "…"
  }
}
```

---

<a id="cherry-studio"></a>

> 更新于 2026-07-16 · POST /v1/chat/completions · GET /v1/models

# Cherry Studio 接入

在 Cherry Studio 中新增 **OpenAI Compatible / Custom OpenAI** 服务，并始终选择 **Tokfai**（界面常显示为 `| tokfai`）供应商下的模型。

Chatbox 与其它 OpenAI-compatible 客户端使用相同配置。

## 推荐配置

| 项 | 值 |
|---|---|
| 服务名称 | Tokfai |
| 类型 | OpenAI Compatible / Custom OpenAI |
| Base URL / API Host | `https://api.tokfai.com` |
| API Key | `sk-tokfai_xxx`（Dashboard → API Keys） |
| 推荐模型 | `auto-fast`（首次联调）；也可用 `auto-pro`、`gpt-5.5`、`gemini-3-flash` |
| 测试 Prompt | `Say ok only.` |

## 模型选择（重要）

- **必须**在模型选择器中选中 **Tokfai / `| tokfai`** 下的模型  
- **不要**选择界面上的 Gemini、OpenAI 或其它第三方供应商条目——那些请求不会经过 Tokfai  
- `GET /v1/models` 只返回通用文本/聊天模型；图片生成请使用 **Tokfai 图片工作台** 或 `POST /v1/images/generations`

## 接入步骤

1. 登录 Tokfai Dashboard，创建 API Key 并立即复制完整 `sk-tokfai_…`  
2. Cherry Studio → 设置 → Provider → 新增 OpenAI Compatible  
3. 填写上方表格中的 Base URL 与 API Key  
4. 拉取 / 选择 Tokfai 模型列表中的 `auto-fast`  
5. 发送测试 Prompt：`Say ok only.`  
6. 到 Tokfai Usage 确认出现记录

## 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| 401 / `invalid_token` | Key 错误、不完整或已吊销 | 从 API Keys 重新复制完整 `sk-tokfai_…` |
| 402 / `insufficient_credits` | 算力积分不足 | Dashboard → Credits 充值 |
| 404 / `model_not_found` | 模型 ID 不在 Tokfai 列表 | 改用 `auto-fast` |
| Bad Request / `model not register` | 选错了供应商或图片专用模型 | 切回 `| tokfai`；图片改用图片工作台 |
| 错误详情请求路径主机不是 `api.tokfai.com` | 请求未走 Tokfai（误选 Gemini / OpenAI / 其它供应商） | 改回 Tokfai 供应商，Base URL 保持 `https://api.tokfai.com` |
| Usage 无记录 | 请求打到了其它 Base URL | 核对 Provider 与 Base URL |

验证：Cherry 短消息成功后，Usage 应出现对应条目。

---

<a id="models-and-pricing"></a>

> 更新于 2026-07-13

# 模型与价格

文档页只讲怎么调用。模型能力与价格请分开查看：

- **模型页**：模型 ID、适合场景、输入/输出类型、推荐人群  
- **定价页**：算力积分单价、充值套餐  

不要在文档示例里混入价格表。

---

<a id="gemini-native"></a>

> 更新于 2026-07-13 · POST /v1beta/models/{model}:generateContent

# Gemini 原生兼容

**第三方客户端（Cherry Studio / Chatbox 等）请优先用 OpenAI Compatible，并选择 `| tokfai` 供应商。**  
不要在客户端里另建 Gemini / OpenAI 原生供应商指向其它域名。

仅当自研客户端强制要求 Gemini 协议时，才走 Tokfai 网关上的：

- `GET https://api.tokfai.com/v1beta/models`
- `POST https://api.tokfai.com/v1beta/models/{model}:generateContent`

Base URL 必须是 `https://api.tokfai.com`，API Key 仍是 Tokfai `sk-tokfai_…`。

可用聊天模型 ID：`gemini-2.5-flash`、`gemini-2.5-pro`、`gemini-3-flash`、`gemini-3-pro`。  
图片专用模型不走此接口——请使用 Tokfai 图片工作台或 `POST /v1/images/generations`。

---

<a id="billing"></a>

> 更新于 2026-07-13

# 计费说明

- 消费者看到的是 **算力积分（compute credits）**  
- 充值套餐以人民币标价，到账为算力积分（可能含赠送）  
- Chat / Responses：按用量扣算力积分  
- Image：按次扣算力积分  
- 失败请求通常不扣费，以 Usage 与 Credits 账本为准  
- 详细套餐与单价请看定价页；模型能力请看模型页

---

<a id="error-codes"></a>

> 更新于 2026-07-13

# 错误码

公开错误只返回友好 `message` + 稳定 `code` + `request_id`。技术细节进内部日志。

| code | 说明 |
|---|---|
| `insufficient_credits` | 算力积分不足，请充值后再试 |
| `reference_image_required` | 请先上传参考图片，或改用文生图模式 |
| `image_generation_timeout` | 图片生成时间较长，请稍后重试或更换模型 |
| `invalid_image_url` | 图片地址不合法（含 blob / localhost 等） |
| `unauthorized` / `invalid_token` | 鉴权失败 |

示例：

```json
{
  "error": {
    "message": "算力积分不足，请充值后再试。",
    "code": "insufficient_credits",
    "type": "billing_error",
    "request_id": "…"
  }
}
```

---

<a id="faq"></a>

> 更新于 2026-07-13 · GET /v1/health

# 常见问题

## Base URL 填什么？
`https://api.tokfai.com`

## API Key 会绑定模型吗？
**不会。** API Key 只用于鉴权；每次请求在 body 里指定 `model` 即可切换模型。

## GPT-5.5 应该用哪个接口？
推荐 `POST /v1/responses`（复杂推理、长上下文、工具调用、Agent / Codex）。简单聊天仍可用 `/v1/chat/completions`。

## MATLAB 能接入吗？
可以。MATLAB 通过 HTTP JSON 调用 Tokfai API；GPT-5.5 等场景推荐 `/v1/responses`。详见 [MATLAB 接入](/docs/matlab)。

## 图片接口路径是什么？
`POST /v1/images/generations`（不是其它历史路径）。也可使用 Dashboard **图片工作台**。

## 为什么聊天客户端看不到图片模型？
`GET /v1/models` 默认只返回通用文本/聊天模型。图片功能请使用 Tokfai 图片工作台或 OpenAI-compatible 图片接口。

## Cherry Studio 必须选哪个供应商？
必须选择 **Tokfai / `| tokfai`**。若选 Gemini / OpenAI 等其它供应商，请求不会经过 Tokfai。

## 文生图和改图是不是两个接口？
不是。同一公开接口；有无 `images` 区分模式。

## 失败会扣费吗？
通常不扣；以 Usage / Credits 为准。用 `request_id` 对账。

## 健康检查
`https://api.tokfai.com/v1/health`

---

<a id="troubleshooting"></a>

> 更新于 2026-07-13 · GET /v1/health

# 排障

## 401 / 鉴权失败
- 确认使用 `Authorization: Bearer sk-tokfai_…`  
- 确认 Key 未被撤销

## model not found / model not register
- 模型 ID 拼写是否正确  
- Cherry 是否选中了 Tokfai Provider  
- Base URL 是否为 `https://api.tokfai.com`

## 有调用但 Usage 无条目
- 可能请求打到了错误的 Base URL  
- 到 Credits / Usage 核对 request_id

健康检查：`https://api.tokfai.com/v1/health`
