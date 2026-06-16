# P782 — Customer commercial & production contract pack

> **Internal project record** — customer-facing delivery docs only.

---

## Production use 章节

| # | 项 | 结果 |
|---|-----|------|
| 1 | 测试 Key vs 生产 Key | **PASS** |
| 2 | 客户接入路径 | **PASS** |
| 3 | 服务端 API Key 规范 | **PASS** |
| 4 | auto-fast / auto-pro / auto-cheap | **PASS** |
| 5 | 失败与扣费 + Usage/Credits | **PASS** |

## Rate limits & large volume 章节

| # | 项 | 结果 |
|---|-----|------|
| 1 | 限流原因 | **PASS** |
| 2 | 10 → 100 → 1000 → 10k/100k | **PASS** |
| 3 | Batch API 对账 | **PASS** |
| 4 | 并发与重试 | **PASS** |
| 5 | 客户话术 | **PASS** |

## Commercial FAQ 章节

| # | 项 | 结果 |
|---|-----|------|
| 1 | Tokfai 卖什么 | **PASS** |
| 2 | 非代运营 | **PASS** |
| 3 | 医院 / 车企 / 电商 / AI 客服 | **PASS** |
| 4 | 对账路径 | **PASS** |

## API Keys / Models

| 项 | 结果 |
|----|------|
| 成功卡 Production handoff 链接 | **PASS** |
| Models 生产模型说明 + 跳转 | **PASS** |
| one-line curl / request_id / Usage / Credits | **保留** |

## 未触碰

billing、Stripe、Supabase、DMIT backend、扣费逻辑。
