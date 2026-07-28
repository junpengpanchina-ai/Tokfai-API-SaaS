# P969 Cursor / OpenAI-Compatible Client Compatibility Report

> 日期：2026-07-29  
> 环境：offline mock + LIVE `https://api.tokfai.com/v1`  
> 约束：未压测；未改 Chat / Image / Billing 核心计费逻辑；未打印 API Key 明文  
> LIVE API Key 前缀：`sk-tokfai_0d0b…`  
> 本地 HEAD：`e2ba4a5ef436d32df2ef0e2223e3df21ecdbdce0`  
> 脚本：`scripts/p969-cursor-compatibility-smoke.mjs`

---

## 最终结论

```
TOKFAI_P969_CURSOR_COMPATIBILITY_PARTIAL_PASS
```

| 问题 | 结论 |
|---|---|
| Cursor 是否可以接入 | **可以（experimental）** — OpenAI-compatible Base URL + API Key + custom model |
| 支持哪些模型（Chat） | `auto-fast` / `auto-pro` / `gpt-5-chat`（及 `GET /v1/models` 列出的其它 text 模型） |
| 哪些功能仅 experimental | Cursor IDE 内聊天；流式 SSE；别名路由；`Idempotency-Key` 幂等 |
| 哪些功能不建议使用 | Image-only 模型走 Chat；对外宣称 fully compatible；大并发压测；依赖 Cursor vendor-native 专有协议 |
| 是否发现扣费异常 | **否**（LIVE usage↔ledger：fail 扣费 0 / 成功漏扣 0 / 双扣 0 / 金额不一致 0） |
| 是否发现 runtime 脏日志 | **否**（`dmit-api-error.log` / healthcheck 近 800 行无 `undefined` / `empty body` / `Cannot set headers` / `api_error_500` / `charged timeout`） |
| 是否可以给内部开发者小范围试用 | **可以（小范围 / experimental）** |

**为何是 PARTIAL 而非 PASS：** LIVE 无法安全触发 `insufficient_credits` / `too_many_requests` / `upstream_timeout` / `upstream_error`（需 mock 触发器或破坏性操作）。这四项在 **offline mock + 静态代码审查** 已 PASS；LIVE 主路径（models / chat / stream / 未知模型 / 图片隔离 / invalid_request / 幂等 / 账务）全部硬 PASS。

Offline 单独结论：`TOKFAI_P969_CURSOR_COMPATIBILITY_PASS`（23/23 hard）。

---

## 一、Cursor 设置说明（experimental）

> **重要：** Tokfai ↔ Cursor 兼容性标记为 **experimental**，**不是** fully compatible。

1. 打开 **Cursor Settings**
2. 进入 **Models**（或 Model provider / OpenAI Compatible）
3. 设置 **OpenAI API Key**：`sk-tokfai_xxx`（Dashboard → API Keys 创建的完整密钥，仅显示一次）
4. 开启 **Override OpenAI Base URL**
5. **Base URL**：`https://api.tokfai.com/v1`（必须含 `/v1`）
6. **Custom model**：`auto-fast`（推荐）或 `gpt-5-chat` / `auto-pro`
7. 发送短测试 prompt；到 Tokfai **Usage** 用 `request_id` 核对

若 Cursor 聊天失败，先用一行 curl 验证 Key + Base URL：

```bash
curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-fast","messages":[{"role":"user","content":"Say ok only."}],"stream":false}'
```

HTTP 200 说明网关与密钥正常，再回头修 Cursor 设置。

---

## 二、OpenAI-compatible 基础验收

| 项 | 期望 | Offline | LIVE |
|---|---|---|---|
| GET `/v1/models` | `object: "list"` + `data[]` + 稳定 id | PASS | PASS |
| model.id 稳定 | 含 `auto-fast` / `auto-pro` / `gpt-5-chat` | PASS | PASS |
| Image-only 不进默认 Chat 目录 | 不返回 `nano-banana` / `gpt-image-*` | PASS | PASS |
| POST chat 非流式 | `choices[0].message.content` + `usage` | PASS | PASS |
| system/user/assistant roles | 正常 | PASS | PASS |
| POST chat `stream=true` | `data: {...}` + 单一 `data: [DONE]` | PASS | PASS |
| 无乱码 / 无重复 DONE / 无 Cannot set headers | 干净 SSE | PASS | PASS |

### LIVE 成功 Chat 扣费样例（响应字段）

| 场景 | model | credits_charged（约） |
|---|---|---:|
| 简单问答 | auto-fast → gemini-3-flash | 0.84 |
| 代码解释 | auto-fast → gemini-3-flash | 0.90 |
| 代码修改建议 | gpt-5-chat → gpt-5.5 | 0.0069 |
| 长 prompt | auto-pro → gpt-5.5 | 0.015 |
| stream | auto-fast | SSE `done=1` chunks=3 |
| 幂等重放 | auto-fast | 同 `request_id` / 同 credits，不双扣 |

---

## 三、Cursor 客户端专项模拟（脚本场景）

| # | 场景 | Offline | LIVE |
|---|---|---|---|
| 1 | 简单问答 | PASS | PASS |
| 2 | 代码解释 | PASS | PASS |
| 3 | 代码修改建议 | PASS | PASS |
| 4 | 长 prompt | PASS | PASS |
| 5 | stream=true | PASS | PASS |
| 6 | unknown model | PASS | PASS |
| 7 | image model used in chat | PASS | PASS |
| 8 | insufficient credits | PASS | SOFT（mock-only） |
| 9 | rate limited | PASS | SOFT（mock-only） |
| 10 | duplicate Idempotency-Key | PASS | PASS |

另：`upstream_timeout` / `upstream_error` / `invalid_request_error` — offline PASS；LIVE 上 `invalid_request_error` PASS，其余 SOFT。

---

## 四、错误码兼容

| 语义（需求） | 实际 `error.code` | HTTP | 计费 | Offline | LIVE |
|---|---|---:|---|---|---|
| model_not_found | `model_not_available` | 400 | not_billable / 0 | PASS | PASS |
| model_not_for_chat | `image_model_not_for_chat` | 400 | not_billable / 0 | PASS | PASS |
| insufficient_credits | `insufficient_credits` | 402 | not_billable / 0 | PASS | SOFT |
| too_many_requests | `too_many_requests` | 429 | not_billable / 0 | PASS | SOFT |
| upstream_timeout | `upstream_timeout` | 504 | not_billable / 0 | PASS | SOFT |
| upstream_error | `upstream_error` | 502 | not_billable / 0 | PASS | SOFT |
| invalid_request_error | `invalid_request_error` | 400 | 不扣费（早退 envelope） | PASS | PASS |

客户端 `error.message` 人类可读；无 vendor 泄漏；无字面量 `undefined`。

---

## 五、账务检查（LIVE P969 请求）

来源：`tmp/p969-billing-reconcile.json`（Supabase 只读）。

| 检查 | 结果 |
|---|---|
| 成功 Chat 正常扣费 | **PASS** — `billing_status=charged`，ledger debit 1 条且金额一致 |
| 失败 Chat 不扣费 | **PASS** — `model_not_available` / `image_model_not_for_chat` → `not_billable` + credits=0 + debit=0 |
| stream 终态 | **PASS** — 单次 `[DONE]`；无脏 SSE |
| duplicate Idempotency-Key | **PASS** — 重放同 `request_id` / 同 credits；`double_debit=0` |
| usage ↔ ledger | **PASS** — `usage_ledger_mismatch=0`，`success_no_debit=0`，`fail_charge_on_fail=0` |

| 计数 | 值 |
|---:|
| unique request_ids | 8 |
| usage_logs 命中 | 7 |
| ledger debits | 5 |
| fail_charge_on_fail | 0 |
| success_no_debit | 0 |
| double_debit | 0 |
| usage_ledger_mismatch | 0 |

说明：1 条 early `invalid_request` 可能无 usage 行（路由在 `executeChatCompletion` 前返回）——仍不产生 ledger 扣费，符合失败不扣。

---

## 六、硬限制声明

1. **Experimental only** — 不可对外写 fully compatible。  
2. 不破坏现有 Chat / Image / Billing / Ledger 主链路（本轮仅增 smoke / mock 触发器 / 报告）。  
3. 不做大压测。  
4. 不打印 API Key 明文。  
5. Image / Batch / Cursor vendor-native Agent 协议不在本验收范围。

---

## 七、产物与复现

| 产物 | 路径 |
|---|---|
| Smoke 脚本 | `scripts/p969-cursor-compatibility-smoke.mjs` |
| Mock 增强（timeout/error/idempotency/not_billable） | `scripts/p786-offline-customer-mock.mjs` |
| Mock 就绪探测 | `scripts/lib/ensure-mock-gateway.mjs` |
| Offline summary | `tmp/p969-cursor-compat-summary.json` |
| LIVE summary | `tmp/p969-cursor-compat-summary-live.json` |
| LIVE billing reconcile | `tmp/p969-billing-reconcile.json` |

```bash
# Offline（完整错误矩阵）
node scripts/p969-cursor-compatibility-smoke.mjs

# Live
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p969-cursor-compatibility-smoke.mjs
```

---

## 八、检查明细（LIVE 主验收）

| 检查项 | 结果 | 说明 |
|---|---|---|
| static:image_model_not_for_chat isolation | PASS | |
| static:GET /v1/models excludes image-only | PASS | |
| static:error envelope codes | PASS | |
| static:chat SSE + idempotency | PASS | |
| static:Cursor experimental（非 fully compatible） | PASS | |
| static:sanitizePublicErrorMessage | PASS | |
| GET /v1/models list shape | PASS | |
| GET /v1/models Cursor models | PASS | |
| GET /v1/models hides image-only | PASS | |
| cursor:simple Q&A | PASS | charged |
| cursor:code explain | PASS | charged |
| cursor:code edit suggestion | PASS | charged |
| cursor:long prompt | PASS | charged |
| cursor:stream=true SSE | PASS | done=1 |
| error:unknown model | PASS | not_billable |
| error:image in chat | PASS | not_billable |
| error:insufficient_credits | SOFT | mock-only on LIVE |
| error:too_many_requests | SOFT | mock-only on LIVE |
| error:upstream_timeout | SOFT | mock-only on LIVE |
| error:upstream_error | SOFT | mock-only on LIVE |
| error:invalid_request_error | PASS | LIVE |
| cursor:idempotency no double charge | PASS | |

```
TOKFAI_P969_CURSOR_COMPATIBILITY_PARTIAL_PASS
```
