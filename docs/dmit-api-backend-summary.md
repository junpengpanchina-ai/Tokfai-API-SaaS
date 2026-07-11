# Tokfai 后端开发汇总（`apps/dmit-api`）

> 基于当前代码与 `supabase/migrations`。生产域名：`api.tokfai.com`。

---

## 1. 概览

**DMIT** 是 Tokfai 的唯一后端：OpenAI 兼容网关、Dashboard 写操作、Stripe 入账、Admin API。前端只持 anon key；所有 secrets 与敏感表写入都在这里。

| 项 | 内容 |
|---|---|
| 语言 / 运行时 | TypeScript (ESM)，Node ≥ 20 |
| 框架 | Hono + `@hono/node-server` |
| DB | Supabase service_role（`@supabase/supabase-js`） |
| 支付 | Stripe SDK |
| 缓存/限流 | Redis 可选；默认进程内 |
| 部署 | **生产：PM2 `tokfai-api` only**（见 `deploy/runtime/`）；本地可用 `node` |
| 本地默认 | `http://127.0.0.1:8787` |
| 生产绑定 | `127.0.0.1:8788`（Nginx → 8788；勿裸跑 node） |

入口：`src/index.ts`（启动）、`src/app.ts`（路由组装）。

---

## 2. 目录结构

```
apps/dmit-api/src/
├── index.ts / app.ts / env.ts / errors.ts / logger.ts
├── supabase.ts / stripe.ts / types.ts
├── auth/          # JWT、API Key、HMAC、AES
├── middleware/    # CORS、requestId、鉴权、限流
├── routes/        # HTTP 处理器
├── lib/           # chat 执行、计费、幂等
├── upstream/      # GRSAI / 多 provider、熔断
├── catalog/       # 模型目录与定价
├── gateway/       # 限流、并发
├── batch/         # 批量 chat worker
└── redis/         # 可选 Redis
```

---

## 3. 认证机制

| 方式 | 说明 | 典型用途 |
|---|---|---|
| Supabase JWT | `getUser(token)` 验签 | `/v1/me/*`、keys、checkout、部分 catalog |
| API Key `sk-tokfai_...` | HMAC-SHA256(`TOKEN_PEPPER`) 查 `api_keys` | `/v1/batches/*` |
| API Key **或** JWT | `requireApiKeyOrSupabaseJwt` | chat / responses / images |
| Stripe-Signature | webhook 验签 | `/v1/webhooks/stripe` |
| Admin | JWT + `admin_users`（可 fallback `TOKFAI_ADMIN_EMAILS`） | `/admin/*`（除 `/admin/me`） |
| 无认证 | — | health、models、公开 plans/公告 |

---

## 4. 路由清单

### Health / Debug

- `GET /health`、`/v1/status`、`/v1/health`
- `GET /debug/routes`、`/__version`、`/v1/debug/routes`

### Models & Catalog

- `GET /v1/models`（公开）
- `GET /v1/catalog/model-pricing`（JWT）

### AI 网关（OpenAI 兼容）

| Method | Path | Auth |
|---|---|---|
| POST | `/v1/chat/completions` | API Key 或 JWT |
| POST | `/v1/responses` | 同上 |
| POST | `/v1/images/generations` | 同上 |
| POST | `/v1/batches/chat` | API Key |
| GET | `/v1/batches/:id`、`.../items` | API Key |
| POST | `/v1/batches/:id/cancel` | API Key |

未实现：`POST /v1/embeddings`。`stream: true` 明确拒绝。

### API Keys

- Legacy：`/v1/keys`（list / create / reveal / revoke）
- Dashboard：`/v1/me/api-keys`（同上，路径略有差异）

### Dashboard（JWT）

- `GET /v1/me/credits`、`.../ledger`、`.../orders`
- `GET /v1/me/usage`、`.../summary`

### Billing

- `GET /v1/billing/plans`（公开）
- `POST /v1/billing/checkout`（JWT；legacy：`POST /billing/create-checkout-session`）
- 无 Stripe Customer Portal

### Webhooks

- `POST /v1/webhooks/stripe`（及 legacy `/stripe/webhook`）
- 仅处理 `checkout.session.completed` → `complete_credit_order`

### Announcements（公开）

- `GET /v1/announcements`、`GET /v1/announcements/:slug`

### Admin（JWT + admin）

- 仪表盘、用户、API Keys revoke/restore
- channels / pricing / settings overlay
- announcements CRUD + publish
- credit-orders、recharge-plans、models（含 sync-catalog）
- usage、logs
- `GET /admin/credits?email=`、`POST /admin/credits/adjust`
- `GET /admin/me`：任意登录用户，返回 `is_admin`

---

## 5. 核心业务逻辑

### 积分扣费

1. 请求前 `assertHasCredits`
2. 上游成功后按定价算 credits
3. Chat：`record_usage_and_debit`（usage + ledger 原子；支持 `Idempotency-Key`）
4. Image：`debit_credits` + insert usage
5. 失败：写 `usage_logs`（`billable=false`）
6. Admin：`admin_adjust_credits` + audit log

### Upstream

- 主：GRSAI；可选 secondary OpenAI-compatible
- 模型别名、provider 顺序、熔断、全局 upstream 并发上限

### Stripe

- 客户端只传 `plan_id` → `credit_orders` → Checkout Session
- Webhook 幂等入账

### API Key

- 创建返回一次明文；存 hash + 可选 AES 加密 secret（reveal）
- 软撤销 `revoked_at`

### Batch

- 同进程 worker；Redis 可选做 lock

---

## 6. 外部集成

| 集成 | 用途 |
|---|---|
| Supabase | Auth + Postgres（service_role） |
| GRSAI | Chat / Image upstream |
| Secondary OpenAI-compatible | 特定模型 fallback |
| Stripe | Checkout + Webhook |
| Redis（可选） | 限流、并发、熔断、batch lock |

---

## 7. 环境变量（摘要）

**必填（Zod）：** `SUPABASE_URL`、`SUPABASE_JWT_SECRET`、`TOKEN_PEPPER`、`GRSAI_API_KEY`、`STRIPE_WEBHOOK_SECRET`

**运行必需：** `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`TOKFAI_KEY_ENCRYPTION_SECRET`

**常用可选：** `PORT`、CORS、GRSAI paths/timeouts、限流/并发、`TOKFAI_BATCH_*`、`TOKFAI_REDIS_*`、`TOKFAI_ADMIN_EMAILS`、`BILLING_ALLOWED_REDIRECT_ORIGINS` 等

> 注意：`SUPABASE_JWT_SECRET` 当前必填，但验签走 `getUser`，未本地 HS256。

---

## 8. 数据库触点

**表：** `profiles`、`api_keys`、`usage_logs`、`credit_ledger`、`credit_orders`、`recharge_plans`、`models`、`model_pricing`、`announcements`、`admin_users`、`admin_audit_logs`、`chat_batches`、`chat_batch_items`

**DMIT 调用的 RPC：**

| RPC | 用途 |
|---|---|
| `record_usage_and_debit` | Chat 计费 |
| `lookup_usage_idempotency` | 幂等查重 |
| `debit_credits` | Image 扣费 |
| `complete_credit_order` | Stripe 入账 |
| `admin_adjust_credits` | 人工调账 |

`credit_purchase` 在 DB 中存在，runtime 已由 `complete_credit_order` 取代。

---

## 9. 中间件 / 共享库

- Request ID、CORS、OpenAI 风格错误 envelope
- Chat gateway：RPM、per-key 并发、body size
- `executeChatCompletion`、idempotency、model catalog、admin audit、key encryption、Responses↔Chat 转换

---

## 10. 成熟度与缺口

**已具备生产级 MVP：** chat/responses/images/models/batch、积分幂等计费、Stripe 闭环、Dashboard + Admin、Docker/PM2。

**已知缺口：**

| 项 | 状态 |
|---|---|
| Embeddings | 未实现 |
| Streaming | 拒绝 |
| Stripe Portal | 无 |
| Admin channels/settings | 进程内 overlay，重启丢失 |
| Redis 默认关 | 多实例限流不共享 |
| Batch worker | 同进程，非独立队列 |
| README | 仍标部分 stub，与代码不符 |
