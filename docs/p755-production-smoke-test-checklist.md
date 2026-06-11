# P755 — 生产最终 Smoke Test Checklist

> 只验收，不新增功能。覆盖公开转化链路与 Dashboard 核心页面。  
> 环境：`https://tokfai.com`（或当前生产域名）  
> 建议：桌面 Chrome + 移动端 Safari/Chrome 各跑一遍。

状态：`[ ]` 未测 · `[x]` 通过 · `[!]` 失败（备注）

---

## 0. 前置

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 0.1 | 已登录测试账号可用（邮箱或 Google OAuth） | `[ ]` | |
| 0.2 | 测试账号至少有 1 个 active API Key | `[ ]` | |
| 0.3 | 测试账号 credits 余额 > 0（Playground 成功路径） | `[ ]` | |
| 0.4 | Dashboard → Latest announcements 可见「模型可用性与扣费说明」 | `[ ]` | |

---

## 1. 公开首页 `/`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 1.1 | 页面加载无白屏 / 500 | `[ ]` | |
| 1.2 | Hero、定价入口、Docs 入口可见 | `[ ]` | |
| 1.3 | 未登录 CTA 跳转 `/login?next=...` 或 `/pricing` 正确 | `[ ]` | |
| 1.4 | 已登录 CTA 跳转 `/dashboard` 或对应 dashboard 子页 | `[ ]` | |
| 1.5 | 移动端无横向溢出、CTA 可点击 | `[ ]` | |

---

## 2. Pricing `/pricing`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 2.1 | 套餐卡片、价格、credits 数量展示正常 | `[ ]` | |
| 2.2 | 未登录充值按钮 → `/login?next=/dashboard/credits`（或等价） | `[ ]` | |
| 2.3 | 已登录充值按钮 → `/dashboard/credits` | `[ ]` | |
| 2.4 | 中英文切换文案一致（如启用 i18n） | `[ ]` | |

---

## 3. Docs `/docs`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 3.1 | Base URL、`sk-tokfai_` 格式、3 分钟接入步骤可见 | `[ ]` | |
| 3.2 | 示例 model 为 `gpt-5.4`（非已下线 model） | `[ ]` | |
| 3.3 | 复制 curl / 代码块可用 | `[ ]` | |
| 3.4 | 「Create API key」链到 login 或 dashboard api-keys | `[ ]` | |

---

## 4. Login + `next` 重定向

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 4.1 | 未登录访问 `/dashboard/playground` → login 带 `next` | `[ ]` | |
| 4.2 | 邮箱登录成功后回到 `next` 目标页（非丢失到 `/dashboard`） | `[ ]` | |
| 4.3 | Google OAuth 登录成功后同样保留 `next` | `[ ]` | |
| 4.4 | 开放重定向被拦截（如 `next=https://evil.com` → 安全 fallback） | `[ ]` | |
| 4.5 | 错误密码 / 网络错误有友好提示（非 raw error） | `[ ]` | |

---

## 5. Dashboard `/dashboard`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 5.1 | Overview 余额、24h 请求数、active keys 有数据或合理空态 | `[ ]` | |
| 5.2 | Latest announcements 含「模型可用性与扣费说明」 | `[ ]` | |
| 5.3 | 侧栏 / 导航可进入 Playground、Usage、Credits、Models | `[ ]` | |
| 5.4 | 移动端导航可用 | `[ ]` | |

---

## 6. Chat Playground `/dashboard/playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 6.1 | 可选择或粘贴 API Key | `[ ]` | |
| 6.2 | 默认 / 推荐 model 为 gpt-5.4 或 gpt-5.5 | `[ ]` | |
| 6.3 | **成功路径**：reply、model、tokens、credits_charged、可复制 request_id | `[ ]` | |
| 6.4 | **无效 Key**：友好提示 + 管理 API Keys 入口（无 raw upstream） | `[ ]` | |
| 6.5 | **余额不足**：友好提示 + 充值 / pricing 入口 | `[ ]` | |
| 6.6 | **上游失败**：「模型暂时不可用或负载较高」+ 建议 gpt-5.4/5.5 | `[ ]` | |

---

## 7. Image Playground `/dashboard/image-playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 7.1 | 文生图 prompt-only 可发起请求 | `[ ]` | |
| 7.2 | **成功路径**：图片预览、URL、credits_charged、request_id、Usage/Credits 链接 | `[ ]` | |
| 7.3 | **无效 Key / 余额不足**：与 Chat 同类友好提示 | `[ ]` | |
| 7.4 | **上游失败**：「图片模型暂时不可用或生成较慢」+ 失败通常不扣费说明 | `[ ]` | |

---

## 8. Usage `/dashboard/usage`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 8.1 | 最近请求列表加载（或空态） | `[ ]` | |
| 8.2 | 成功 Chat 行含 tokens + credits_charged | `[ ]` | |
| 8.3 | 对账说明：失败用于排查一般不扣费；成功记录 tokens/credits | `[ ]` | |
| 8.4 | request_id 可复制 | `[ ]` | |

---

## 9. Credits `/dashboard/credits`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 9.1 | 当前余额与 ledger 列表展示 | `[ ]` | |
| 9.2 | 对账说明：Credits 账本是余额准账本；扣费以成功请求为准 | `[ ]` | |
| 9.3 | 充值入口可到达（不要求本 checklist 内完成真实支付） | `[ ]` | |

---

## 10. Models `/dashboard/models`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 10.1 | Chat / Image 模型列表加载 | `[ ]` | |
| 10.2 | gpt-5.4 / gpt-5.5 标注「推荐测试 / 稳定优先」 | `[ ]` | |
| 10.3 | gemini-3.1-pro / gemini-3-pro / gemini-2.5-pro 高负载风险提示 | `[ ]` | |
| 10.4 | 无 raw provider 技术错误文案暴露给用户 | `[ ]` | |

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
| 执行人 | |
| 日期 | |
| 环境 | production / staging |
| 通过项 / 总项 | / |
| 阻塞问题 | |
| 结论 | `[ ]` Go · `[ ]` No-Go |
