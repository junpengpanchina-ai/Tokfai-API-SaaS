# Tokfai 生产验收清单

本文档记录 Tokfai 当前生产验收项目的完成状态。只用于上线前检查，不引入任何新功能。

状态说明：

- 已完成：当前已具备并通过验收。
- 待完成：仍需补齐、验证或确认。

| # | 验收项 | 状态 | 说明 |
|---|---|---|---|
| 1 | Google OAuth login | 已完成 | 前端登录链路已接入 Google OAuth，可用于生产登录验收。 |
| 2 | Dashboard Overview real data | 已完成 | Overview 使用 RLS-scoped Supabase 读取当前用户余额、24 小时请求数和 active key 数量。 |
| 3 | Credits balance and credit ledger | 已完成 | Credits 页面展示当前用户 credits 余额、累计数据和最近 credit ledger entries。 |
| 4 | Usage logs RLS scoped per user | 已完成 | Usage 页面只读取当前登录用户自己的 `usage_logs` 记录和统计。 |
| 5 | Admin read-only dashboard | 已完成 | Admin 页面用于只读查看 profiles、API keys 和 usage logs 状态。 |
| 6 | API key revoke | 已完成 | API Keys 页面支持 revoke 用户自己的 key，并显示 active / revoked 状态。 |
| 7 | Revoked key blocked by DMIT API | 已完成 | DMIT API key 校验会拒绝 `revoked_at` 不为空的 key。 |
| 8 | Stripe Checkout | 待完成 | 需要完成生产 Checkout 配置、跳转链路和真实支付验收。 |
| 9 | Stripe Webhook | 待完成 | 需要完成生产 webhook 签名验证、事件处理和幂等验收。 |
| 10 | recharge order table | 待完成 | 需要补齐充值订单表，用于记录 Stripe checkout / payment 状态。 |
| 11 | credit top-up ledger entry | 待完成 | 需要确认支付成功后写入 top-up credit ledger entry，并更新用户余额。 |
| 12 | production security cleanup | 待完成 | 上线前需清理调试输出、确认 CORS / secrets / RLS / admin access 等生产安全项。 |

