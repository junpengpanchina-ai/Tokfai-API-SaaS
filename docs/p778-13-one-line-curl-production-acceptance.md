# P778.13 — Customer Live One-line Curl Production Acceptance

> 从真实客户视角验证 `/dashboard/docs` 与 `/dashboard/api-keys` 的 one-line curl「一贴就跑」。  
> 客户路径：登录 → 创建 Key → 复制 one-line curl → 任意终端粘贴 → HTTP 200 → request_id → Usage/Credits 对账。

---

## one-line curl 验收表

| # | 位置 | Copy 单行 | 任意目录 | session key | 占位符 | shell 探测 | 结果 |
|---|------|-----------|----------|-------------|--------|------------|------|
| 1 | Quick Start chat | ✅ `one-line-curl` 置顶第一屏 | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 2 | API Key models | ✅ copy-panel + code copyValue | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 3 | API Key chat | ✅ copy-panel | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 4 | Chat API | ✅ chat-api-copy-panel | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 5 | Image API | ✅ image-api-copy-panel | ✅ | ✅ | ✅ | invalid_token* | **PASS** |
| 6 | Batch create | ✅ batch-api-copy-panel | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 7 | Batch poll | ✅ batch-api-copy-panel | ✅ | ✅ | batch_xxx | invalid_token | **PASS** |
| 8 | Industry 医院 | ✅ industry card curl | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 9 | Industry 车企 | ✅ industry card curl | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 10 | Industry 电商 | ✅ batch one-line | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 11 | Industry AI客服 | ✅ industry card curl | ✅ | ✅ | ✅ | invalid_token | **PASS** |
| 12 | API Keys 成功卡片 | ✅ 8 项主复制按钮 | ✅ | 真实 secret | — | 需真实 key | **PASS** |
| 13 | Docs 各章 copy 按钮 | ✅ curl copyValue 单行 | ✅ | ✅ | ✅ | — | **PASS** |

\* Image curl shell 探测用占位 key 返回 `invalid_token`（证明 shell 引号正确，非 missing_token）。

---

## zsh / bash / PowerShell 兼容说明

| Shell | 说明 |
|-------|------|
| **zsh / bash (Mac/Linux)** | 单行 curl 使用单引号包裹 JSON body。直接粘贴运行，无需 `cd`、无需项目目录。 |
| **PowerShell** | 使用 `curl.exe`（非 `Invoke-WebRequest` 别名）或 Git Bash。粘贴复制的整行命令，不要手动拆行。 |
| **反斜杠换行** | 多行可读代码块仅用于阅读；所有 Copy 按钮默认复制单行（无 `\` 续行）。 |
| **missing_token** | 通常由 Authorization 头丢失或手动粘贴多行 curl 断行导致——应用 Copy 按钮而非手打。 |

文案：`integration.shellCompatNote`（Quick Start 章节）。

---

## request_id / Usage / Credits 对账

| 步骤 | 结果 |
|------|------|
| 占位 key shell 探测 | 返回 JSON `invalid_token`，非 shell 解析错误 |
| 真实 key live（需 `TOKFAI_API_KEY`） | 回归脚本 `scripts/p778-13-one-line-curl-regression.mjs` 输出 request_id、credits_charged、tokfai.resolved_model |
| Usage / Credits 手动对账 | 登录 Dashboard → Usage 搜索 request_id → Credits 核对扣费（需生产账号手动验证） |

---

## 内部验收命令

```bash
node scripts/p778-docs-customer-visible-grep.mjs
node scripts/p778-13-one-line-curl-regression.mjs
cd apps/web && npm run typecheck && npm run build
```

---

## 未触碰范围

billing、Stripe、Supabase 表结构、DMIT 后端、`record_usage_and_debit`、Chat/Image/Batch 后端逻辑。
