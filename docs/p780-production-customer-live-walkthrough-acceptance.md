# P780 — Production customer live walkthrough acceptance

> **Internal project record** — not shown in customer UI.  
> Customer path: Dashboard → API Key → one-line curl → any terminal → Usage/Credits.

---

## 生产客户路径验收表

| # | 区域 | 验收项 | 结果 |
|---|------|--------|------|
| 1 | `/dashboard` | firstRun：Key → curl → terminal → Usage/Credits | **PASS** |
| 2 | `/dashboard/api-keys` | 成功卡 7 项 copy + Docs 链 | **PASS** |
| 3 | `/dashboard/docs` Quick Start | 4 步 + Paste and run | **PASS** |
| 4 | `/dashboard/playground` | request_id → Usage 链 | **PASS** |
| 5 | `/dashboard/image-playground` | request_id + Usage 链 | **PASS** |
| 6 | `/dashboard/usage` | `request_id` 搜索 | **PASS** |
| 7 | `/dashboard/credits` | `reference_id` 搜索 | **PASS** |
| 8 | `/dashboard/models` | Quick Start + Usage 入口 | **PASS** |
| 9 | one-line curl | 真单行、任意目录可跑 | **PASS** |
| 10 | Chat curl | HTTP 200 + 响应字段 | **JWT 时 PASS** / 无 JWT 见 invalid_token |
| 11 | Models curl | HTTP 200 | **JWT 时 PASS** |
| 12 | Batch create curl | HTTP 202 | **JWT 时 PASS** |
| 13 | invalid_token | 非 missing_token | **PASS** (生产实测) |
| 14 | Revoke | session 清理 + invalid_token | **PASS** (代码 + JWT 脚本) |
| 15 | 客户可见 grep | 0 hits | **PASS** |
| 16 | typecheck / build | `apps/web` | **PASS** |

---

## 已验收页面

| 页面 | 客户下一步 |
|------|------------|
| `/dashboard` | Create Key → Quick Start curl → Usage/Credits |
| `/dashboard/api-keys` | 成功卡 copy + Docs Quick Start / Chat / Batch / Usage / Credits |
| `/dashboard/docs` | Quick Start 4 步；session key 注入 |
| `/dashboard/playground` | 运行后 `request_id` → Usage |
| `/dashboard/image-playground` | 同上 |
| `/dashboard/usage` | `request_id` 过滤 |
| `/dashboard/credits` | Reference / request_id 过滤 |
| `/dashboard/models` | API Keys + Quick Start + Usage |

---

## One-line curl

- 格式：`curl -sS https://api.tokfai.com/v1/...` 单行，无 `\n`
- 来源：`apps/web/lib/customer-curl-oneline.ts`
- Mac Terminal / Linux / Git Bash / Windows `curl.exe` 任意目录粘贴

---

## Session key 注入

| 事件 | 行为 |
|------|------|
| 创建 Key | `setQuickStartApiKeySecret(secret, keyId)` |
| Docs / 成功卡 | `useQuickStartApiKey()` 注入真实 key |
| 无 session | `sk-tokfai_xxx` + 创建 Key 提示 |
| Revoke 匹配 | `clearQuickStartApiKeyIfMatches` |

---

## Usage / Credits 对账

- **Usage** `/dashboard/usage` → `request_id` 可选过滤  
- **Credits** `/dashboard/credits` → Reference / request_id 过滤  
- 文档：Usage = 请求明细；Credits = 余额账本；成功扣费，失败通常不扣费  

---

## 生产 curl 验证（无 JWT）

```bash
# invalid_token（已实测 api.tokfai.com）
curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_invalid_test_key" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-fast","messages":[{"role":"user","content":"Say ok only."}],"stream":false}'
# → {"error":{"code":"invalid_token",...}}
```

## 生产 curl 验证（运营 JWT）

```bash
TOKFAI_SUPABASE_JWT=<access_token> node scripts/p780-production-customer-live-walkthrough.mjs
```

---

## Internal vs customer

| 客户 | 运营 |
|------|------|
| Dashboard + API Key + curl | `TOKFAI_SUPABASE_JWT` + `scripts/p780-*` |
| `docs/p778-15-customer-live-smoke.md` | `docs/p778-15-operator-smoke-separation.md` |

---

## 未触碰

billing、Stripe、Supabase 表结构、`record_usage_and_debit`、DMIT 后端、Chat/Image/Batch 扣费逻辑。
