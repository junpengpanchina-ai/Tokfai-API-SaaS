# Tokfai 生产验收清单

本文档记录 Tokfai 当前生产验收项目的完成状态。只用于上线前检查，不引入任何新功能。

状态说明：

- 已完成：当前已具备并通过验收。
- 待完成：仍需补齐、验证或确认。

| # | 验收项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 域名 | 待完成 | 确认 `tokfai.com` 与 `api.tokfai.com` 的 DNS、HTTPS 和生产环境指向。 |
| 2 | Vercel 页面 | 待完成 | 确认前端生产部署、环境变量和主要页面可访问。 |
| 3 | DMIT API | 待完成 | 确认 `api.tokfai.com` 后端服务、环境变量和健康状态。 |
| 4 | Supabase 表 | 待完成 | 确认生产库已应用迁移，并包含 `profiles`、`credit_ledger`、`usage_logs`、`api_keys` 等表。 |
| 5 | API Key 创建 | 待完成 | 确认登录用户可通过前端调用 DMIT API 创建 Tokfai API Key。 |
| 6 | `/v1/models` | 待完成 | 确认使用 Tokfai API Key 可请求模型列表。 |
| 7 | `/v1/chat/completions` | 待完成 | 确认 OpenAI-compatible chat completions 请求可成功返回。 |
| 8 | `usage_logs` | 待完成 | 确认成功调用后会写入用量记录。 |
| 9 | `credit_ledger` | 待完成 | 确认成功调用或购买后会记录积分流水。 |
| 10 | Credits 页面 | 待完成 | 确认用户可查看积分余额和积分流水。 |
| 11 | Usage 页面 | 待完成 | 确认用户可查看自己的调用用量记录。 |
| 12 | Docs 页面 | 待完成 | 确认文档页面展示生产 API 使用说明，并且链接可访问。 |

