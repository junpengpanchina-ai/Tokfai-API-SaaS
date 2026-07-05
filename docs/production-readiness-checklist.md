# Tokfai Production Readiness Checklist

> 上线前与客户演示前的操作清单。只验收与运维，不引入新业务功能。  
> 自动化入口：`node scripts/smoke-prod.mjs`

---

## 当前 Demo Gate 状态

| 项 | 状态 |
|---|---|
| **Admin v1 Demo Gate** | **Passed** |
| Commit | `b7b4bc7` — `feat(admin): add Tokfai admin console shell and read-only management pages` |
| Gate 1 — typecheck / build | Passed |
| Gate 2 — `origin/main` + DMIT 部署 | Passed |
| DMIT restart logs | Clean（无 service role missing / supabase init failed / port in use） |
| Gate 6 — Chat API | Verified **200 OK** |
| Admin 权限门禁 | 未登录 → `/login`；普通用户 → `/dashboard`；Admin 正常 |
| Admin routes | 只读展示正常 |

---

## 客户演示前检查清单

在客户到场前 **30 分钟** 完成：

- [ ] 运行 `node scripts/smoke-prod.mjs`（建议带 `TOKFAI_TEST_API_KEY`）
- [ ] 确认 **PASS**，无 **FAIL**（Image 相关 **WARN** 可接受）
- [ ] DMIT：`pm2 status` 显示 `online`，最近 logs 无 crash
- [ ] 准备 1 个测试账号 + 1 个 active API Key（余额 > 0）
- [ ] 准备 Admin 账号（`admin_users` 或 allowlist 已同步）
- [ ] 浏览器无痕窗口预演：首页 → 登录 → Dashboard → Playground Chat
- [ ] 准备一条 one-line curl（Chat，非 Image）
- [ ] 确认演示网络可访问 `https://www.tokfai.com` 与 `https://api.tokfai.com`

---

## Production 前检查清单

- [ ] `origin/main` 与生产 DMIT / Vercel 部署 commit 一致
- [ ] `npm run typecheck` + `npm run build`（web + dmit-api）通过
- [ ] Supabase migrations 已在生产应用
- [ ] DMIT 环境变量完整（无 `service role missing`）
- [ ] Stripe webhook / Checkout（若演示支付）已在 staging 单独验收
- [ ] CORS：`OPTIONS /v1/images/generations` 对 `https://www.tokfai.com` 返回 204 + ACAO
- [ ] 运行 smoke：`node scripts/smoke-prod.mjs`
- [ ] Admin 权限：非 admin 不可见后台数据
- [ ] 无 `.env` / API Key / service role 提交到 git

### 自动化 smoke 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `TOKFAI_WEB_BASE` | `https://www.tokfai.com` | 前端 |
| `TOKFAI_API_BASE` | `https://api.tokfai.com` | API 根（脚本自动补 `/v1`） |
| `TOKFAI_TEST_API_KEY` | — | 未设置则 Chat/Image 为 **SKIP** |
| `TOKFAI_SMOKE_IMAGE` | `false` | `true` 时 Image 失败视为 **FAIL** |

```bash
TOKFAI_TEST_API_KEY=sk-tokfai_... node scripts/smoke-prod.mjs
```

---

## 500 用户容量要求

当前阶段 **目标：可演示、可小规模试用**，非正式 500 并发 SLA。

| 项 | 要求 |
|---|---|
| Chat API P95 | 上游正常时 < 60s（非 stream 短 prompt） |
| 错误率 | 非 Image 路径 < 5%（24h 观察） |
| DMIT 单实例 | 1 进程 online，restart 无泄漏 |
| 数据库 | Supabase 连接稳定，usage_logs 写入正常 |
| 限流 | 超限返回 429，不 500 |

**500 用户前需补：** 负载测试报告、Redis/多实例网关（见 `docs/p759-load-test-and-capacity-gate.md`）、告警与 on-call。

---

## 2000 用户容量要求

**未验收。** 2000 活跃用户需要：

- 水平扩展 DMIT（多实例 + 负载均衡）
- 分布式 rate limit / queue（Redis gateway）
- 上游多 channel 与 failover
- 用量与账本对账自动化
- 监控：latency、error rate、credits、upstream health

---

## 当前已通过项

- Admin v1 shell + 12 条只读 admin 路由
- Chat API 生产 200 OK（Gate 6）
- API Key 签发 / revoke（用户侧 dashboard）
- Dashboard SSR fail-open（用户侧）
- Admin 三层权限门禁（layout + DMIT `requireAdminV1`）
- CORS preflight（smoke 可验证）
- DMIT Supabase realtime ws transport（Node 20）
- 公开页：/ /login /pricing /docs 可访问

---

## 当前风险项

| 风险 | 级别 | 说明 |
|---|---|---|
| **Image generation Beta** | 高（演示） | GRSAI 上游 `upstream_invalid_response` / `upstream_timeout` |
| Stripe 生产支付 | 中 | 未作为 Demo Gate 必项 |
| Web allowlist vs `admin_users` 漂移 | 低 | 配置不一致时可能看到 admin shell + forbidden |
| 单实例 DMIT | 中 | 无自动 failover |
| 500+ 并发 | 中 | 未做正式容量 sign-off |

### Image generation 已知问题

- `upstream_invalid_response` — 上游 body 非预期格式
- `upstream_timeout` — 上游超时

**客户演示应优先 Chat + Admin 只读路径，Image 不作为主路径。**

---

## 不建议现场演示的功能

- Image generation（Beta，上游不稳定）
- 真实 Stripe 支付扣款
- Admin 危险写操作（revoke key、credits adjust、channel switch — v1 仍为占位）
- 高并发 live load test
- 未在 smoke 中验证的新模型

---

## 演示推荐路径

1. **Homepage** — `https://www.tokfai.com`
2. **Login** — 邮箱 / Google
3. **Dashboard** — Overview 余额与用量摘要
4. **API Keys** — 创建或展示已有 Key
5. **Chat API curl** — one-line `POST /v1/chat/completions`
6. **Usage logs** — 展示 `request_id`、credits_charged
7. **Admin overview** — 今日请求 / 错误率 / Top models（只读）
8. **Admin users / api-keys / models / logs** — 只读表格

可选（非主路径）：Pricing 页、Docs 快速接入、Credits 余额说明。

---

## 回滚方案

### 前端（Vercel / tokfai.com）

1. Vercel Dashboard → Deployments → 选择上一稳定 deployment → **Promote to Production**
2. 或 `git revert` 问题 commit → push `main` → 等待自动部署
3. 验证：`node scripts/smoke-prod.mjs`

### 后端（DMIT / api.tokfai.com）

1. SSH 到 DMIT：`cd` 到部署目录
2. `git fetch && git checkout <previous-stable-sha>`
3. `npm run build`（在 `apps/dmit-api`）
4. `pm2 restart <app-name>`
5. 检查 logs：`pm2 logs --lines 50` — 无 crash、有 `admin_authorized`（admin 探测时）
6. 验证：`curl -sS https://api.tokfai.com/v1/health`

### 数据库

- Supabase migration **尽量避免生产 down migration**
- 若仅应用层回滚，DB 向前兼容 schema 通常可保留

---

## 事故定位路径

1. **用户报告 5xx**  
   - 查 DMIT `pm2 logs` → 搜 `requestId`  
   - Dashboard **Usage** → 按 `request_id` 搜索  
   - Admin **Error logs** → 按 `request_id` 过滤

2. **Chat 失败**  
   - smoke：`TOKFAI_TEST_API_KEY=... node scripts/smoke-prod.mjs`  
   - DMIT log：`upstream_error` / debit 相关 code  
   - 验证 Key 未 revoke、credits > 0

3. **Image 失败（预期内 Beta）**  
   - 查 `grsai_image_upstream_diagnostic`（DMIT logs，无 API key）  
   - 错误码：`upstream_invalid_response` / `upstream_timeout`  
   - **不向客户承诺 SLA**

4. **Admin 403**  
   - 确认 JWT 有效  
   - `public.admin_users` 或 `TOKFAI_ADMIN_EMAILS`  
   - DMIT log：`admin_denied` vs `admin_authorized`

5. **CORS 浏览器失败**  
   - `OPTIONS` preflight smoke 项 E  
   - Nginx / DMIT CORS 配置（本清单不修改 Nginx）

6. **Credits 不一致**  
   - User Dashboard Credits ledger  
   - Admin credits ledger（只读）  
   - Supabase `credit_ledger` + `usage_logs`

---

## 相关文档

- `docs/p755-production-smoke-test-checklist.md` — 手工浏览器验收
- `docs/p770-production-demo-flow.md` — 演示流程
- `docs/production-checklist.md` — 历史生产项状态
- `scripts/smoke-prod.mjs` — 本清单对应的自动化 smoke
