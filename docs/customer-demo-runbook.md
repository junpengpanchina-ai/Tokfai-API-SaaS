# Tokfai Customer Demo Runbook

> 客户现场演示操作手册。只读验收与讲解路径，**不新增功能、不改业务代码**。  
> 配套文档：[Production Readiness Checklist](./production-readiness-checklist.md) · 自动化 smoke：`node scripts/smoke-prod.mjs`

---

## 1. 演示前 10 分钟检查清单

在客户入场前 **10 分钟** 逐项打勾：

- [ ] **运行 smoke**
  ```bash
  TOKFAI_TEST_API_KEY=sk-tokfai_xxx node scripts/smoke-prod.mjs
  ```
  确认 summary 无 **FAIL**（Image 相关 **WARN** 可接受；未设 key 时 Chat/Image 为 **SKIP**，需人工补验 Chat）。

- [ ] **公开页可打开**（无痕窗口）
  - [ ] `https://www.tokfai.com` — 首页无 500 / 白屏
  - [ ] `https://www.tokfai.com/login` — 登录页正常
  - [ ] `https://www.tokfai.com/dashboard` — 未登录应跳转 login（非 500）

- [ ] **Chat API 200**
  - smoke 项 F 为 PASS，或手动 curl（见 §5）返回 HTTP 200 + `request_id`

- [ ] **Admin 只读页可打开**（Admin 账号，无痕第二窗口或另一浏览器）
  - [ ] `/admin/overview`
  - [ ] `/admin/users`
  - [ ] `/admin/api-keys`
  - [ ] `/admin/models`
  - [ ] `/admin/logs`

- [ ] **演示数据脱敏**
  - [ ] 屏幕共享前确认：无真实用户邮箱全量展示（打码 `u***@example.com`）
  - [ ] 无 Stripe Checkout Session ID / Payment Intent 全量展示
  - [ ] 无 API Key 全量展示（仅 `sk-tokfai_xxxx…yyyy` 前缀后缀）
  - [ ] 浏览器标签 / 书签无 `.env`、服务器 SSH、Supabase Dashboard 密钥页

- [ ] **备用**
  - [ ] 测试账号 credits > 0
  - [ ] 至少 1 个 active API Key
  - [ ] 网络可访问 `api.tokfai.com`

---

## 2. 推荐客户演示路径

按以下顺序讲解，总时长建议 **25–40 分钟**（含 Q&A 可压缩 Admin 部分）。

| # | 环节 | URL / 动作 | 讲解要点 |
|---|------|------------|----------|
| 1 | **首页定位** | `/` | Tokfai = OpenAI 兼容 API 网关；API Key 接入；按用量扣 credits |
| 2 | **Pricing** | `/pricing` | 套餐与 credits 概念；**不现场完成真实支付** |
| 3 | **Docs** | `/docs` | Base URL、`sk-tokfai_` 格式、3 分钟接入 |
| 4 | **登录** | `/login` | 邮箱或 Google；演示专用测试账号 |
| 5 | **Dashboard Overview** | `/dashboard` | 余额、近期用量摘要、入口导航 |
| 6 | **Credits** | `/dashboard/credits` | 余额 + ledger；成功请求扣费、失败不扣费 |
| 7 | **API Keys** | `/dashboard/api-keys` | 创建 Key（**复制一次**）；revoke 仅口头说明，非必要不现场操作 |
| 8 | **Chat Playground** | `/dashboard/playground` | 选 active Key + 模型；短 prompt；展示 reply、`request_id`、credits |
| 9 | **curl 调用** | 终端 §5 | 证明任意客户端可集成；与 Playground 同一 Key |
| 10 | **Usage logs** | `/dashboard/usage` | 按 `request_id` 对账；tokens + `credits_charged` |
| 11 | **Admin Overview** | `/admin/overview` | 运营看板：今日请求、错误率、Top models（**只读**） |
| 12 | **Admin Users** | `/admin/users` | 用户列表与 credits 概况（邮箱打码） |
| 13 | **Admin API Keys** | `/admin/api-keys` | 全站 Key 前缀与状态（只读） |
| 14 | **Admin Models / Pricing** | `/admin/models`、`/admin/pricing` | 模型目录与定价配置（只读） |
| 15 | **Admin Logs** | `/admin/logs` | 错误日志、`request_id` 追踪 |
| 16 | **Image Playground** *(Beta)* | `/dashboard/image-playground` | **可选、放最后**；明确 Beta，上游稳定性适配中；失败用 §4 话术 |

**演示节奏建议**

- 主路径：**1 → 4 → 5 → 7 → 8 → 9 → 10**（客户侧闭环）
- 若客户关心运营：**11 → 14 → 15**（Admin 只读）
- Image：**仅在被问到时**简短展示，并立即切回 Chat

---

## 3. 不建议现场强演示

以下项目**不要**作为承诺能力或现场必成功环节：

| 项目 | 原因 |
|------|------|
| **Image generation** | Beta；GRSAI 上游可能出现 `upstream_invalid_response` / `upstream_timeout` |
| **真实 Stripe 支付** | 生产扣款与 webhook 非 Demo Gate 必项 |
| **高并发压测** | 未做 500/2000 用户 SLA sign-off |
| **危险 Admin 写操作** | revoke key、credits adjust、channel 开关、模型改价 — v1 仍为占位或未开放 |
| **渠道切换 / 多 upstream  failover** | 运维向，易误导客户预期 |
| **模型价格实时修改** | 只读演示即可；改价属后续阶段 |

---

## 4. 失败备用话术

### Image 生成失败时

> 「Chat API 是生产就绪的主路径，已经过 smoke 和 Gate 验收。Image generation 目前标记为 **Beta**，我们在做上游模型的稳定性适配。后台可以通过 **request_id** 追踪每次请求的用量和错误码，方便排查。」

### Chat 偶发慢或超时

> 「这与上游模型负载有关。Tokfai 侧会记录 **request_id** 和 latency；Usage 里可以看到是否扣费。失败请求按规则不扣 credits。」

### 客户问「生产可靠吗」

> 「上线前有 **production smoke test**（`scripts/smoke-prod.mjs`）和 **readiness checklist**（`docs/production-readiness-checklist.md`）。Admin v1 Demo Gate、Chat API 200、权限门禁都已验收通过。」

### 客户问 Admin 能否改价 / 删 Key

> 「Admin v1 当前是**只读运营视图**，便于看用户、用量和错误。写操作在路线图里，现场不做危险变更。」

---

## 5. 标准 Chat API curl 示例

**占位 Key，勿粘贴真实 key 到屏幕或录屏。**

```bash
curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}],
    "stream": false
  }'
```

**成功时关注：**

- HTTP `200`
- 响应 JSON 中 `choices[0].message.content`（或等价 content 字段）
- `request_id`（响应 body 或 `x-request-id` header）

**可选：列出模型**

```bash
curl -sS https://api.tokfai.com/v1/models \
  -H "Authorization: Bearer sk-tokfai_xxx"
```

---

## 6. 演示安全提醒

| 项 | 要求 |
|----|------|
| **邮箱** | 列表与 Admin 表格中使用 `j***@example.com` 或演示专用邮箱 |
| **Checkout Session** | 不展示完整 `cs_live_…` / `pi_…`；必要时只显示后 4 位 |
| **API Key** | 仅展示 `sk-tokfai_` + 前 8 + 后 4 字符；创建 Key 后提醒「只显示一次」 |
| **Service role key** | 永不展示；不在 Supabase Dashboard 录屏 |
| **服务器 env** | 不在 SSH / `pm2 env` / `.env` 窗口演示 |
| **DMIT logs** | 可展示 `request_id`、error code；确认日志无 key 明文 |
| **Smoke 脚本** | 本地 export `TOKFAI_TEST_API_KEY`，勿写入 repo 或共享文档 |

演示前快速自检：

```bash
# 应 PASS，且无 FAIL
TOKFAI_TEST_API_KEY=sk-tokfai_xxx node scripts/smoke-prod.mjs
```

---

## 7. 相关链接

| 文档 | 用途 |
|------|------|
| [production-readiness-checklist.md](./production-readiness-checklist.md) | 上线 / 演示前 readiness |
| [p770-production-demo-flow.md](./p770-production-demo-flow.md) | 客户 API 集成闭环 |
| [p755-production-smoke-test-checklist.md](./p755-production-smoke-test-checklist.md) | 手工浏览器验收 |
| `scripts/smoke-prod.mjs` | 自动化 smoke |

---

*Last aligned with: Admin v1 Demo Gate passed · smoke/readiness commit `1d22311`*
