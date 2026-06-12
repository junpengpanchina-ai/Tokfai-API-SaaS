# P755 — 生产最终 Smoke Test Checklist

> 只验收，不新增功能。覆盖公开转化链路与 Dashboard 核心页面。  
> 环境：`https://tokfai.com`（或当前生产域名）  
> 建议：桌面 Chrome + 移动端 Safari/Chrome 各跑一遍。

状态：`[ ]` 未测 · `[x]` 通过 · `[!]` 失败（备注）

---

## P756 登录态验收指南（执行顺序）

1. **登录**：无痕或已登出 → 访问 `/login?next=/dashboard/playground` → 邮箱或 Google 登录 → 确认回到 Playground。
2. **Chat Playground**：确认 active API Key 已选、model 默认 `gpt-5.4` → 发送短 prompt → 检查 reply / tokens / credits_charged / request_id；清空 Key 或粘贴无效 Key 验 6.4；可选：选 gemini 高负载模型或断网验 6.6。
3. **Image Playground**：确认 model 默认 `gpt-image-2` → 文生图短 prompt → 检查 preview / URL / credits / request_id / Usage·Credits 链接。
4. **Usage**：打开最近请求 → 找 Chat/Image 成功行与 failed 行 → 核对对账说明与 request_id 复制。
5. **Credits**：核对余额、ledger 流水、对账说明、充值入口（不必完成支付）。
6. **Models**：核对 gpt-5.4/5.5 推荐备注与 gemini 高负载提示。

---

## 0. 前置

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 0.1 | 已登录测试账号可用（邮箱或 Google OAuth） | `[x]` | P756 生产登录态 |
| 0.2 | 测试账号至少有 1 个 active API Key | `[x]` | Playground 默认选中 active key |
| 0.3 | 测试账号 credits 余额 > 0（Playground 成功路径） | `[x]` | Chat/Image 成功请求可扣费 |
| 0.4 | Dashboard → Latest announcements 可见「模型可用性与扣费说明」 | `[x]` | 生产 Supabase UPSERT 后已确认 |

---

## 1. 公开首页 `/`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 1.1 | 页面加载无白屏 / 500 | `[x]` | 2026-06-11 浏览器验收 |
| 1.2 | Hero、定价入口、Docs 入口可见 | `[x]` | |
| 1.3 | 未登录 CTA 跳转 `/login?next=...` 或 `/pricing` 正确 | `[x]` | |
| 1.4 | 已登录 CTA 跳转 `/dashboard` 或对应 dashboard 子页 | `[x]` | P756 登录态 Header CTA |
| 1.5 | 移动端无横向溢出、CTA 可点击 | `[x]` | 移动端视口验收 |

---

## 2. Pricing `/pricing`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 2.1 | 套餐卡片、价格、credits 数量展示正常 | `[x]` | |
| 2.2 | 未登录充值按钮 → `/login?next=/dashboard/credits`（或等价） | `[x]` | |
| 2.3 | 已登录充值按钮 → `/dashboard/credits` | `[x]` | P756 登录态 Buy 按钮 |
| 2.4 | 中英文切换文案一致（如启用 i18n） | `[x]` | 2026-06-12 人工补验：套餐/按钮/说明文案正常 |

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
| 4.2 | 邮箱登录成功后回到 `next` 目标页（非丢失到 `/dashboard`） | `[x]` | P750/P756 登录态确认 |
| 4.3 | Google OAuth 登录成功后同样保留 `next` | `[x]` | P750 生产验收 |
| 4.4 | 开放重定向被拦截（如 `next=https://evil.com` → 安全 fallback） | `[x]` | 净化为 `next=/dashboard` |
| 4.5 | 错误密码 / 网络错误有友好提示（非 raw error） | `[x]` | 2026-06-12 人工补验：错误密码有友好提示，无 raw error |

---

## 5. Dashboard `/dashboard`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 5.1 | Overview 余额、24h 请求数、active keys 有数据或合理空态 | `[x]` | P756 登录态 |
| 5.2 | Latest announcements 含「模型可用性与扣费说明」 | `[x]` | 与 0.4 一致 |
| 5.3 | 侧栏 / 导航可进入 Playground、Usage、Credits、Models | `[x]` | P756 登录态 |
| 5.4 | 移动端导航可用 | `[x]` | P753 移动端 + P756 侧栏 |

---

## 6. Chat Playground `/dashboard/playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 6.1 | 可选择或粘贴 API Key | `[x]` | active API Key 默认选中 |
| 6.2 | 默认 / 推荐 model 为 gpt-5.4 或 gpt-5.5 | `[x]` | 默认 `gpt-5.4`（`TOKFAI_RECOMMENDED_MODEL`） |
| 6.3 | **成功路径**：reply、model、tokens、credits_charged、可复制 request_id | `[x]` | P756 成功请求验收 |
| 6.4 | **无效 Key**：友好提示 + 管理 API Keys 入口（无 raw upstream） | `[x]` | P754 `PlaygroundErrorPanel`；无 raw code/message |
| 6.5 | **余额不足**：友好提示 + 充值 / pricing 入口 | `[ ]` | 未复现，非阻塞（测试账号余额充足） |
| 6.6 | **上游失败**：「模型暂时不可用或负载较高」+ 建议 gpt-5.4/5.5 | `[ ]` | 未复现，非阻塞 |

---

## 7. Image Playground `/dashboard/image-playground`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 7.1 | 文生图 prompt-only 可发起请求 | `[x]` | P756 文生图成功 |
| 7.2 | **成功路径**：图片预览、URL、credits_charged、request_id、Usage/Credits 链接 | `[x]` | preview + 元数据 + 底部链接 |
| 7.3 | **无效 Key / 余额不足**：与 Chat 同类友好提示 | `[x]` | 无效 Key 与 Chat 同面板；余额不足未单独复现 |
| 7.4 | **上游失败**：「图片模型暂时不可用或生成较慢」+ 失败通常不扣费说明 | `[ ]` | 未复现，非阻塞 |

---

## 8. Usage `/dashboard/usage`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 8.1 | 最近请求列表加载（或空态） | `[x]` | P756 登录态 |
| 8.2 | 成功 Chat 行含 tokens + credits_charged | `[x]` | Playground 成功后有记录 |
| 8.3 | 对账说明：失败用于排查一般不扣费；成功记录 tokens/credits | `[x]` | P754 howItWorksItem5 |
| 8.4 | request_id 可复制 | `[x]` | Copy 按钮可用 |

---

## 9. Credits `/dashboard/credits`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 9.1 | 当前余额与 ledger 列表展示 | `[x]` | 含 chat/image 扣费流水 |
| 9.2 | 对账说明：Credits 账本是余额准账本；扣费以成功请求为准 | `[x]` | P754 howItWorksItem6 |
| 9.3 | 充值入口可到达（不要求本 checklist 内完成真实支付） | `[x]` | 套餐入口可达；未测 Stripe 支付 |

---

## 10. Models `/dashboard/models`

| # | 项 | 状态 | 备注 |
|---|---|---|---|
| 10.1 | Chat / Image 模型列表加载 | `[x]` | P756 登录态 |
| 10.2 | gpt-5.4 / gpt-5.5 标注「推荐测试 / 稳定优先」 | `[x]` | P754 `catalog.chatModelNote` |
| 10.3 | gemini-3.1-pro / gemini-3-pro / gemini-2.5-pro 高负载风险提示 | `[x]` | 建议优先 gpt-5.4 |
| 10.4 | 无 raw provider 技术错误文案暴露给用户 | `[x]` | 仅用户向备注文案 |

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
| 日期 | 2026-06-12 |
| 环境 | production |
| 通过项 / 总项 | 44 / 47 |
| 阻塞问题 | 无 |
| 结论 | `[x]` Go · `[ ]` No-Go |

**第一轮摘要（P755，2026-06-11）**：公开页（`/`、`/pricing`、`/docs`）与 login `next` / open redirect 拦截已通过；Dashboard 各路由 auth 闸门已通过；失败项 0。

**第二轮摘要（P756，2026-06-11）**：登录态 Dashboard 深层验收完成。Chat/Image Playground 成功路径、API Key 默认选中、Models/Usage/Credits 对账文案均通过；无效 Key 友好提示已确认。未改 billing / checkout / webhook / DMIT / PM2 / Nginx。

**第三轮摘要（人工补验，2026-06-12）**：2.4 Pricing 中英文切换、4.5 错误密码友好提示已通过。6.5 余额不足、6.6 Chat 上游失败、7.4 Image 上游失败未复现，均非阻塞。失败项 0，结论 **Go**。

**未复现项（非阻塞）**：6.5、6.6、7.4 — 可在余额耗尽或上游异常时按需补测。
