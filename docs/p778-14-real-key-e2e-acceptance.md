# P778.14 — Real API Key End-to-End Customer Acceptance

> 真实客户路径：Dashboard 创建 Key → session 注入 → 复制 one-line curl → 终端 HTTP 200 → request_id → Usage / Credits 对账 → revoke 验证。

---

## E2E 验收表

| # | 验收项 | 预期 | 自动化 | 结果 |
|---|--------|------|--------|------|
| 1 | API Keys 创建新 Key | HTTP 200 + secret + id | `p778-14` step create | 需 JWT |
| 2 | 成功卡片 Copy full key | 复制完整 secret | 手动 | 需 JWT |
| 3 | Docs session 注入 | 非 sk-tokfai_xxx | 修复：dismiss 不清 session；存 key id | **PASS** |
| 4 | Quick Start one-line chat curl | HTTP 200 | `p778-14` shell curl | 需 JWT |
| 5 | 成功卡片 one-line chat curl | HTTP 200 | `p778-14` shell curl | 需 JWT |
| 6 | models one-line curl | HTTP 200 + data[] | `p778-14` shell curl | 需 JWT |
| 7 | 响应字段 | content, request_id, credits_charged, tokfai.requested_model, tokfai.resolved_model | `p778-14` 校验 | 需 JWT |
| 8 | Usage 对账 | request_id 行 status/model/tokens/credits | GET /me/usage/summary | 需 JWT |
| 9 | Credits 对账 | reference_id = request_id，amount 与 credits_charged 一致 | GET /me/credits/ledger | 需 JWT |
| 10 | revoke 后 curl | invalid_token，不扣费 | `p778-14` revoke step | 需 JWT |
| 11 | 重建 Key 再 curl | HTTP 200 | `p778-14` recreate step | 需 JWT |

---

## 本轮修复

1. **session key 持久化**：点击「已保存密钥」不再清除 `sessionStorage`；Docs 在整页会话内保持真实 key。
2. **revoke 联动**：revoke 与 session 中 key id 匹配时清除 session；成功卡片在 revoke 对应 key 时收起。
3. **Usage request_id 筛选**：Usage 查询区新增 `request_id` 可选过滤（客户端过滤结果集）。
4. **Playground / Image Playground**：创建 key 时写入 session key id。
5. **内部 E2E 脚本**：`scripts/p778-14-real-key-e2e-acceptance.mjs`。

---

## 运行 E2E（内部，非客户文档）

```bash
TOKFAI_SUPABASE_JWT=<dashboard_access_token> node scripts/p778-14-real-key-e2e-acceptance.mjs
```

结果写入 `p778-live-smoke-results/e2e-latest.json`。

---

## 未触碰范围

billing、Stripe、Supabase 表结构、DMIT 路由逻辑、`record_usage_and_debit`、Chat/Image/Batch 后端。

---

## 占位 key shell 探测（无 JWT）

| curl | HTTP | 说明 |
|------|------|------|
| chat (sk-tokfai_xxx) | 401 JSON | `invalid_token` — shell 引号正确 |
| models (sk-tokfai_xxx) | 200 JSON | 公开模型目录（25 models） |
