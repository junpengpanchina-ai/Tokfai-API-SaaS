# Tokfai 错误码指南（客户可读）

> 面向客户支持、销售与自助排查。  
> 对账请保留响应里的 **`request_id`**（或 `error.request_id` / `tokfai.request_id`），到 Dashboard → Usage 核对状态与扣费。

通用原则：

- **失败默认不计费**（`billing_status=not_billable`，`credits_charged=0`）
- **成功可计费**才扣算力积分
- 不要把完整 API Key 发给支持；用 Key 前缀 + `request_id` 即可

---

## 1. 鉴权类

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `unauthorized` | 未授权或鉴权失败 | 否 | 检查 `Authorization: Bearer sk-tokfai_…` |
| `invalid_token` | API Key 无效或格式错误 | 否 | 重新复制 Key；确认无多余空格 |
| `missing_token` | 缺少 Authorization | 否 | 补上 Bearer Token |
| `key_revoked` | Key 已撤销 | 否 | 控制台创建新 Key 并替换客户端配置 |

---

## 2. 计费 / 配额类

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `insufficient_credits` | 算力积分不足 | 否 | Dashboard → Credits 充值后再试 |
| `too_many_requests` | 请求过于频繁 | 否 | 降并发、稍后重试 |
| `too_many_concurrent_requests` | 并发过高 | 否 | 降低并行数 |
| `gateway_overloaded` | 网关过载 | 否 | 稍后重试；可换 `auto-fast` 试跑 |

---

## 3. 模型 / 路由类

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `model_not_available` | 模型不可用或不存在 | 否 | 改用 `/v1/models` 列表中的模型 |
| `image_model_not_for_chat` | 图片模型不能走 Chat | 否 | 改用 `/v1/images/generations` |
| `model_not_image_capable` | 文本模型不能走文生图 | 否 | 改用 `nano-banana` 等图片模型 |
| `image_model_not_available` | 当前图片模型不可用 | 否 | 切换其他图片模型 |
| `model_not_tool_capable` | 该模型未通过 tools 白名单验证 | 否 | 去掉强制 tools，或改用已验证模型（见商业矩阵） |

---

## 4. Tools / 假 tool call 防护（P971–P974）

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `model_not_tool_capable` | 模型未验证为 tool-capable | 否 | 勿将 tools 当默认承诺；改普通 chat |
| `tool_call_not_generated` | 强制要求 tool call 但上游未生成真实 tool_calls | 否 | 换已验证模型，或改 `tool_choice=auto` / 去掉 tools |
| `all_tool_upstreams_unavailable` | 所有 tools 上游不可用 | 否 | 稍后重试；降级为普通对话 |

说明：`tool_choice=auto` 且模型非白名单时，网关可能降级为普通对话并标记 `tokfai.auto_no_tool_call`；**成功对话仍可能正常计费**。

---

## 5. 请求校验类

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `invalid_request` / `invalid_prompt` | 请求体不合法 / prompt 缺失 | 否 | 对照文档检查 JSON 字段 |
| `unsupported_n` | `n` 不支持（图片目前多为 1） | 否 | 将 `n` 设为 `1` |
| `unsupported_response_format` | `response_format` 不支持 | 否 | 图片用 `url` 等已支持值 |
| `invalid_image_url` | 图片 URL 不合法 | 否 | 使用可公网访问的 https URL |
| `reference_image_required` | 需要参考图 | 否 | 上传参考图或改文生图模式 |
| `stream_not_supported` | 当前路径不支持 stream | 否 | 改 `stream:false` 或换支持流式的接口 |

---

## 6. 上游 / 超时类

| code | 用户可理解解释 | 是否扣费 | 建议处理 |
|---|---|---|---|
| `upstream_timeout` / `upstream_error` | 上游超时或错误 | 否 | 稍后重试；保留 `request_id` |
| `upstream_image_error` | 图片上游暂时不可用 | 否 | 稍后重试或换更快图片模型 |
| `image_task_timeout` | 图片生成超时 | 否 | 可重试或换 `nano-banana-fast` |
| `image_task_timeout_pending` / `timeout_pending` | 软超时，任务可能仍在进行 | 否（未出结果前） | 继续用 `task_id` 轮询 |

---

## 7. 如何用 request_id 反馈

1. 从错误 JSON / SSE error 事件复制 `request_id`
2. 打开 https://tokfai.com → Dashboard → **Usage**
3. 对照：时间、模型、状态、错误码、**扣除算力积分是否为 0**
4. 发给支持时附带：

```text
request_id: …
time: …
model: …
HTTP status: …
error.code: …
credits_charged (Usage): 0 / …
```

---

## 8. 客户常见问答

**Q: 失败了会扣费吗？**  
A: 一般不会。Usage 中失败行的扣除算力积分应为 0；以 `billing_status=not_billable` 为准。

**Q: 为什么 Cursor 报 tools 相关错误？**  
A: Tools 不是默认公开承诺。未白名单验证会返回 `model_not_tool_capable` 且不计费。详见 `docs/model-commercial-matrix.zh.md`。

**Q: 成功但积分看起来不对？**  
A: 提供 `request_id`，对照 Usage 与 Credits 账本；别名模型可能显示路由后的实际模型。

配套：`docs/customer-onboarding-playbook.zh.md` · `docs/model-commercial-matrix.zh.md`
