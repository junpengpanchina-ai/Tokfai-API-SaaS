# Tokfai 第三方客户端真实接入指南

Tokfai 是 **OpenAI-compatible API 中转聚合网关**。所有客户端只连 Tokfai，不连任何上游主机。

| 项 | 值 |
|---|---|
| Base URL | `https://api.tokfai.com/v1` |
| API Key | 控制台生成的 `sk-tokfai_…` |
| Provider | **Tokfai**（界面常显示 `\| tokfai`） |
| 模型展示 | `Tokfai GPT-5` / `Tokfai GPT-5.4` / `Tokfai GPT-5 Pro` 等 |

**禁止**把其它厂商主机写成 Base URL。最终请求必须落在 `https://api.tokfai.com/v1/...`。

---

## 推荐模型（Tokfai 品牌）

| 模型 id（调用） | 界面展示名 | 说明 |
|---|---|---|
| `gpt-5` | Tokfai GPT-5 | 通用对话 |
| `gpt-5.4` | Tokfai GPT-5.4 | 兼容别名，内部映射到 `gpt-5` |
| `gpt-5-pro` | Tokfai GPT-5 Pro | 高质量档 |
| `gpt-5.4-pro` | Tokfai GPT-5.4 Pro | 兼容别名，内部映射到 `gpt-5-pro` |
| `gpt-5.5` | Tokfai GPT-5.5 | 高推理 / Responses 友好 |
| `gemini-3-pro` | Tokfai Gemini 3 Pro | Gemini 系 |
| `gemini-2.5-flash` | Tokfai Gemini 2.5 Flash | 低延迟 |

响应元数据（服务端填写）：`tokfai.requested_model` / `tokfai.resolved_model` / `tokfai.credits_charged` / `tokfai.request_id`。

---

## 客户端错误口径（仅 Tokfai）

客户端 / 文档只使用以下口径，不得出现上游域名或上游原始错误：

| 提示 | 含义 | 建议动作 |
|---|---|---|
| `model_not_available` | 模型不可用 | 刷新模型列表，改用上表 id |
| `insufficient_credits` | 算力积分不足 | Dashboard → Credits 充值 |
| `rate_limited` | 请求过快 | 降低并发后重试 |
| `upstream_busy` | 模型繁忙 | 稍后重试或换模型 |

---

## 1. Cherry Studio

1. 设置 → 服务商 → 添加 **OpenAI Compatible**
2. 服务名称：`Tokfai`
3. API Host / Base URL：`https://api.tokfai.com/v1`
4. API Key：粘贴 `sk-tokfai_…`
5. 获取模型列表，只启用 Tokfai 下模型
6. 确认顶部显示 `| tokfai`（例如 `Tokfai GPT-5.4 Pro | tokfai`）
7. **新建话题**后发送：`只回答 TOKFAI_READY，不要解释。`
8. 到 Tokfai Usage 核对 `request_id`

隔离：关闭其它非 Tokfai 服务商，避免旧话题绑错供应商。

---

## 2. Chatbox

1. 设置 → 模型提供方 → OpenAI Compatible / Custom
2. API Host：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. 模型填：`gpt-5` / `gpt-5.4` / `gpt-5-pro` / `gpt-5.4-pro` / `gpt-5.5` / `gemini-3-pro` / `gemini-2.5-flash`
5. 展示名保留 Tokfai 前缀（若客户端支持自定义名称）
6. 发一条短消息，确认 Usage 有记录

---

## 3. NextChat

1. 设置 → 自定义 OpenAI 接口
2. Base URL：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. 模型：`gpt-5.5` 或 `gemini-2.5-flash`
5. 保存后新开对话测试

若客户端自动追加 `/v1`，仍以「最终路径含 `/v1`」为准；本指南统一填写 `https://api.tokfai.com/v1`。

---

## 4. OpenWebUI

1. Admin → Connections → OpenAI
2. API Base URL：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. 同步模型后选择 `Tokfai …` / 对应 id
5. 在 Chat 发一条测试消息

---

## 5. Dify

1. 设置 → 模型供应商 → **OpenAI-API-compatible**
2. API Endpoint / Base：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. 模型名称填 Tokfai 模型 id（如 `gpt-5.5`、`gemini-3-pro`）
5. 在应用 / Workflow 节点选该模型并试跑一轮

---

## 6. FastGPT

1. 账号 → 模型 → 添加 OpenAI 兼容渠道
2. Base URL：`https://api.tokfai.com/v1`
3. Key：`sk-tokfai_…`
4. 模型：`gpt-5` / `gpt-5.4-pro` / `gemini-2.5-flash` 等
5. 知识库问答或对话工作流试跑

---

## 7. Continue

在 `config.yaml` / Continue 设置中配置 OpenAI-compatible provider：

```yaml
models:
  - name: Tokfai GPT-5.5
    provider: openai
    model: gpt-5.5
    apiBase: https://api.tokfai.com/v1
    apiKey: sk-tokfai_…
```

也可用 `gpt-5` / `gpt-5.4` / `gpt-5-pro` / `gpt-5.4-pro` / `gemini-3-pro` / `gemini-2.5-flash`。

---

## 8. Cline

1. API Provider → OpenAI Compatible
2. Base URL：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. Model ID：`gpt-5.5`（或上表其它 id）
5. 在侧栏发一条短任务验证

---

## 9. Roo Code

1. Provider → OpenAI Compatible
2. Base URL：`https://api.tokfai.com/v1`
3. API Key：`sk-tokfai_…`
4. Model：`gpt-5-pro` / `gpt-5.4-pro` / `gpt-5.5`
5. 新会话测试；复杂工具链优先保证 chat/completions 先通

---

## curl 自检（任意客户端配置前）

```bash
curl -sS https://api.tokfai.com/v1/models \
  -H "Authorization: Bearer sk-tokfai_…"

curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_…" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5","messages":[{"role":"user","content":"Say ok only."}],"stream":false}'
```

HTTP 200 且 Usage 有记录后，再把同一 Base URL / Key / 模型填进客户端。

---

## 验收脚本（offline，不请求真实上游）

```bash
node scripts/p920-cherry-studio-client-smoke.mjs
node scripts/p921-chatbox-client-smoke.mjs
node scripts/p922-nextchat-client-smoke.mjs
node scripts/p923-openwebui-client-smoke.mjs
node scripts/p924-dify-client-smoke.mjs
node scripts/p925-fastgpt-client-smoke.mjs
node scripts/p926-continue-client-smoke.mjs
node scripts/p927-cline-client-smoke.mjs
node scripts/p928-roo-code-client-smoke.mjs
```

`LIVE=1 TOKFAI_API_KEY=sk-tokfai_…` 时才允许打真实 `https://api.tokfai.com/v1`。
