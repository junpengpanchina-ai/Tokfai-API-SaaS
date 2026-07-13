# Tokfai 用户接入 API 参考

> 独立客户文档（对齐 `api.tokfai.com` 实际行为）  
> 更新：2026-07-14  
> 官网：https://www.tokfai.com  
> Base URL：`https://api.tokfai.com`  
> 路径前缀：`https://api.tokfai.com/v1`  
> 计费单位：算力积分（compute credits）

模型能力见控制台「模型」页；单价与套餐见「定价」页。本文只讲怎么调用。

---

## 1. 快速开始

1. 在官网注册并登录  
2. 充值算力积分  
3. 在控制台创建 `sk-tokfai_…` API Key（**Key 不绑定模型**，模型在每次请求 body 的 `model` 字段指定）  
4. 用下方命令验证连通性

```bash
curl https://api.tokfai.com/v1/models \
  -H "Authorization: Bearer sk-tokfai_xxx"
```

说明：

- 外部集成请使用独立的 Tokfai API Key（`sk-tokfai_` 前缀）
- `GET /v1/models` **可不带鉴权**；带 Key 也可以
- 成功请求按用量扣算力积分；失败通常不扣费，以 Usage / Credits 为准
- Base URL 必须是 `https://api.tokfai.com`

---

## 2. 认证

### 推荐（外部客户端 / 生产）

```http
Authorization: Bearer sk-tokfai_<48位小写hex>
```

- 在控制台创建；前缀必须是 `sk-tokfai_`
- Key 只负责鉴权，不绑定模型
- 不要把 Key 写进前端公开仓库；服务端持有

### 实际鉴权矩阵

| 接口 | 鉴权 |
|---|---|
| `GET /v1/models` | 无需鉴权 |
| `GET /v1/health`、`GET /v1/status` | 无需鉴权 |
| `POST /v1/chat/completions` | API Key **或** 控制台登录 JWT |
| `POST /v1/responses` | API Key **或** 控制台登录 JWT |
| `POST /v1/images/generations` | API Key **或** 控制台登录 JWT |
| `GET /v1/images/generations/{id}` | API Key **或** 控制台登录 JWT |
| `POST /v1beta/models/{model}:generateContent` | API Key（Bearer / `x-goog-api-key` / `?key=`）或 Bearer JWT |
| `POST /v1/batches/chat` | **仅 API Key** |

> 控制台 Playground 可用登录会话调用部分接口；**第三方 / 生产集成请只用 API Key**。

---

## 3. 公开接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/v1/models` | 模型列表 |
| `POST` | `/v1/chat/completions` | 文本对话（OpenAI Chat Completions） |
| `POST` | `/v1/responses` | Responses 形态（兼容层；见下文能力边界） |
| `POST` | `/v1/images/generations` | 文生图 / 参考图改图 |
| `GET` | `/v1/images/generations/{id}` | 图片任务状态查询（beta） |
| `GET` | `/v1/api/result?id=` | 图片异步查询兼容 alias（beta） |
| `POST` | `/v1/batches/chat` | 批量文本任务 |
| `GET` | `/v1beta/models` | Gemini 原生模型列表 |
| `POST` | `/v1beta/models/{model}:generateContent` | Gemini 原生生成 |
| `POST` | `/v1beta/models/{model}:streamGenerateContent` | Gemini 原生流式 |
| `GET` | `/v1/health` | 健康检查 |
| `GET` | `/v1/status` | 公开路由清单 |

没有 `/v1/embeddings`。

---

## 4. 文本对话 API

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

### 请求字段（实际上游转发）

| 字段 | 说明 |
|---|---|
| `model` | 必填。模型 ID，见 `/v1/models` |
| `messages` | 必填。OpenAI 风格多轮消息 |
| `stream` | 可选。`true` 时返回 SSE |
| `temperature` | 可选 |
| `top_p` | 可选 |
| `max_tokens` | 可选 |

> 当前网关向上游只转发上表字段。`tools` / `tool_choice` / `functions` 等**不会**被转发，请勿按完整 OpenAI tool-calling 能力来设计生产依赖。

按用量扣算力积分。能力与单价见模型页 / 定价页。

---

## 5. Responses API

路径：`POST https://api.tokfai.com/v1/responses`

```bash
curl https://api.tokfai.com/v1/responses \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "input": "Say OK in one short sentence."
  }'
```

单行：

```bash
curl -sS https://api.tokfai.com/v1/responses -H "Authorization: Bearer sk-tokfai_xxx" -H "Content-Type: application/json" -d '{"model":"auto-fast","input":"Say ok only."}'
```

### 能力边界（请读）

- 提供 OpenAI Responses **形态兼容**（`input` → 内部转 chat，再映射回 Responses 风格响应）
- 适合希望用 Responses 字段风格接入的客户端
- **不承诺**完整 tool calling / Agent 工具链；与 Chat Completions 同源转发限制
- API Key **不绑定模型**——在 body 里指定 `model` 即可

### 响应示例（简化）

```json
{
  "id": "resp_xxx",
  "object": "response",
  "status": "completed",
  "model": "gpt-5.5",
  "output_text": "OK."
}
```

实际响应还可能包含 `created_at`、`output[]`、`usage`、`tokfai` 等字段。

### MATLAB 示例（webwrite）

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

---

## 6. 图片生成 API

Base URL：`https://api.tokfai.com`  
Endpoint：`POST /v1/images/generations`  
Auth：`Authorization: Bearer sk-tokfai_xxx`

### 三种用法（同一公开接口）

| 场景 | 怎么区分 |
|---|---|
| 文生图 | 不传参考图字段，或传空数组 |
| 参考图改图 | `images` / `image_urls` / `reference_images` / `input_images` 非空；或 `mode: "reference_edit"` |
| 电商图 | 文生图或带商品参考图 + 电商场景 prompt |

### 兼容字段

`model`、`prompt`、`images`、`image_urls`、`reference_images`、`input_images`、`size`、`aspect_ratio` / `aspectRatio`、`response_format`、`mode`、`n`

### 约束（与实现一致）

| 项 | 规则 |
|---|---|
| `prompt` | 必填 |
| `n` | 目前仅支持 `1` |
| `response_format` | 目前仅支持 `"url"` |
| 参考图数量 | 最多 4 张 |
| 参考图 URL | `http://` / `https://`；也支持 `data:image/…;base64,…` |
| 不支持 | `blob:`、`file:`、内网 / 私有地址（含 localhost） |
| 未指定 `model` 时 | 默认图片模型为 `nano-banana-fast`（示例常用 `gpt-image-2`） |

### Shell（文生图）

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

### 参考图改图

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

若改图意图明确但未上传参考图，可能返回：

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

### 成功响应字段

`id`、`object`、`created`、`model`、`status`、`data`、`usage`、`tokfai`  
成功才扣费；失败通常不扣费（以 Usage / Credits 为准）。

### 异步查询（beta）

`GET /v1/images/generations/{id}` 可按 `request_id` 查状态。  
公测阶段：图片 URL 以 POST 成功响应为准；GET 主要返回状态与计费字段。

### JavaScript

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

### Python

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

---

## 7. Gemini 原生兼容

仅在客户端必须走 Gemini 原生协议时使用。  
Base URL 仍是 `https://api.tokfai.com`；鉴权仍用 Tokfai Key。

可用模型 ID（示例）：

- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-3-flash`
- `gemini-3-pro`

路径：

- `POST /v1beta/models/{model}:generateContent`
- `POST /v1beta/models/{model}:streamGenerateContent`
- `GET /v1beta/models`

鉴权任选其一：

- `Authorization: Bearer sk-tokfai_xxx`
- `x-goog-api-key: sk-tokfai_xxx`
- `?key=sk-tokfai_xxx`

大多数场景优先用 OpenAI 兼容的 `/v1/chat/completions`。

---

## 8. Cherry Studio 接入

新增 **OpenAI Compatible / Custom OpenAI** 服务：

| 项 | 值 |
|---|---|
| 服务名称 | Tokfai |
| Base URL | `https://api.tokfai.com` |
| API Key | `sk-tokfai_xxx` |
| 模型 ID | 从 Tokfai 模型列表选择，如 `gpt-5.4`、`gpt-5.5`、`auto-fast`、`gemini-3-flash` |

检查清单：

- Base URL 是否为 `https://api.tokfai.com`
- API Key 是否以 `sk-tokfai_` 开头
- 模型 ID 是否来自 Tokfai 模型列表
- 是否误用了其它服务的旧配置

验证：在 Cherry 发一条短消息，到 Tokfai Usage 确认出现记录。

若必须用 Gemini Provider，请配置 `/v1beta/...` 并使用上文 Gemini 鉴权方式。

---

## 9. 批量文本（简要）

`POST /v1/batches/chat` — **仅 API Key**。  
适合异步批量 chat；具体字段以控制台接入文档 / 接口返回为准。

---

## 10. 计费说明

- 消费者看到的是 **算力积分（compute credits）**
- 充值套餐以人民币标价，到账为算力积分（可能含赠送）
- Chat / Responses：按用量扣算力积分
- Image：按次扣算力积分
- 失败请求通常不扣费，以 Usage 与 Credits 账本为准
- 详细套餐与单价看定价页；模型能力看模型页

---

## 11. 错误码

公开错误返回友好 `message` + 稳定 `code` + `request_id`。

### 常见 code

| code | 说明 |
|---|---|
| `insufficient_credits` | 算力积分不足，请充值后再试 |
| `reference_image_required` | 请先上传参考图片，或改用文生图模式 |
| `image_generation_timeout` | 图片生成超时，请稍后重试或更换模型 |
| `invalid_image_url` | 图片地址不合法（含 blob / localhost / 私有网段等） |
| `invalid_prompt` | prompt 缺失或不合法 |
| `unsupported_n` | `n` 不支持（目前仅 `1`） |
| `unsupported_response_format` | `response_format` 不支持（目前仅 `url`） |
| `unauthorized` / `invalid_token` / `missing_token` / `key_revoked` | 鉴权失败 |
| `model_not_supported` | 模型不可用或不存在 |
| `too_many_requests` / `too_many_concurrent_requests` / `gateway_overloaded` | 限流 / 过载 |
| `upstream_timeout` | 上游超时 |

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

对账请保留 `request_id`。

---

## 12. 常见问题

### Base URL 填什么？

`https://api.tokfai.com`

### API Key 会绑定模型吗？

**不会。** 每次请求在 body 里指定 `model`。

### GPT-5.5 用哪个接口？

- 简单多轮聊天：`POST /v1/chat/completions`
- 需要 Responses 字段风格：`POST /v1/responses`
- 两者当前都**不**转发完整 tool calling

### 图片接口路径？

`POST /v1/images/generations`（文生图与改图同一路径）

### 失败会扣费吗？

通常不扣；以 Usage / Credits 为准。用 `request_id` 对账。

### 健康检查

`https://api.tokfai.com/v1/health`

---

## 13. 排障

### 401 / 鉴权失败

- 确认 `Authorization: Bearer sk-tokfai_…`
- 确认 Key 未被撤销（`key_revoked`）
- 批量接口 `/v1/batches/chat` 不接受控制台 JWT

### model_not_supported / 模型不可用

- 模型 ID 拼写是否正确
- 是否来自 `GET /v1/models`
- Base URL 是否为 `https://api.tokfai.com`
- Cherry 是否选中了 Tokfai Provider

### 有调用但 Usage 无条目

- 可能请求打到了错误的 Base URL
- 到 Credits / Usage 用 `request_id` 核对

健康检查：`https://api.tokfai.com/v1/health`

---

## 附录：与控制台「接入文档」的差异（校对用）

| 原控制台文档说法 | 实际情况 |
|---|---|
| Dashboard 会话不能调用公开 API | Chat / Responses / Images / Gemini 实际也接受控制台 JWT；外部集成仍应只用 API Key |
| Responses 支持 tool calling / Codex 工具链 | 当前不向上游转发 `tools` / `tool_choice` |
| 文档内链 `/docs/matlab` 等 | 控制台为单页 hash：`/dashboard/docs#matlab`；slug 路径会 404 |
| `GET /v1/models` 示例带 Bearer | 可用，但非必需 |
| 图片只提 `images` / `image_urls` | 还接受 `reference_images` / `input_images`；另有 `n`、`response_format`、张数等约束 |
| 未写 batch / Gemini stream | 公开面已有 `POST /v1/batches/chat`、`…:streamGenerateContent` |
