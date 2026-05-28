# Tokfai MVP 封板验收记录（P5）

> **用途：** 记录 MVP 封板时已通过的生产主链、已知非阻塞项与上线前安全提醒。  
> **范围：** 只读文档；**不引入新功能、不改业务代码。**  
> **最后更新：** 2026-05-28（MVP P5 **最终生产验收完成**）

---

## 当前状态

| 项 | 状态 |
|----|------|
| MVP P5 最终生产验收 | ✅ **已完成**（2026-05-28） |
| 观察期 | ⏳ **48 小时内测观察期**（见 §7） |

---

## 状态说明

| 标记 | 含义 |
|------|------|
| ✅ 已通过 | 生产或等价生产环境已跑通，可作为 MVP 交付基线 |
| ⚠️ 已知非阻塞 | 不影响 MVP 主链；后续迭代处理 |
| 🔒 安全提醒 | 上线前必须遵守 |
| ⏳ 观察期 | 封板后短期监控；仅修阻塞 bug |

---

## 1. 已通过的生产主链

### 1.1 用户登录

| 项 | 状态 | 说明 |
|----|------|------|
| Supabase Auth 登录 | ✅ | 用户可通过 tokfai.com 登录（含 Google OAuth） |
| Dashboard 鉴权 | ✅ | 未登录访问 `/dashboard/*` 重定向至 `/login` |
| DMIT `/v1/me/*` | ✅ | 前端携带 Supabase `access_token`；DMIT 用 service role 校验用户身份 |

### 1.2 API Key：创建、使用、吊销

| 项 | 状态 | 说明 |
|----|------|------|
| 创建 | ✅ | `/dashboard/api-keys` → `POST /v1/me/api-keys` → 返回 `sk-tokfai_<48 hex>` |
| 一次性展示 | ✅ | 完整 key 仅在创建时展示一次；列表只显示 `prefix` |
| 复制 / Reveal | ✅ | 后续复制走 `POST /v1/me/api-keys/reveal`（owner only） |
| 使用 | ✅ | Playground / 外部客户端 Bearer `sk-tokfai_...` 调用受保护接口 |
| 吊销 | ✅ | `POST /v1/me/api-keys/revoke`；DB 写 `revoked_at` |
| 吊销后拦截 | ✅ | DMIT `verifyApiKeyToken` 拒绝 `revoked_at` 非空的 key |
| 存储 | ✅ | DB 存 `hash` + `encrypted_secret`；**不存明文 key** |

### 1.3 Chat Playground → 扣费主链

| 项 | 状态 | 说明 |
|----|------|------|
| Playground 调用 | ✅ | `/dashboard/playground` 用用户 API Key 调用 `POST /v1/chat/completions` |
| 模型 | ✅ | `gemini-3.1-pro` 已跑通（示例响应：`Hello from Tokfai`） |
| 鉴权 | ✅ | Bearer `sk-tokfai_...`；DMIT HMAC 查 `api_keys.hash` |
| `usage_logs` | ✅ | 成功请求写入 `status=succeeded`，含 `request_id`、tokens、`credits_charged` |
| `credit_ledger` | ✅ | 写入 `type=debit`，`reference_id=request_id`，`amount` 为负 |
| `profiles.credits_balance` | ✅ | 通过 RPC `record_usage_and_debit` 原子扣减 |
| 对账 | ✅ | 示例：`request_id=req_k1Mmw4aWcKuvjLBq` ↔ ledger `reference_id` 一致 |

**示例验收数据（2026-05-27）：**

| 字段 | 值 |
|------|-----|
| `request_id` | `req_k1Mmw4aWcKuvjLBq` |
| `model` | `gemini-3.1-pro` |
| `status` | `succeeded` |
| `total_tokens` | `226` |
| `credits_charged` | `≈ 0.000722` |
| ledger `type` | `debit` |
| ledger `amount` | `≈ -0.000722` |

### 1.4 用户 Dashboard 展示

| 项 | 状态 | 说明 |
|----|------|------|
| Usage 页 | ✅ | `/dashboard/usage` ← `GET /v1/me/usage`；展示 model、status、tokens、credits、时间、request_id |
| Credits 页 | ✅ | `/dashboard/credits` ← `GET /v1/me/credits` + `/v1/me/credits/ledger` |
| Ledger 展示 | ✅ | debit 行含 type、amount、balance_after、reason、reference_id、created_at |
| 刷新一致 | ✅ | 页面 `noStore` + DMIT fetch `cache: no-store`；硬刷新仍显示最新数据 |

### 1.5 Stripe 充值主链

| 项 | 状态 | 说明 |
|----|------|------|
| Checkout | ✅ | 用户经 `/dashboard/credits` 发起 Stripe Checkout |
| Webhook | ✅ | `POST /v1/webhooks/stripe` 处理 `checkout.session.completed` |
| 入账 | ✅ | `credit_orders.status=paid` + `credit_ledger` topup + `profiles.credits_balance` 增加 |
| 防重复入账 | ✅ | 以 `credit_ledger.reference_id = stripe_checkout:<session_id>` 幂等；重复 webhook 不双充 |

详细 SQL 验收见 [`docs/credit-topup-production-check.md`](./credit-topup-production-check.md)。

### 1.6 Admin（V1）

| 项 | 状态 | 说明 |
|----|------|------|
| Admin 鉴权 | ✅ | 前端 Supabase session → DMIT `/admin/*`；`admin_users` 校验 |
| Credits 调账 | ✅ | add / deduct；`insufficient_credits` 拦截；`profiles` / `credit_ledger` / `admin_audit_logs` 一致 |
| Models 管理 | ✅ | create / edit / archive / restore；软删除（`enabled` / `visible`）；审计写入 `admin_audit_logs` |
| 审计日志 | ✅ | Admin 写操作可追溯 actor、action、resource |

Admin Models 写操作审计：`action` 为 `models.create|update|archive|restore|delete_attempt`，`resource_type=models`。

---

## 2. 生产 API 可用性（最终验收 2026-05-28）

### 2.1 Health check

| 项 | 状态 | 说明 |
|----|------|------|
| `GET /health` | ✅ | `https://api.tokfai.com/health` |
| 响应 | ✅ | `ok=true`，`service=dmit-api`，`env=production` |

### 2.2 OpenAI-compatible models（公开）

| 项 | 状态 | 说明 |
|----|------|------|
| `GET /v1/models` | ✅ | `https://api.tokfai.com/v1/models` |
| Authorization | ✅ | **无需** Bearer / API Key |
| 响应格式 | ✅ | `object=list` |
| 模型数量 | ✅ | `data` 长度当前为 **15** |

### 2.3 受保护接口鉴权（仍生效）

| 端点 | 鉴权要求 | 状态 |
|------|----------|------|
| `POST /v1/chat/completions` | Bearer `sk-tokfai_...` API Key | ✅ |
| `/admin/*` | Supabase session + `admin_users` 权限 | ✅ |
| `POST /v1/webhooks/stripe` | `Stripe-Signature` header | ✅ |

---

## 3. 架构边界（封板基线）

```
apps/web (tokfai.com)     — anon key + 用户 session；只读 RLS 数据 + 调 DMIT 公开 API
apps/dmit-api (api.tokfai.com) — 全部 secrets；写 usage / ledger / keys / Stripe / Admin
supabase/migrations       — DB 结构 source of truth
```

**前端禁止持有：** `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`GRSAI_API_KEY`、`TOKEN_PEPPER`、`TOKFAI_KEY_ENCRYPTION_SECRET`。

详见仓库根目录 [`AGENTS.md`](../AGENTS.md)。

---

## 4. 已知非阻塞项（⚠️ MVP 不挡板）

| # | 项 | 说明 |
|---|-----|------|
| 1 | `GET /v1/webhooks/stripe` → 404 | **正常。** Stripe 只向 `POST /v1/webhooks/stripe` 投递；GET 无路由 |
| 2 | 日志中 `invalid_signature` | 多为 **curl 手动探测** 或错误签名测试；非生产 Stripe 投递故障 |
| 3 | Pro / Business 套餐 | 营销页仍为 **coming soon**；MVP 仅 Starter 充值路径 |
| 4 | `test-admin-model-001` | Admin 测试模型已 **archived**（`enabled=false`，`visible=false`）；不影响线上 chat 目录 |
| 5 | Playground 模型列表 | 前端写死部分 chat 模型选项；与 DB catalog 可能不完全同步 |
| 6 | 余额预检 | Chat 仅检查 `credits_balance > 0`，非精确预估；极小余额边缘 case 已知 |
| 7 | `production-checklist.md` 部分旧项 | 旧清单中 Stripe 等曾标「待完成」；**以本文档 P5 记录为准** |

---

## 5. 上线前安全提醒（🔒）

### 5.1 API Key

- **不要截图、录屏、粘贴完整 `sk-tokfai_...` key** 到工单、聊天、公开文档。
- 已在聊天 / 日志 / 截图中 **暴露过的 key 必须立即 revoke**，并新建 replacement key。
- 列表页、Usage、Playground UI 只展示 **prefix** 或截断 request_id；完整 secret 仅创建瞬间或 owner reveal。

### 5.2 Secrets 与部署

| Secret | 允许位置 | 禁止位置 |
|--------|----------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | DMIT env | apps/web、浏览器、Git |
| `STRIPE_SECRET_KEY` | DMIT env | apps/web |
| `STRIPE_WEBHOOK_SECRET` | **仅 DMIT env** | apps/web、Stripe Dashboard 以外泄露 |
| `GRSAI_API_KEY` | DMIT env | apps/web |
| `TOKEN_PEPPER` / `TOKFAI_KEY_ENCRYPTION_SECRET` | DMIT env | apps/web |

- Vercel（web）只配置 `NEXT_PUBLIC_*` 与 Supabase **anon** key。
- Stripe Webhook URL 指向 **`https://api.tokfai.com/v1/webhooks/stripe`**（POST）；secret 只在 DMIT 配置。

### 5.3 日志与响应

- DMIT / Admin **不得**在 HTTP 响应或日志中输出：完整 API key、JWT 原文、Stripe payload 全文、service role key。
- Admin 调试信息走结构化日志字段白名单（见 `apps/dmit-api/src/logger.ts`）。

### 5.4 Admin

- `admin_users` 仅 service role 可写；前端不得直连 `admin_audit_logs` / `admin_users` 表。
- 生产 Admin 操作保留审计：`admin_audit_logs` 可追溯 actor、action、resource。

---

## 6. 封板后回归 smoke（可选）

上线或发版后，用 **非生产 key / 小额度** 快速确认：

1. 登录 → Dashboard 可进  
2. 创建 API Key → Playground 跑一条 chat → 记 `request_id`  
3. Usage / Credits 页可见对应记录  
4. （可选）最小档 Stripe Checkout → webhook → balance 增加  
5. （可选）Admin 调账 ±小额度 → 三表一致  
6. `GET https://api.tokfai.com/health` → `ok=true`  
7. `GET https://api.tokfai.com/v1/models` → `object=list`，无需 Authorization  

---

## 7. 48 小时观察期（2026-05-28 起）

MVP P5 最终生产验收完成后，进入 **48 小时内测观察期**：

| 规则 | 说明 |
|------|------|
| 不开发新功能 | 观察期内冻结功能 scope |
| 只修阻塞 bug | 仅处理影响主链可用性的 P0 问题 |
| 冻结主链路改动 | **不再改** billing / usage / credits / Stripe 相关代码路径 |

观察期结束后，按产品排期进入下一迭代。

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](../AGENTS.md) | 三层架构与 secret 矩阵 |
| [`docs/credit-topup-production-check.md`](./credit-topup-production-check.md) | Stripe 充值 SQL 验收 |
| [`docs/production-checklist.md`](./production-checklist.md) | 早期生产清单（部分条目已被本文档 supersede） |

---

**MVP P5 最终结论（2026-05-28）：** 用户登录、API Key 创建/使用/吊销、Chat Playground 扣费、`usage_logs` / `credit_ledger` / `profiles.credits_balance` 对账、Usage / Credits Dashboard、Stripe Checkout 充值入账、Admin Models CRUD + archive/restore、Admin Credits 调账与审计日志均已通过生产验收；`GET /health` 与公开 `GET /v1/models` 已可用，受保护接口鉴权保持有效。**Tokfai MVP 可作为交付基线；当前处于 48 小时观察期，仅修阻塞 bug。**
