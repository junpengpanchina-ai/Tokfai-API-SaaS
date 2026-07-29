# Tokfai 客户接入手册（商业可复制）

> 给销售、实施、新客户的标准 SOP。  
> 配套：`docs/model-commercial-matrix.zh.md` · `docs/error-code-guide.zh.md` · 演示 Runbook：`docs/customer-demo-runbook.md`

---

## 1. Tokfai 是什么

Tokfai 是 **OpenAI 兼容的 AI API 网关**（`api.tokfai.com`）：

- 用熟悉的 `/v1/chat/completions`、`/v1/models`、`/v1/images/generations` 接入
- 统一 API Key（`sk-tokfai_…`）、统一账单（算力积分 credits）
- 面向 Cursor、自建应用、工作流平台等客户端

**不是**：某个单一大模型厂商的直连账号；也不是「保证所有模型都支持 tool calling」的万能兼容层。

---

## 2. 适合哪些客户

| 适合 | 不太适合（当前阶段） |
|---|---|
| 需要 OpenAI 兼容协议快速接入 | 要求强 SLA / 专属机房 |
| Cursor / Chatbox / 自研 Chat 应用 | 依赖未验证的 tools/function calling 生产闭环 |
| 按量付费、可对账（request_id） | 需要 fine-tune / 私有模型托管 |
| 同时要文生图（Nano Banana）与对话 | 把「别名模型」当成独立上游承诺 |

---

## 3. 注册与登录

1. 打开 [https://tokfai.com](https://tokfai.com) → **注册 / 登录**
2. 使用邮箱或 Google 完成鉴权（Supabase Auth）
3. 登录后进入 **Dashboard**，确认余额（Credits）可见

---

## 4. 获取 API Key

1. Dashboard → **API Keys**
2. 创建 Key → **仅展示一次明文**，立即复制保存
3. 格式：`sk-tokfai_` + 随机串
4. 泄露后立即在控制台 **撤销（Revoke）** 并换新 Key

请求头：

```http
Authorization: Bearer sk-tokfai_********
```

---

## 5. Base URL

| 用途 | URL |
|---|---|
| API 根 | `https://api.tokfai.com` |
| OpenAI SDK `baseURL` | `https://api.tokfai.com/v1` |

常见路径：

- `POST /v1/chat/completions`
- `GET /v1/models`
- `POST /v1/images/generations`（图片；勿用文本模型）
- `GET /v1/images/generations/{task_id}`（轮询）

---

## 6. curl 示例（对话）

```bash
curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer $TOKFAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto-fast",
    "messages": [{"role":"user","content":"用一句话介绍 Tokfai"}],
    "stream": false
  }'
```

成功时关注：

- HTTP `200`
- `choices[0].message.content`
- `request_id` / `tokfai.request_id`
- `tokfai.credits_charged`（或顶层 `credits_charged`）

---

## 7. Cursor 接入示例

1. Cursor Settings → Models / OpenAI Compatible（以当前 Cursor 版本 UI 为准）
2. **API Base URL**：`https://api.tokfai.com/v1`
3. **API Key**：粘贴 `sk-tokfai_…`
4. 模型：优先选 **auto-fast**（日常）或 **auto-pro / gpt-5.5**（质量）
5. **Tools / Agent tool calling**：
   - 目前 **不作为公开承诺能力**
   - 仅当运维在 `VERIFIED_TOOLS_CAPABLE_MODEL_IDS` 白名单中验证过的模型，才可标 `capabilities.tools=true`
   - 未验证模型强制 `tool_choice=required` 会返回 `model_not_tool_capable`，**不计费**

若 Cursor 报错：复制响应中的 `request_id`，到 Dashboard → Usage 核对是否扣费。

---

## 8. 模型选择建议（销售话术）

| 场景 | 建议模型 | 说明 |
|---|---|---|
| 日常对话 / 低成本试跑 | `auto-fast` | 默认推荐入口 |
| 写代码 / 更强推理 | `auto-pro` 或 `gpt-5.5` | 质量优先 |
| 长文本 / 多模态理解 | `gemini-2.5-flash` 等 | 见商业矩阵 |
| 文生图 | `nano-banana` | **仅** `/v1/images/generations` |
| Tools / Function calling | 勿默认承诺 | 见白名单；详见矩阵文档 |

完整表：`docs/model-commercial-matrix.zh.md`

---

## 9. 账单说明

- 计费单位：**算力积分（credits）**
- **成功**的可计费请求 → `credits_charged > 0`（或 unlimited 测试账号为 0）
- **失败**请求 → `billing_status=not_billable`，**credits_charged=0**（假 tool、超时、模型不可用、校验失败等）
- 用户在 Dashboard → **Usage** 看到每条请求的模型、状态、tokens、扣费、`request_id`、错误码
- Dashboard → **Credits** 看余额与账本流水

---

## 10. 常见错误与 request_id 反馈

1. 从 API JSON / SSE error 中复制 **`request_id`**
2. 打开 Dashboard → Usage，搜索/对照该 id
3. 确认：`status`、`error_code`、`credits_charged` 是否为 0
4. 反馈给支持时请提供：
   - `request_id`
   - 时间（UTC/本地）
   - 模型 id
   - HTTP 状态与 `error.code`
   - **不要**粘贴完整 API Key

错误码释义：`docs/error-code-guide.zh.md`

---

## 11. 销售可复制 SOP（下一客户）

1. 发本手册 + 商业矩阵 + 错误码指南  
2. 协助注册 → 创建 Key → 跑通 §6 curl  
3. 按场景推荐模型（勿承诺 tools）  
4. 演示 Usage 对账与「失败不扣费」  
5. 需要工具调用时：先做 LIVE 验证，再加入白名单，再更新矩阵「推荐」列  

---

## 12. 相关链接

- 站点：https://tokfai.com  
- API：https://api.tokfai.com  
- 在线 Docs：站点 `/docs`  
- 演示 Runbook：`docs/customer-demo-runbook.md`
