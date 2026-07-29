# 错误码与 request_id 售后 SOP

> 客户、售后、销售统一口径。  
> 详细码表还可参考：`docs/error-code-guide.zh.md`

---

## 1. 财务边界（先说清楚）

| 结果 | 是否扣费 | 客户在 Usage 应看到 |
|---|---|---|
| 成功可计费 | **扣费** | status 成功，`credits_charged` ≥ 0（按价） |
| 失败 / 校验失败 / 上游不可用 / tools 保护拦截 | **不扣费** | `not_billable` 或 `credits_charged=0` |

图片：仅成功出图后扣费。

---

## 2. 反馈五件套（缺一补齐再排障）

客户提工单必须带：

1. **`request_id`**（响应 JSON / SSE error / Usage 复制）  
2. **模型名**（body 里的 `model`）  
3. **时间**（本地时间 + 时区，或 UTC）  
4. **是否 stream**（`stream: true/false`）  
5. **是否 tools**（有无 `tools` / `tool_choice`；是否 Agent）

**禁止**粘贴完整 API Key；可用 Key 前缀。

### 客户粘贴模板

```text
request_id:
model:
time (timezone):
stream: true | false
tools: none | auto | required | function:...
HTTP status (if known):
error.code (if known):
what I expected:
```

---

## 3. 高频错误处理（必须会）

| error.code | 用户可读解释 | 扣费？ | 建议处理 |
|---|---|---|---|
| `model_not_available` | 模型不存在或未上架 | 否 | 改用 `/v1/models` 列表；试 `auto-fast` |
| `model_not_tool_capable` | 该模型未验证 tools | 否 | 去掉强制 tools，或换已验证模型；勿宣传 fully tools |
| `upstream_model_busy` | 上游繁忙 | 否 | 稍后重试；可换 `auto-fast` / 其它模型 |
| `all_upstreams_unavailable` | 上游均不可用 | 否 | 稍后重试；保留 request_id 升级 |
| `insufficient_credits` | 算力积分不足 | 否 | Dashboard → Credits 充值 |

其它常见：`invalid_token` / `unauthorized`（查 Key）、`too_many_requests`（降并发）、`image_model_not_for_chat`（改 Image API）。

---

## 4. 售后定位步骤

1. 向客户要齐「五件套」  
2. Admin / Usage 用 `request_id` 定位行  
3. 核对：`status`、`error_code`、`credits_charged`、`billing_status`  
4. 若失败却扣费 → 升级账务（钱袋子风险），**不要先让客户重试烧钱**  
5. 若失败未扣费 → 按上表给处理建议；属保护机制则解释「未计费」  

---

## 5. stream / tools 特别说明

- **stream=true**：错误可能在 SSE 的 `error` 事件里，仍应有 `request_id`，并以 `data: [DONE]` 结束（P972）  
- **tools 强制 + 非白名单**：期望 `model_not_tool_capable` 且不计费（P974）  
- **假 tool call 防护**：强制要求 tool 但无真实 `tool_calls` → 不计费（P971）  

---

## 6. 对客户的一句话

「把 request_id、模型、时间、是否流式、是否 tools 发给我们；失败请求一般不扣费，我们按 Usage 对账。」
