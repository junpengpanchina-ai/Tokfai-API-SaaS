# DMIT 前后端接口合同对齐检查

> 对照：`apps/dmit-api` 真实路由 + `docs/dmit-api-backend-summary.md`  
> 范围：`apps/web` 中所有 DMIT API 调用  
> 日期：2026-07-11

## 问题清单

| # | 严重度 | 文件 | 错误调用 / 行为 | 应改为 | 处理 |
|---|---|---|---|---|---|
| 1 | **P0** | `components/pricing-content.tsx`（修复前） | 已登录「购买」跳转 `/dashboard/credits`，**从未**调用 checkout | `POST /v1/billing/checkout`，body `{ plan_id }`，再跳转 Stripe `url` | ✅ 已修：`PricingBuyButton` |
| 2 | **P0** | `lib/dmit/client.ts` `createCheckoutSession` | 助手已实现正确路径与 body，但 UI 零引用 | 由 Pricing Buy 调用 | ✅ 已接线 |
| 3 | 信息 | `lib/billing/recharge-plans.ts` `creditsPurchaseHref` | 登录后指向 `/dashboard/credits`，与 Pricing 互跳形成死环 | 登录后指向 `/pricing`（选套餐） | ✅ 已修 |
| 4 | — | Credits「充值」→ `/pricing` | 本身不是 API 错路径；在 #1 修复后合理（去选套餐再 checkout） | 保持链到 Pricing | 无需改 |

## 重点项核对结果

| 检查项 | 结果 |
|---|---|
| 是否仍调用 `/v1/billing/recharge-plans`、`/recharge-plans`、`/v1/recharge-plans` | **否**。公开读套餐仅 `GET /v1/billing/plans`；Admin 管理用 `/admin/recharge-plans`（后端真实存在） |
| Pricing 是否读 `/v1/billing/plans` | **是**（`fetchBillingPlansForPricing` → `listBillingRechargePlans`） |
| Credits 充值是否调用 checkout | 修复前否（死环）；修复后：Credits → Pricing → `POST /v1/billing/checkout` |
| Checkout body 是否为 `{ plan_id }` | **是**（`createCheckoutSession`）；非 `planId` / `id` / `package_code` |
| Admin credits adjust | **正确**：`POST /admin/credits/adjust`，body `user_id` + `amount` + `direction` + `reason`，带 `Idempotency-Key`（后端真实字段为 `user_id`，非用户摘要里的 `userId`） |
| Image playground | **正确**：仅 `POST /v1/images/generations` |
| Chat playground | **正确**：仅 `POST /v1/chat/completions` |

## 与「简写合同」的路径差（非前端 bug）

用户摘要中的 JWT 路径：

- `GET /v1/me/ledger` / `GET /v1/me/orders`

后端真实路径（`routes/me.ts`）：

- `GET /v1/me/credits/ledger`
- `GET /v1/me/credits/orders`

前端 `lib/dmit/server.ts` 已用真实路径，**勿改成简写**。

## 其它已对齐（抽查）

| 调用方 | 路径 | 状态 |
|---|---|---|
| `lib/dmit/server.ts` | `/v1/me/credits`、`/v1/me/usage`、`/v1/announcements` | OK |
| `lib/dashboard-safe/api-keys-client.ts` | `/v1/me/api-keys` | OK |
| Admin 各页 | `/admin/me`、`/admin/api-keys`、`/admin/credits` 等 | OK |
| Overview health | `GET /v1/health` | OK（公开另有 `/health`） |

## 本次最小 patch

- 新增 `apps/web/components/pricing-buy-button.tsx`
- 更新 `pricing-content.tsx`、`recharge-plans.ts`、`dmit/client.ts` 注释
- **未**改后端 schema / 路由
