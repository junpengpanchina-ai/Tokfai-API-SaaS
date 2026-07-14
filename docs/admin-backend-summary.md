# Tokfai Admin 后台汇总（`/admin` + DMIT `/admin/*`）

> 基于当前代码。生产域名：前端 `tokfai.com/admin`，API `api.tokfai.com/admin/*`。
> 与 `docs/dmit-api-backend-summary.md` 配套；Admin **不**单独部署，写操作全部走 DMIT。

---

## 0. 公测状态（内部）

**DMIT 主链路公测可用。**

Tokfai 公测前核心链路验收通过。
OpenAI Compatible Chat、Responses 非流式、Responses 流式、Gemini native / Cherry Studio 路径均已跑通。
消费者侧文档与前端已完成上游信息脱敏，Admin 后台支持公测运营所需的用户查询、Key 管理、用量查看、积分调账与错误日志定位。

### Public Beta 上线前验收命令

本地 / 离线（不打生产、不消耗额度）：

```bash
node scripts/public-beta-ready-all.mjs
```

线上真实小额（需 `TOKFAI_API_KEY`）：

```bash
TOKFAI_API_KEY=sk-tokfai_xxx node scripts/public-beta-live-acceptance.mjs
# 默认：gpt-5.5 chat+responses+stream；gemini-2.5-flash 仅 responses non-stream
# 扩矩阵：TOKFAI_LIVE_FULL_MATRIX=1（上游 timeout/busy → DEGRADED，仍可 LIVE_READY）
```

线上图片（显式开启）：

```bash
TOKFAI_API_KEY=sk-tokfai_xxx TOKFAI_LIVE_IMAGE_SMOKE=1 node scripts/public-beta-live-image-smoke.mjs
```

线上真实轻压（显式开启）：

```bash
TOKFAI_API_KEY=sk-tokfai_xxx TOKFAI_LIVE_LOAD=1 \
  TOKFAI_LOAD_CONCURRENCY=10 TOKFAI_LOAD_DURATION_SEC=60 \
  node scripts/public-beta-live-load.mjs
```

一键离线 + 可选线上（有 Key 才跑 live；图片/轻压另开 flag）：

```bash
cd apps/dmit-api && npm run typecheck && npm run build
cd ../web && npm run typecheck && npm run build
cd ../..
node scripts/public-beta-ready-all.mjs
```

脚本不得打印完整 API Key、上游供应商、上游域名、上游 Key。

详见后端汇总 §0：`docs/dmit-api-backend-summary.md`。

---

## 1. 概览

Admin 是运营控制台：读全站用户/用量/订单，写模型、套餐、公告、API Key 撤销、人工调账等。架构是两层：

| 层 | 位置 | 职责 |
|---|---|---|
| **UI** | `apps/web` → `/admin/*` | 登录壳、导航、表单；只持 anon + 用户 JWT |
| **API** | `apps/dmit-api` → `/admin/*` | service_role 读写、审计、Stripe 套餐同步 |

前端从不写敏感表；所有 Admin 写操作经 `Authorization: Bearer <supabase_access_token>` 打到 DMIT。

| 项 | 内容 |
|---|---|
| UI | Next.js App Router（`apps/web/app/admin`） |
| API | Hono 路由 `src/routes/admin.ts`（挂载在 `/admin`） |
| 鉴权 | JWT + `admin_users`（可 fallback `TOKFAI_ADMIN_EMAILS`） |
| 审计 | `admin_audit_logs`（写路径） |
| 调账 | RPC `admin_adjust_credits` + ledger |

---

## 2. 目录结构

### 前端（`apps/web`）

```
apps/web/
├── app/admin/                 # 页面路由
│   ├── layout.tsx             # 登录 + email allowlist 门禁
│   ├── overview / users / api-keys / models / channels
│   ├── pricing / usage / credit-orders / logs / settings
│   ├── announcements / recharge-plans / credits / credits-adjust
│   └── page.tsx               # 重定向 overview
├── components/admin/          # 面板与表单
└── lib/
    ├── admin-auth.ts          # UI allowlist（NEXT_PUBLIC_ADMIN_EMAILS）
    ├── admin-nav.ts           # 导航项
    └── admin/
        ├── client.ts          # 浏览器 → DMIT /admin/*
        └── server.ts          # RSC fetch 封装
```

### 后端（`apps/dmit-api`）

```
apps/dmit-api/src/
├── middleware/requireAdminV1.ts   # JWT + admin 判定
├── lib/adminAuditLog.ts           # 写审计
├── catalog/seedModels.ts          # sync-catalog
└── routes/
    ├── admin.ts                   # 路由组装 + users/usage/credits 等
    ├── adminCreditsAdjust.ts
    ├── adminDashboardSummary.ts
    ├── adminApiKeys.ts
    ├── adminModels.ts / adminPricing.ts
    ├── adminChannels.ts / adminSettings.ts
    ├── adminAnnouncements.ts
    ├── adminRechargePlans.ts
    ├── adminCreditOrders.ts
    └── adminLogs.ts
```

---

## 3. 认证机制（双门）

### UI 门（`apps/web`）

1. 未登录 → `/login?redirect=/admin`
2. `isAdminEmail(user.email)`：`NEXT_PUBLIC_ADMIN_EMAILS` / `ADMIN_EMAILS` + 代码内默认邮箱
3. 非 allowlist → `/dashboard`
4. `AdminAuthGate` 再调 `GET /admin/me` 确认 `is_admin`

> UI allowlist **不是**安全边界，只挡壳；真正授权在 DMIT。

### API 门（DMIT `requireAdminV1`）

| 步骤 | 行为 |
|---|---|
| Bearer JWT | `supabaseAuth().auth.getUser(token)`（支持 ES256；非本地 HS256） |
| 缺/坏 token | `401` `{ error: { code, type: "auth_error" } }` |
| 查 `admin_users` | `status=active` 且 `revoked_at IS NULL` |
| 查表失败 | fallback：`TOKFAI_ADMIN_EMAILS`（`legacy_allowlist`） |
| 非 admin | `403` `admin_not_authorized` |

特殊：`GET /admin/me` 只需有效 JWT；非 admin 返回 `200` + `is_admin: false`。

---

## 4. 路由清单

### 4.1 Web 页面（`tokfai.com`）

| 路径 | 用途 |
|---|---|
| `/admin` → `/admin/overview` | 仪表盘摘要 |
| `/admin/users` | 用户列表 |
| `/admin/api-keys` | 全局 Key；revoke / restore |
| `/admin/models` | 模型 CRUD、archive、sync-catalog |
| `/admin/channels` | Upstream 渠道（进程内 overlay） |
| `/admin/pricing` | 模型定价 PATCH |
| `/admin/usage` | 用量日志 |
| `/admin/credit-orders` | Stripe 充值订单 |
| `/admin/logs` | 错误日志 |
| `/admin/settings` | 站点设置 overlay |
| `/admin/announcements` | 公告 CRUD + publish |
| `/admin/recharge-plans` | 充值套餐 CRUD / archive |
| `/admin/credits` | 按 email 查余额 + ledger |
| `/admin/credits-adjust` | 人工加减积分 |

### 4.2 DMIT Admin API（`api.tokfai.com`）

Auth：除 `/admin/me` 外均需 JWT + admin。

#### 身份 / 仪表盘

| Method | Path | 说明 |
|---|---|---|
| GET | `/admin/me` | 任意登录用户；`is_admin` |
| GET | `/admin/dashboard-summary` | 运营摘要（含 warnings） |
| GET | `/admin/summary` | 旧版 summary + 近期 usage |

#### 用户 / Key / 积分

| Method | Path | 说明 |
|---|---|---|
| GET | `/admin/users` | 全量 profiles（分页拼装） |
| GET | `/admin/api-keys` | 富化列表（无明文 secret） |
| POST | `/admin/api-keys/:id/revoke` | 软撤销 + audit |
| POST | `/admin/api-keys/:id/restore` | 恢复 + audit |
| GET | `/admin/credits?email=` | 余额 + ledger（`limit`≤100） |
| POST | `/admin/credits/adjust` | `admin_adjust_credits`；支持 Idempotency-Key |

#### 模型 / 定价 / 渠道 / 设置

| Method | Path | 说明 |
|---|---|---|
| GET/POST | `/admin/models` | 列表 / 创建 |
| PATCH/DELETE | `/admin/models/:id` | 更新 / archive |
| POST | `/admin/models/:id/restore` | 恢复 |
| POST | `/admin/models/sync-catalog` | 种子同步 |
| GET | `/admin/pricing` | 定价视图 |
| PATCH | `/admin/pricing/:modelId` | 定价字段 → models 写路径 |
| GET | `/admin/channels` | 渠道快照 |
| PATCH | `/admin/channels/:id` | **进程内 overlay**（重启丢失） |
| GET/PATCH | `/admin/settings` | allowlist：`site_name`、`default_signup_credits`、`registration_enabled`、`maintenance_mode`（**overlay**） |

#### 公告 / 套餐 / 订单 / 日志

| Method | Path | 说明 |
|---|---|---|
| GET/POST | `/admin/announcements` | 列表 / 创建 |
| PATCH | `/admin/announcements/:id` | 更新 |
| POST | `.../publish`、`.../unpublish` | `enabled` 开关 |
| GET/POST | `/admin/recharge-plans` | 列表 / 创建（可建 Stripe product/price） |
| PATCH/DELETE | `/admin/recharge-plans/:id` | 更新 / soft archive |
| POST | `.../duplicate`、`.../restore` | 复制 / 恢复 |
| GET | `/admin/credit-orders` | 充值订单列表 |
| GET | `/admin/usage` | 近期用量（含 email、key prefix） |
| GET | `/admin/logs` | 错误日志（`request_id`、`limit`） |

---

## 5. 核心业务逻辑

### 人工调账

1. UI：`POST /admin/credits/adjust`（body：`user_id`、`direction` add|deduct、`amount`、`reason`）
2. 可选 `Idempotency-Key`（8–128：`[A-Za-z0-9._:-]`）
3. DMIT 调 RPC `admin_adjust_credits` → 写 `credit_ledger` + 更新余额
4. 成功写 `admin_audit_logs`；幂等重放返回 `idempotent_replay`

### 充值套餐

- 创建时传 `amount_yuan`；服务端转 `amount_cents`，算 `credits = base + bonus`
- `enabled` 时可在 Stripe 建 product/price
- DELETE = soft archive（`archived_at`），非物理删

### 模型 / 定价

- 模型状态：`available` / `disabled` / `coming_soon` / `archived`
- PATCH 支持 `priority`（= `sort_order`）、`status` 别名
- Pricing PATCH 走同一 models 写路径 + audit

### Channels / Settings overlay

- **不落库**：进程内存；DMIT 重启后重置
- 响应中 `base_url` 脱敏为 `base_url_masked`
- 禁止回传 service role / Stripe / GRSAI / 完整 API key

### 审计

写操作经 `recordAdminAuditLog`：`actor_*`、`action`、`resource_*`、`request_payload` / `result_payload`、`idempotency_key`。插入失败只打日志，不阻断主流程成功响应（视具体 handler）。

---

## 6. 前端调用约定

```
Browser session (Supabase)
  → Authorization: Bearer <access_token>
  → NEXT_PUBLIC_DMIT_API_BASE + /admin/...
```

- 客户端：`lib/admin/client.ts`（`fetchAdminApi` / 各资源 helper）
- 服务端 RSC：`lib/admin/server.ts`（`fetchDmitAdmin`）
- 写操作可带 `Idempotency-Key`
- 错误：读 `error.message` / `error.code`（结构化）或兼容旧扁平 `error` 字符串

---

## 7. 环境变量（Admin 相关）

| 变量 | 所在 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_DMIT_API_BASE` | web | Admin API base |
| `NEXT_PUBLIC_ADMIN_EMAILS` / `ADMIN_EMAILS` | web | **仅 UI 壳** allowlist |
| `TOKFAI_ADMIN_EMAILS` | dmit-api | API 授权 fallback（`admin_users` 查失败时） |
| `SUPABASE_*` / service_role | dmit-api | Admin 读写 DB |
| `STRIPE_SECRET_KEY` | dmit-api | 套餐创建同步 Stripe |

前端 **禁止** 放入：`SUPABASE_SERVICE_ROLE_KEY`、`TOKEN_PEPPER`、`STRIPE_*`、`GRSAI_*` 等。

---

## 8. 数据库触点

**读：** `profiles`、`api_keys`、`usage_logs`、`credit_ledger`、`credit_orders`、`recharge_plans`、`models`、`announcements`、`admin_users`

**写（仅 DMIT）：** 同上写表 + `admin_audit_logs`；调账经 RPC。

| RPC | 用途 |
|---|---|
| `admin_adjust_credits` | 人工加减积分 |

Channels / settings 的 runtime overlay **无对应持久化表**（当前缺口）。

---

## 9. 安全与响应约定

- 从不返回 API key 明文 / encrypted secret
- 写失败优先结构化：`{ error: { message, code, type } }`
- `/admin/credits` 等旧读路径仍可能扁平 `{ error: "..." }`
- Auth 失败不带内部 debug 字段
- 日志字段白名单：`requestId`、`route`、`code`、`userId`、`email`

---

## 10. 成熟度与缺口

**公测运营能力：** 用户查询、Key 管理、用量查看、积分调账、错误日志定位 — **已定为公测可用**（见 §0）。

**已具备：** 双门鉴权、仪表盘、用户/用量/订单只读、模型与套餐/公告写、Key revoke、人工调账 + 幂等、写审计、Admin smoke/load scripts。

| 项 | 状态 |
|---|---|
| Channels / settings 持久化 | 进程内 overlay，重启丢失 |
| Admin users 管理 UI | 无；靠 DB `admin_users` + env |
| 审计日志只读 API / UI | 有写入，无完整 `GET /audit-logs` 运营页 |
| Usage 分页 / 导出 | 近期固定条数，非完整检索 |
| UI vs API allowlist 分离 | 两套邮箱列表需运维对齐 |
| Embeddings | 与网关相同，Admin 不涉及 |

相关文档：`docs/admin-v2-new-api-parity-plan.md`、`docs/admin-v2-acceptance-gates.md`、`docs/dmit-api-backend-summary.md`。
