# P779 — Fresh customer end-to-end onboarding acceptance

> **Internal project record** — not shown in customer UI.  
> Customer path: web login → API Key → one-line curl → any terminal → Usage/Credits.

---

## 全链路验收表

| # | 区域 | 验收项 | 结果 |
|---|------|--------|------|
| 1 | Dashboard 首页 | firstRun：Create Key → copy curl → any terminal → Usage/Credits | **PASS** |
| 2 | Dashboard 首页 | 无内部工程词 | **PASS** (grep) |
| 3 | API Keys 成功卡片 | 7 项 copy + 真实 secret | **PASS** |
| 4 | API Keys | dismiss 后 session key 保留至 revoke/刷新 | **PASS** (P778.14) |
| 5 | Docs Quick Start | session 注入 / 占位符提示 | **PASS** |
| 6 | Docs Quick Start | No install / no repo / no cd / any terminal | **PASS** |
| 7 | Chat API | one-line curl + 响应字段 + Usage/Credits 链 | **PASS** |
| 8 | API Key / Models | models one-line + 公开目录说明 | **PASS** |
| 9 | Image API | one-line curl + Playground + request_id | **PASS** |
| 10 | Batch API | create/poll curl + item request_id | **PASS** |
| 11 | Usage | request_id 筛选 | **PASS** |
| 12 | Credits | reference/request_id 筛选 | **PASS** (P779) |
| 13 | Revoke | session 清理 + invalid_token 说明 | **PASS** |
| 14 | 客户可见 grep | 0 hits | **PASS** |

---

## 客户 one-line curl 路径

1. 登录 [tokfai.com](https://tokfai.com) → Dashboard  
2. API Keys → Create API key → 复制单行 chat curl（或 Docs Quick Start）  
3. 任意目录终端粘贴 → HTTP 200  
4. 复制 `request_id` → Dashboard → Usage → Dashboard → Credits  

---

## Session key 注入逻辑

| 事件 | 行为 |
|------|------|
| 创建 Key（API Keys / Playground / Image） | `setQuickStartApiKeySecret(secret, keyId)` |
| Docs `useQuickStartApiKey()` | 读 session → 填入所有 one-line curl |
| 无 session | 占位 `sk-tokfai_xxx` + 创建 Key 提示 |
| 点击「已保存密钥」 | 仅收起卡片，**不清** session |
| Revoke 匹配 key id | `clearQuickStartApiKeyIfMatches` |

---

## Usage / Credits 对账路径（仅 Dashboard）

- **Usage**：`/dashboard/usage` → 查询区 `request_id` 可选过滤  
- **Credits**：`/dashboard/credits` → 账本区 `Reference / request_id` 过滤  
- 文档说明：Usage = 请求明细；Credits = 余额账本；成功扣费，失败通常不扣费  

---

## Internal vs customer

| 客户 | 内部运营 |
|------|----------|
| API Key + Dashboard | `TOKFAI_SUPABASE_JWT` + `scripts/p778-*` |
| 见 `docs/p778-15-customer-live-smoke.md` | 见 `docs/p778-15-operator-smoke-separation.md` |

---

## 未触碰

billing、Stripe、Supabase 表结构、`record_usage_and_debit`、DMIT 后端、Chat/Image/Batch 扣费逻辑。
