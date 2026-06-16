# P778.12 — Handbook static acceptance (internal operator record)

> **Internal project record** — static review of `/dashboard/docs` structure.  
> **Not** shown to customers. Customer validation: [P778.15 customer live smoke](./p778-15-customer-live-smoke.md).

客户视角静态验收 `/dashboard/docs` 整本接入手册（源码结构，非客户操作步骤）。

验收方式：源码结构审查 + `node scripts/p778-docs-customer-visible-grep.mjs` + `npm run typecheck` + `npm run build`（`apps/web`）。

---

## 章节验收表

| # | 章节 | TOC | Copy | Links | one-line curl | request_id | Usage/Credits | 内部词 | 结果 |
|---|------|-----|------|-------|---------------|------------|---------------|--------|------|
| 1 | Product positioning | `#product-positioning` | Essential keys + CTA | Keys、生产对接、Quick Start、SDK/Cursor/Cherry/Industry | — | placeholderKeyNote 全局 | chapterNow verify → Usage/Credits | PASS | **PASS** |
| 2 | Production integration flow | `#production-integration-flow` | chapterNow chat-curl | Keys、Playground、Batch、Usage、Credits、Usage/Credits 章、Quick Start | chat-curl one-line | demoFlowStep2–5 + reconcile note | demoFlowStep4–5 + usage-credits 链 | PASS | **PASS** |
| 3 | Quick Start | `#quick-start` | copy-fields + one-line-curl + readable | Keys、API Key、Chat、生产对接、Usage/Credits、Error、Usage、Credits | `one-line-curl` + `resolveDocCurlSnippetCopy` | quickStartStep5–6 + reconcile | quickStartChapterVerify + links | PASS | **PASS** |
| 4 | API Key | `#api-key` | api-key-copy-panel + models curl | Keys、Usage、Credits、Quick Start | models-curl one-line | apiKeyVerifyNote | verify links | PASS | **PASS** |
| 5 | Chat API | `#chat-api` | chat-api-copy-panel | Playground、Usage、Credits、Batch、Error、Usage/Credits | chat-curl one-line | response fields + reconcile steps | reconcile + links | PASS | **PASS** |
| 6 | Image API | `#image-api` | image-api-copy-panel | Image Playground、Usage、Credits、Error、Batch | image-curl one-line | image fields + reconcile | billing + links | PASS | **PASS** |
| 7 | Batch API | `#batch-api` | batch create/poll copy | Keys、Usage、Credits、Chat、Error、Usage/Credits | batch create/poll one-line | per-item request_id | batch reconcile + links | PASS | **PASS** |
| 8 | Usage / Credits | `#usage-credits` | reconcile copy | Usage、Credits、Error、Chat、Image、Batch | — | 章节核心 | 章节核心 | PASS | **PASS** |
| 9 | Error codes | `#error-codes` | error JSON samples | Keys、Usage、Credits、Usage/Credits | — | errorsIntroRequestId + flow | errorsCharged + Usage flow | PASS | **PASS** |
| 10 | OpenAI SDK | `#openai-sdk` | openai-sdk-copy-panel + code | Keys、Playground、Usage、Credits、Error、Usage/Credits、Cursor/Cherry/Industry | sdk examples copy one-line | sdk verify bullets | reconcile + links | PASS | **PASS** |
| 11 | Cursor | `#cursor` | cursor-copy-panel + config | Keys、Playground、Usage、Credits、Error、OpenAI SDK、Cherry、Industry | chat-curl fallback | cursor verify/reconcile | billing + links | PASS | **PASS** |
| 12 | Cherry Studio | `#cherry-studio` | cherry-copy-panel + config | Keys、Playground、Usage、Credits、Error、Cursor、Industry | chat-curl fallback | cherry verify/reconcile | billing + links | PASS | **PASS** |
| 13 | Industry API examples | `#industry-examples` | industry-copy-panel + per-card curl | Keys、Chat/Image/Batch、Error、Usage/Credits、Usage、Credits、SDK/Cursor/Cherry | industry one-line curls | industry onboarding step4 | Tokfai provides + links | PASS | **PASS** |

---

## P778.12 修复项

1. **新增第 2 章** `production-integration-flow`（生产对接流程），插入 Product positioning 与 Quick Start 之间，含 5 步 ordered flow、reconcile note、Dashboard links。
2. **章节顺序** 固定为 13 章（`CUSTOMER_DOC_SECTIONS` 数组顺序）。
3. **交叉跳转**：Product positioning、Quick Start、OpenAI SDK、Cursor、Cherry、Industry 之间可互相跳转；生产对接流程链到 Batch / Usage / Credits。
4. **i18n**：`navProductionFlow`；`demoFlowTitle` 改为「Production integration flow / 生产对接流程」；ZH 文案中「托管运营」改为「代运营」表述。
5. **静态 grep 脚本** `scripts/p778-docs-customer-visible-grep.mjs` 扫描 `apps/web/components` 与 `apps/web/lib`（排除 admin 路径）。

---

## Copy / one-line curl 确认

- 所有 `type: "code"` 的 curl 块通过 `resolveDocCurlSnippetCopy()` 复制单行版本。
- `type: "one-line-curl"` 与各 `*-copy-panel` 组件复制单行 curl。
- 有 session quickStart API key 时 `resolveQuickStartApiKey()` 自动填入；无 key 时占位 `sk-tokfai_xxx` + `placeholderKeyNote`。

---

## Dashboard links 确认

各章 `dashboard-links` 块指向 `/dashboard/api-keys`、`/dashboard/playground`、`/dashboard/usage`、`/dashboard/credits`、`/dashboard/docs#…` 等；顶部 CTA 与 `chapterNow` 与章节 id 锚点一致。

---

## request_id / Usage / Credits 贯穿

Quick Start、Chat、Image、Batch、Usage/Credits、Error、SDK、Cursor、Cherry、Industry 均含 request_id 说明与 Usage/Credits 对账路径。

---

## 内部词 grep

```bash
node scripts/p778-docs-customer-visible-grep.mjs
```

预期：`PASS (0 hits)`。

---

## 未触碰范围

- billing / Stripe webhook / checkout
- Supabase migrations / 表结构
- `apps/dmit-api` 与 `record_usage_and_debit`
- Chat / Image / Batch 后端处理逻辑
