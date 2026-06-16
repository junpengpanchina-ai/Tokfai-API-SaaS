# P781 — Real client connector acceptance

> **Internal project record** — customer path: API Key + Base URL + SDK / Cursor / Cherry.

---

## OpenAI SDK 接入验收表

| # | 项 | 结果 |
|---|-----|------|
| 1 | Node.js SDK 示例 | **PASS** |
| 2 | Python SDK 示例 | **PASS** |
| 3 | Node fetch 示例 | **PASS** (P781) |
| 4 | Chat completion | **PASS** |
| 5 | request_id / credits_charged / tokfai.resolved_model | **PASS** |
| 6 | Usage / Credits 对账路径 | **PASS** |
| 7 | invalid_token / insufficient_credits / model_not_available / upstream_timeout | **PASS** |
| 8 | OpenAI-compatible + Tokfai 字段说明 | **PASS** (P781) |
| 9 | session key 注入 | **PASS** |

---

## Cursor 接入验收表

| # | 项 | 结果 |
|---|-----|------|
| 1 | Provider type OpenAI-compatible | **PASS** |
| 2 | Base URL / API Key / Model 配置表 | **PASS** |
| 3 | auto-fast + auto-pro / auto-cheap 说明 | **PASS** (P781) |
| 4 | Copy Cursor config | **PASS** |
| 5 | Copy one-line Chat curl | **PASS** |
| 6 | curl 优先排查说明 | **PASS** (P781) |
| 7 | request_id → Usage / Credits | **PASS** |

---

## Cherry Studio 接入验收表

| # | 项 | 结果 |
|---|-----|------|
| 1 | Provider name / type / Base URL / Key / Model | **PASS** |
| 2 | Stream 关闭提示 | **PASS** (P781) |
| 3 | Say ok only 测试 | **PASS** |
| 4 | Copy Cherry config + one-line curl | **PASS** |
| 5 | 故障排查四项 | **PASS** (P781) |
| 6 | request_id → Usage / Credits | **PASS** |

---

## API Keys 成功卡

| 复制项 | 结果 |
|--------|------|
| Full key / Auth / Chat curl / Models curl / Batch curl | **PASS** |
| SDK / Cursor / Cherry config | **PASS** |
| Quick Start / SDK / Cursor / Cherry / Chat / Usage / Credits 链接 | **PASS** (P781) |

---

## 未触碰

billing、Stripe、Supabase、`record_usage_and_debit`、DMIT backend、扣费逻辑。
