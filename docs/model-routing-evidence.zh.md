# 模型调度证据说明（Model Routing Evidence）

> 面向客户、销售、售后。配合账单证据：`docs/customer-billing-evidence.zh.md`（若已交付）与本页 SOP。

---

## 1. 一句话

每次 Chat 请求，Tokfai 都会在响应的 `tokfai` 对象里留下**可截图、可对账**的调度证据：你请求了什么、最终谁承接、尝试链路、是否 fallback、按哪个结果扣费。

---

## 2. 关键字段（成功）

| 字段 | 含义 |
|---|---|
| `request_id` | 全局请求号，售后必带 |
| `requested_model` | 客户请求的模型 id（如 `auto-fast`） |
| `resolved_model` | 最终承接的模型 id（如 `gemini-3-flash`） |
| `routing_strategy` | 调度策略：`auto-fast` / `auto-pro` / `auto-cheap` / `alias:…` / `direct` / `compat_rewrite` |
| `attempted_models` | 本次实际尝试的模型链路 |
| `fallback_attempts` | 尝试次数（含成功那一次） |
| `latency_ms` | 端到端耗时 |
| `billing_status` | 成功通常为 `charged`（无限额测试账号可能为 `not_billable`） |
| `credits_charged` | 本次扣除算力积分 |

---

## 3. 关键字段（失败）

失败响应同样带 `tokfai`，且：

- `billing_status=not_billable`
- `credits_charged=0`
- 含 `fallback_reason` 或 `error_code`（如 `model_not_tool_capable`、模型不存在等）
- `resolved_model` 可能为 `null`（未成功承接）

---

## 4. auto-* 不是固定单一模型

- `auto-fast` / `auto-pro` / `auto-cheap` 是**调度策略**，不是某个 upstream 的固定 SKU。
- `requested_model` 记录客户请求；`resolved_model` 记录最终承接。
- `attempted_models` 是 Tokfai 为稳定性尝试过的链路；**fallback ≠ 乱跳**，是为了可用性和超时恢复。
- 成功按**最终结果（billable / resolved 路径）**扣费；失败不扣费。

---

## 5. Tools 承诺边界

- 未在白名单 / `capabilities.tools` 验证的模型，在严格 tools 请求下会失败并 `not_billable`。
- **不宣称 fully compatible**；不承诺所有模型支持 tool calling。

---

## 6. 客户怎么用

1. 看 Usage / curl 响应里的 `request_id` + `tokfai`。
2. 成功：核对 `requested_model` → `resolved_model` → `credits_charged`。
3. 失败：核对 `error_code` / `fallback_reason` 且积分为 0。
4. Cursor / Codex / Hermes：反馈问题时同时贴 **request_id + routing evidence + billing evidence**。

不要分享完整 API Key；Admin / 销售截图只用 masked prefix。
