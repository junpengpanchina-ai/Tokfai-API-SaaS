# 试用额度与商业风控（P982）

> 目标：可灰度售卖、可控试用、超额/禁模失败不计费。  
> 不承诺 fully compatible；不改成功扣费主路径语义。

---

## 1. 能力概览

| 能力 | 说明 |
|---|---|
| 每 Key `trial_mode` | 试用 Key 仅允许白名单模型 |
| `trial_credits_limit` | 试用 Key 终身已扣积分上限 |
| `daily_credit_limit` / `monthly_credit_limit` | 每 Key 可选日/月上限 |
| 模型风控 | 试用默认仅 `auto-fast` / `auto-cheap` |
| 失败不计费 | 超额 / 禁模 → `not_billable`，`credits_charged=0` |

Schema：`supabase/migrations/0038_p982_api_key_trial_quota.sql`  
代码：`apps/dmit-api/src/gateway/trialQuotaGuard.ts`（上游调用前拦截）

---

## 2. 错误码

| code | HTTP | 含义 | 扣费 |
|---|---|---|---|
| `trial_model_not_allowed` | 403 | 试用 Key 打了高成本/未允许模型 | 否 |
| `trial_limit_exceeded` | 429 | 试用终身额度用尽 | 否 |
| `daily_limit_exceeded` | 429 | 日额度用尽（Key 或全局） | 否 |
| `quota_exceeded` | 429 | 月配额等总配额用尽 | 否 |

响应含 `request_id` 与 `tokfai.billing_status=not_billable`。

---

## 3. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `TOKFAI_TRIAL_GUARD_ENABLED` | `true` | 总开关 |
| `TOKFAI_TRIAL_ALLOWED_MODELS` | `auto-fast,auto-cheap` | 试用允许模型 |
| `TOKFAI_TRIAL_DEFAULT_CREDITS_LIMIT` | `500` | trial_mode 且未设列时的终身上限 |
| `TOKFAI_TRIAL_DAILY_CREDIT_LIMIT` | `200` | 试用 Key 默认日上限 |
| `TOKFAI_TRIAL_MONTHLY_CREDIT_LIMIT` | `500` | 试用 Key 默认月上限 |

---

## 4. 运营配置建议

1. 新试用客户：创建 Key 后设 `trial_mode=true`，可选写入 `trial_credits_limit`  
2. 高成本模型（如 `gpt-5.5` / `auto-pro`）**不要**加入试用白名单  
3. 转正：`trial_mode=false`，清空或提高 limit  
4. 排障：Usage 搜 `request_id`，确认 `credits_charged=0`  

---

## 5. 日志（脱敏）

`commercial_request_trace` / guard 日志包含：

- `requestId`、`userId`、`apiKeyIdMasked` / `apiKeyPrefix`、`model`、`status`、`credits_charged`、`error_code`  

**禁止**打印完整 `sk-tokfai_…`。

配套 SOP：`docs/customer-risk-control-sop.zh.md`
