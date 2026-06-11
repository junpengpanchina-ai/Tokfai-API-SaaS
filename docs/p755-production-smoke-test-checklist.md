# P755 — 生产最终 Smoke Test Checklist

> 只验收，不新增功能。覆盖公开转化链路与 Dashboard 核心页面。  
> 环境：`https://tokfai.com`（或当前生产域名）  
> 建议：桌面 Chrome + 移动端 Safari/Chrome 各跑一遍。

状态：`[ ]` 未测 · `[x]` 通过 · `[!]` 失败（备注）

---

## 0. 前置

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 0.1 | 已登录测试账号可用（邮箱或 Google OAuth） | `[ ]` | 需登录后补验 |
| 0.2 | 测试账号至少有 1 个 active API Key | `[ ]` | 需登录后补验 |
| 0.3 | 测试账号 credits 余额 > 0（Playground 成功路径） | `[ ]` | 需登录后补验 |
| 0.4 | Dashboard → Latest announcements 可见「模型可用性与扣费说明」 | `[x]` | 生产 Supabase UPSERT 后已确认 |

---

## 1. 公开首页 `/`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 1.1 | 页面加载无白屏 / 500 | `[x]` | 2026-06-11 浏览器验收 |
| 1.2 | Hero、定价入口、Docs 入口可见 | `[x]` | |
| 1.3 | 未登录 CTA 跳转 `/login?next=...` 或 `/pricing` 正确 | `[x]` | |
| 1.4 | 已登录 CTA 跳转 `/dashboard` 或对应 dashboard 子页 | `[ ]` | 需登录后补验 |
| 1.5 | 移动端无横向溢出、CTA 可点击 | `[x]` | 移动端视口验收 |

---

## 2. Pricing `/pricing`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 2.1 | 套餐卡片、价格、credits 数量展示正常 | `[x]` | |
| 2.2 | 未登录充值按钮 → `/login?next=/dashboard/credits`（或等价） | `[x]` | |
| 2.3 | 已登录充值按钮 → `/dashboard/credits` | `[ ]` | 需登录后补验 |
| 2.4 | 中英文切换文案一致（如启用 i18n） | `[ ]` | 需登录后补验 |

---

## 3. Docs `/docs`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 3.1 | Base URL、`sk-tokfai_` 格式、3 分钟接入步骤可见 | `[x]` | |
| 3.2 | 示例 model 为 `gpt-5.4`（非已下线 model） | `[x]` | |
| 3.3 | 复制 curl / 代码块可用 | `[x]` | Copy 按钮可见 |
| 3.4 | 「Create API key」链到 login 或 dashboard api-keys | `[x]` | |

---

## 4. Login + `next` 重定向

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 4.1 | 未登录访问 `/dashboard/playground` → login 带 `next` | `[x]` | → `/login?next=%2Fdashboard%2Fplayground` |
| 4.2 | 邮箱登录成功后回到 `next` 目标页（非丢失到 `/dashboard`） | `[ ]` | 需登录后补验 |
| 4.3 | Google OAuth 登录成功后同样保留 `next` | `[ ]` | 需登录后补验 |
| 4.4 | 开放重定向被拦截（如 `next=https://evil.com` → 安全 fallback） | `[x]` | 净化为 `next=/dashboard` |
| 4.5 | 错误密码 / 网络错误有友好提示（非 raw error） | `[ ]` | 需登录后补验 |

---

## 5. Dashboard `/dashboard`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 5.1 | Overview 余额、24h 请求数、active keys 有数据或合理空态 | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 5.2 | Latest announcements 含「模型可用性与扣费说明」 | `[ ]` | 需登录后补验（0.4 已单独确认公告数据） |
| 5.3 | 侧栏 / 导航可进入 Playground、Usage、Credits、Models | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 5.4 | 移动端导航可用 | `[ ]` | 需登录后补验 |

---

## 6. Chat Playground `/dashboard/playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 6.1 | 可选择或粘贴 API Key | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 6.2 | 默认 / 推荐 model 为 gpt-5.4 或 gpt-5.5 | `[ ]` | 需登录后补验 |
| 6.3 | **成功路径**：reply、model、tokens、credits_charged、可复制 request_id | `[ ]` | 需登录后补验 |
| 6.4 | **无效 Key**：友好提示 + 管理 API Keys 入口（无 raw upstream） | `[ ]` | 需登录后补验 |
| 6.5 | **余额不足**：友好提示 + 充值 / pricing 入口 | `[ ]` | 需登录后补验 |
| 6.6 | **上游失败**：「模型暂时不可用或负载较高」+ 建议 gpt-5.4/5.5 | `[ ]` | 需登录后补验 |

---

## 7. Image Playground `/dashboard/image-playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 7.1 | 文生图 prompt-only 可发起请求 | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 7.2 | **成功路径**：图片预览、URL、credits_charged、request_id、Usage/Credits 链接 | `[ ]` | 需登录后补验 |
| 7.3 | **无效 Key / 余额不足**：与 Chat 同类友好提示 | `[ ]` | 需登录后补验 |
| 7.4 | **上游失败**：「图片模型暂时不可用或生成较慢」+ 失败通常不扣费说明 | `[ ]` | 需登录后补验 |

---

## 8. Usage `/dashboard/usage`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 8.1 | 最近请求列表加载（或空态） | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 8.2 | 成功 Chat 行含 tokens + credits_charged | `[ ]` | 需登录后补验 |
| 8.3 | 对账说明：失败用于排查一般不扣费；成功记录 tokens/credits | `[ ]` | 需登录后补验 |
| 8.4 | request_id 可复制 | `[ ]` | 需登录后补验 |

---

## 9. Credits `/dashboard/credits`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 9.1 | 当前余额与 ledger 列表展示 | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 9.2 | 对账说明：Credits 账本是余额准账本；扣费以成功请求为准 | `[ ]` | 需登录后补验 |
| 9.3 | 充值入口可到达（不要求本 checklist 内完成真实支付） | `[ ]` | 需登录后补验 |

---

## 10. Models `/dashboard/models`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 10.1 | Chat / Image 模型列表加载 | `[ ]` | 需登录后补验；auth 闸门已通过 |
| 10.2 | gpt-5.4 / gpt-5.5 标注「推荐测试 / 稳定优先」 | `[ ]` | 需登录后补验 |
| 10.3 | gemini-3.1-pro / gemini-3-pro / gemini-2.5-pro 高负载风险提示 | `[ ]` | 需登录后补验 |
| 10.4 | 无 raw provider 技术错误文案暴露给用户 | `[ ]` | 需登录后补验 |

---

## 11. 回归边界（本 checklist 不测）

以下 intentionally **out of scope**，勿在本轮 smoke test 中改代码：

- Stripe Checkout 真实支付
- Stripe Webhook 入账
- DMIT 扣费逻辑 / PM2 / Nginx
- Supabase 表结构变更

---

## 12. 验收结论

| 项 | 值 |
|---|---|
| 执行人 | junpeng |
| 日期 | 2026-06-11 |
| 环境 | production |
| 通过项 / 总项 | 13 / 47 |
| 阻塞问题 | 无 |
| 结论 | `[x]` Go · `[ ]` No-Go — Dashboard 深层功能建议登录态补验 |

**第一轮摘要（2026-06-11）**：公开页（`/`、`/pricing`、`/docs`）与 login `next` / open redirect 拦截已通过；Dashboard 各路由 auth 闸门已通过（未登录 → `/login?next=...`）；失败项 0。
