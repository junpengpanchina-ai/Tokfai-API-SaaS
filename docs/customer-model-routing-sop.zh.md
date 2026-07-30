# 客户模型调度 SOP（销售 / 售后）

> 配合：`docs/model-routing-evidence.zh.md`

---

## 1. 交付话术

- 「auto-fast / auto-pro / auto-cheap 是智能调度，不是单一固定模型。」
- 「响应里的 `tokfai.requested_model` 是你请求的；`resolved_model` 是实际承接的。」
- 「`attempted_models` 是尝试链路；fallback 是为了稳定，不是随意跳模型。」
- 「失败不计费；成功按最终承接结果计费。」
- 「不承诺所有模型 tools / fully compatible。」

---

## 2. 售后排障清单

- [ ] 收齐：`request_id`、时间、是否 stream、是否 tools、客户请求的 model
- [ ] 在响应或 Usage / Admin 最近请求里核对：
  - requested / resolved / attempted_models
  - routing_strategy / fallback_attempts / fallback_reason
  - billing_status / credits_charged
- [ ] 失败必须 `not_billable` 且 `credits_charged=0`
- [ ] tools 失败看是否 `model_not_tool_capable`（未验证模型）
- [ ] 截图只用 masked API Key，不索要完整密钥，不暴露上游密钥

---

## 3. 销售截图建议

Admin → Overview → **最近请求明细（账单证据）**，或客户 Usage 页。字段齐了即可：

Requested · Resolved · Attempted · Fallback attempts · Strategy · Reason · Latency · Billing · Credits · Request ID

---

## 4. Cursor / Codex / Hermes

问题单模板：

```
request_id:
requested_model:
resolved_model (if any):
routing_strategy / attempted_models:
billing_status / credits_charged:
stream / tools:
error_code (if fail):
```
