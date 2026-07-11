# Tokfai 前端消费者汇总（`apps/web`）

> 基于当前代码。生产域名：`tokfai.com`；后端：`api.tokfai.com`（DMIT）。
> 与 `docs/dmit-api-backend-summary.md`、`docs/admin-backend-summary.md` 配套。
> 本文只覆盖 **营销站 + Auth + 消费者 Dashboard**；Admin UI 见 Admin 文档。

---

## 1. 概览

`apps/web` 是 Vercel 前端：营销页、Supabase Auth、消费者控制台。只持 `NEXT_PUBLIC_*` + anon key；所有 secrets、计费写入、Key 哈希、上游 LLM 调用都在 DMIT。

| 项 | 内容 |
|---|---|
| 包名 | `@tokfai/web` |
| 框架 | Next.js 14.2（App Router）+ React 18 |
| Auth / DB | `@supabase/ssr` + `@supabase/supabase-js`（anon） |
| UI | Tailwind 3.4 + shadcn/ui（Radix） |
| i18n | 自研 EN/ZH（`lib/i18n/`） |
| 部署 | Vercel，根目录 `apps/web` |

入口：`app/layout.tsx` → `I18nProvider` + `AuthProviderWrapper`。

数据路径两条线：

| 路径 | 用途 |
|---|---|
| Supabase anon + 用户 session（RLS） | 读自己的 `profiles` / `credit_ledger` / `credit_orders` / `usage_logs` / `api_keys` 元数据 |
| `fetch` → DMIT `/v1/*` | Key 签发/撤销、Checkout、模型定价、公告、Playground 调网关 |

浏览器直连 `api.tokfai.com`，**无** Next.js API 代理 DMIT。

---

## 2. 目录结构

```
apps/web/
├── app/
│   ├── page.tsx / pricing / docs / privacy / terms   # 营销
│   ├── login / signup                                 # Auth UI
│   ├── auth/callback · auth/sign-out                  # OAuth / 登出 Route Handlers
│   ├── dashboard/                                     # 消费者控制台
│   └── admin/                                         # Admin（另文）
├── components/          # UI、Dashboard shell、营销块
├── lib/
│   ├── supabase/        # browser / server / middleware 客户端
│   ├── dmit/            # 浏览器 + RSC → DMIT /v1/*
│   ├── dashboard-safe/  # Dashboard 客户端模块（避免共享 chunk 绑 Supabase）
│   ├── auth/            # AuthProvider、redirect、错误映射
│   ├── billing/         # 套餐展示 / fallback
│   ├── i18n/            # 文案
│   ├── storage/         # Playground 图片上传
│   └── customer-*       # 集成文档 / 代码片段（纯文案）
├── middleware.ts
└── scripts/             # dashboard import 边界检查等
```

Dashboard 采用 **fail-open SSR**：Supabase env 缺失或鉴权失败时渲染空壳/fallback，不整页崩溃（`lib/dashboard-safe/server-session.ts`）。

---

## 3. 认证机制

### Supabase 客户端（全部 anon）

| 客户端 | 文件 | 场景 |
|---|---|---|
| Browser | `lib/supabase/client.ts` | Client Components、表单、取 access token |
| RSC | `lib/supabase/server.ts` | Server Components；`tryCreateServerClient()` fail-open |
| Route Handler | 同上 `createRouteHandlerClient()` | `/auth/callback`、`/auth/sign-out` |
| Middleware | `lib/supabase/middleware.ts` | Cookie session 刷新 |

### 登录流

| 方式 | 行为 |
|---|---|
| 邮箱密码 | `signInWithPassword` → 客户端跳转 |
| 注册 | `signUp`；`emailRedirectTo` → `/auth/callback?next=…` |
| Google OAuth | `signInWithOAuth({ provider: "google" })` → `/auth/callback` |
| Callback | `exchangeCodeForSession` → 安全 `next`（默认 `/dashboard`） |
| 登出 | 客户端 `signOut` 或 `POST /auth/sign-out` |

Auth 上下文：`lib/auth/auth-provider.tsx`（`onAuthStateChange`）。

> 未实现：密码重置（`resetPasswordForEmail`）。

### 路由门禁

| 层 | 行为 |
|---|---|
| Middleware | 未登录访问 `/dashboard/*` → `/login?next=…`；已登录访问 login/signup → 回跳 |
| 页面级 | `loadDashboardPageSession()`；无用户再 `redirect` |
| Admin | 邮箱 allowlist + `GET /admin/me`（见 Admin 文档） |

公开营销页、`/auth/*` 不强制登录。

---

## 4. 页面路由清单

### 营销 / 公开

| 路径 | 用途 |
|---|---|
| `/` | Landing |
| `/pricing` | 套餐：`GET /v1/billing/plans`；购买走 Checkout |
| `/docs` | 公开 API 文档 |
| `/privacy` · `/terms` | 法务 |
| `/image-playground` | 重定向 → `/dashboard/image-playground` |

### Auth

| 路径 | 用途 |
|---|---|
| `/login` · `/signup` | 邮箱 + Google |
| `GET /auth/callback` | OAuth / 邮件确认换 session |
| `POST /auth/sign-out` | 登出 |

### Dashboard（需登录）

导航三段（`lib/dashboard-nav.ts`）：Workspace / Metering / Service。

| 路径 | 数据来源 | 说明 |
|---|---|---|
| `/dashboard` | Supabase 聚合 + DMIT 公告 | Overview / onboarding |
| `/dashboard/api-keys` | DMIT `/v1/me/api-keys` | 创建 / revoke / reveal |
| `/dashboard/integration-workbench` | 文案 | 集成工作台 |
| `/dashboard/troubleshooting` | 文案 | 排障 |
| `/dashboard/starter-templates` | 文案 | 模板 |
| `/dashboard/payload-builder` | 文案 | 请求体构造器 |
| `/dashboard/playground` | DMIT keys + `POST /v1/chat/completions`（API Key） | Chat 试玩 |
| `/dashboard/image-playground` | 同上 + `POST /v1/images/generations` + Storage | 图像试玩 |
| `/dashboard/models` | DMIT `GET /v1/catalog/model-pricing`（JWT） | 模型与定价 |
| `/dashboard/usage` | Supabase `usage_logs` | 用量 |
| `/dashboard/credits` | Supabase profiles / ledger / orders | 余额与流水 |
| `/dashboard/docs` | 文案 | 站内文档 |
| `/dashboard/announcements` · `[slug]` | DMIT 公开公告 | 公告列表 / 详情 |

---

## 5. 调用的 DMIT 端点（消费者）

Base：`NEXT_PUBLIC_DMIT_API_BASE` → `lib/tokfai-api.ts` / `lib/dmit/{client,server}.ts`。

| Auth | Header |
|---|---|
| Dashboard 用户操作 | `Authorization: Bearer <supabase_access_token>` |
| Playground / 网关试调用 | `Authorization: Bearer sk-tokfai_...` |
| 公开 | 无 |

### 实际接线

| Method | Path | Auth | 调用方 |
|---|---|---|---|
| GET | `/v1/billing/plans` | 公开 | pricing / billing helpers |
| POST | `/v1/billing/checkout` | JWT | `pricing-buy-button` |
| GET | `/v1/catalog/model-pricing` | JWT | models 页 |
| GET/POST | `/v1/me/api-keys` | JWT | api-keys SSR + client |
| POST | `/v1/me/api-keys/revoke` · `/reveal` | JWT | api-keys / playground |
| POST | `/v1/chat/completions` | API Key | `dashboard-safe/chat-api.ts` |
| POST | `/v1/images/generations` | API Key | `dashboard-safe/image-api.ts` |
| GET | `/v1/announcements` · `/:slug` | 公开 | overview / announcements |

### 已封装、页面未挂

| Helper | Path | 说明 |
|---|---|---|
| `fetchMyUsageSummary` | `GET /v1/me/usage/summary` | `usage-query-section` 存在但未挂页 |
| `listMyUsage` / credits ledger·orders | `/v1/me/usage` · `/v1/me/credits*` | server helper 已有；Credits/Usage 页走 Supabase 直读 |
| `listModels` | `GET /v1/models` | 导出未用 |
| JWT playground chat | — | **Removed** unused helper; Playground live path uses API Key only |

文档/snippet 中出现的 `/v1/responses`、`/v1/batches/*` 等为文案示例，非本仓 live fetch。

---

## 6. Supabase 直读（anon + RLS）

**无** `.rpc()`；**不写**敏感表（写入全在 DMIT）。

| 表 | 用途 | 主要 loader |
|---|---|---|
| `profiles` | 余额等 | `lib/credits.ts`、`dashboard-overview`、shell credits |
| `credit_ledger` | 流水 / 聚合 | `lib/credits.ts`、overview |
| `credit_orders` | 充值订单历史 | `lib/credits.ts` |
| `usage_logs` | 24h/7d 统计 + 近期行 | `lib/usage-page.ts`、overview |
| `api_keys` | 活跃 Key **计数**（元数据） | overview |

### Storage

| Bucket | 操作 |
|---|---|
| `playground-inputs` | 上传 + public URL（`lib/storage/upload-image.ts`；Server Action `uploadPlaygroundImageAction`） |

路径：`{user_id}/{uuid}.{ext}`。需已登录。

---

## 7. 核心业务流

### API Keys

1. SSR：`GET /v1/me/api-keys`
2. 客户端：`lib/dashboard-safe/api-keys-client.ts` — create / revoke / reveal（显式传 JWT）
3. 创建只展示一次明文；reveal 需用户主动操作
4. Playground 可用 session helper 交接测试 Key（`api-key-session.ts`）

### Playground（Chat / Image）

1. SSR 拉活跃 keys
2. 用用户自己的 `sk-tokfai_...` 调网关（与外部 SDK 同路径）
3. 可自动 create/reveal 测试 Key
4. Image：参考图走 Supabase Storage，再 `POST /v1/images/generations`

### Credits / Billing

1. `/pricing`：`GET /v1/billing/plans`（缺省有静态 fallback）
2. 登录用户 Buy → `POST /v1/billing/checkout` → Stripe URL
3. 回跳 `/dashboard/credits?success=true&session_id=…`
4. Credits 页：Supabase 读余额 / ledger / orders；**无** Stripe Portal

### Usage

- 主路径：RLS 读 `usage_logs`（近 50 条 + 时段统计）
- DMIT usage summary 组件已写但未挂载

---

## 8. 前端调用约定

```
Browser Supabase session
  → access_token
  → Authorization: Bearer <token>
  → NEXT_PUBLIC_DMIT_API_BASE + /v1/...

Playground / 外部同构调用
  → Authorization: Bearer sk-tokfai_...
```

| 模块 | 文件 | Token |
|---|---|---|
| 浏览器 DMIT | `lib/dmit/client.ts` | session 自动或显式 |
| RSC DMIT | `lib/dmit/server.ts` | 显式 `accessToken` |
| Dashboard 客户端 | `lib/dashboard-safe/dmit-fetch.ts` | **仅显式 token**（防绑 Supabase） |

错误：读结构化 `error.message` / `error.code`，兼容旧扁平字符串。

---

## 9. 中间件

`middleware.ts` → `lib/supabase/middleware.ts`（`updateSession`）。

Matcher：排除 `_next/static`、`_next/image`、favicon、静态图。

行为摘要：

1. 无 Supabase env → 放行
2. `getUser()` 刷新 cookie
3. `/auth/*` 不做登录跳转逻辑
4. 护 `/dashboard/*`；login/signup 已登录则回跳
5. 设置 `x-pathname`

`/admin/*` **不**由 middleware 护（Admin layout 自管）。

---

## 10. 环境变量

| 变量 | 必填 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Anon |
| `NEXT_PUBLIC_DMIT_API_BASE` | ✅ | DMIT origin |
| `NEXT_PUBLIC_SITE_URL` | 推荐 | OAuth `redirectTo` 规范源 |
| `NEXT_PUBLIC_API_BASE_URL` | 可选别名 | 同 DMIT base |
| `NEXT_PUBLIC_ADMIN_EMAILS` / `ADMIN_EMAILS` | 可选 | **仅 Admin 壳** allowlist |

**禁止写入本应用：** `SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_JWT_SECRET`、`TOKEN_PEPPER`、`TOKFAI_KEY_ENCRYPTION_SECRET`、`GRSAI_*`、`STRIPE_*`。

---

## 11. 边界规则（代码强制）

| 允许 | 禁止 |
|---|---|
| Supabase Auth（anon） | Stripe webhook |
| RLS 读自己的行 | Key 哈希 / 验签 |
| `fetch` DMIT `/v1/*` | Next.js 代理 `/v1/chat|models|embeddings` |
| Storage 上传（Playground） | 写 `credit_ledger` / `usage_logs` / 签发 Key 的本地实现 |
| | 任何 service_role / GRSAI / Stripe secret |

唯一 Server Action：`uploadPlaygroundImageAction` — 仅 Storage，不碰 DMIT secrets。

CI：`npm run check:dashboard-imports` 检查 dashboard-safe 导入边界。

---

## 12. 成熟度与缺口

**已具备：** 营销 + Auth（邮箱/Google）、Dashboard（Keys / Playground / Image / Models / Usage / Credits）、Stripe Checkout 闭环、i18n EN/ZH、fail-open SSR、集成文案工具链。

| 项 | 状态 |
|---|---|
| 密码重置 | 未实现 |
| Stripe Customer Portal | 无（后端也无） |
| Usage 高级筛选 | DMIT summary 组件未挂页 |
| Credits/Usage 双路径 | 页走 Supabase；DMIT `/v1/me/*` helper 闲置 |
| Embeddings / Streaming | 后端未提供；前端不调 |
| Batch / Responses | 仅文档 snippet |

相关文档：`docs/dmit-api-backend-summary.md`、`docs/admin-backend-summary.md`、`docs/dmit-frontend-consumer-summary.md`、`AGENTS.md`。
