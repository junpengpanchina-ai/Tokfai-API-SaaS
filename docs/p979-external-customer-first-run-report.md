# P979 — External Customer First-Run Acceptance Report

> 目标：验证陌生客户能否在约 10 分钟内完成首次接入（产品页 + 文档一致），而不是只在 docs 自嗨。  
> 约束：不大改核心 Chat/Billing；保留 P971–P978 保护；只做最小入口补齐。

## Result: **PASS**

Marker: `TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PASS`

---

## 1. Acceptance checklist

| # | Criterion | Where | Verdict |
|---|---|---|---|
| 1 | 登录后看到 Base URL | Dashboard 首次接入卡 + `/dashboard/integration-workbench` + Docs | **PASS** |
| 2 | 看到 / 复制 API Key | `/dashboard/api-keys`（创建后一次性明文 + 复制） | **PASS**（既有） |
| 3 | 推荐模型 auto-fast / auto-pro / auto-cheap | First-run 高亮 + 首次接入面板 + Docs quickstart/cursor + 商业矩阵 | **PASS** |
| 4 | curl 示例 | API Keys 创建后 / 首次接入面板 / Docs quickstart | **PASS** |
| 5 | Cursor 接入示例 | `/dashboard/docs#cursor` + 首次接入面板 + API Keys Cursor 片段 | **PASS** |
| 6 | 成功扣费 / 失败不扣费 | First-run billing 文案 + Usage how-it-works + error guide | **PASS** |
| 7 | request_id 用于反馈 | First-run + Usage 列 + Docs | **PASS** |
| 8 | 管理端看请求/消耗/失败 | Admin「首调经营一眼看」+ Usage/错误表（P978 字段） | **PASS** |
| 9 | 文档与产品页一致 | Base URL 常量 `https://api.tokfai.com/v1`；推荐别名对齐；Cursor 锚点落地 | **PASS** |

---

## 2. Minimal product changes

| Change | Why |
|---|---|
| `DashboardFirstRunAcceptancePanel` + workbench page hosts it | 原 Integration Workbench 为 P825 safe fallback，首调链路断；改为最小首调页 |
| Docs `slug: "cursor"` + quickstart 推荐别名 | 修复死锚点 `#cursor`，与产品话术一致 |
| First-run onboarding 展示三模型 + 账单高亮 | 陌生客户一眼看到选型与扣费规则 |
| Admin `firstRunOpsTitle` 卡片 | 今日新用户 / 成功 / 失败 / 扣费 / 最近错误一眼看 |

**未改：** `executeChatCompletion`、扣费写路径、tools 白名单逻辑。

---

## 3. Smoke

```bash
node scripts/p979-first-run-acceptance-smoke.mjs
```

Offline result:

```text
PASS  playbook_first_run_topics
PASS  error_guide_not_billable
PASS  matrix_recommended_aliases
PASS  dashboard_first_run_panel
PASS  workbench_hosts_first_run
PASS  docs_cursor_slug
PASS  admin_first_run_ops_glance
PASS  docs_product_base_url_align
PASS  models_capabilities
PASS  chat_success_request_id
PASS  failure_not_billable_request_id

TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PASS
```

---

## 4. Build / typecheck

| Check | Result |
|---|---|
| `apps/dmit-api` typecheck | PASS |
| `apps/dmit-api` build | PASS |
| `apps/web` `tsc --noEmit` | PASS |

---

## 5. Changed files

- `apps/web/components/dashboard-first-run-acceptance.tsx` (new)
- `apps/web/app/dashboard/integration-workbench/page.tsx`
- `apps/web/components/dashboard-first-run-onboarding.tsx`
- `apps/web/components/admin/admin-overview-panel.tsx`
- `apps/web/lib/docs/public-beta-docs-registry.ts`
- `apps/web/lib/i18n/messages.ts`
- `scripts/p979-first-run-acceptance-smoke.mjs` (new)
- `docs/p979-external-customer-first-run-report.md` (this file)

Commercial docs from P978 remain the sales/SOP SSOT:

- `docs/customer-onboarding-playbook.zh.md`
- `docs/model-commercial-matrix.zh.md`
- `docs/error-code-guide.zh.md`

---

## 6. Known residual (non-blocking)

- Chat Playground / 部分高级 dashboard 工具仍可能处于历史 safe-mode；**首调路径不再依赖它们**（走 API Keys + Docs + 首次接入页 + curl/Cursor）。
- 「今日新用户」≠「今日完成首调」精确计数；运营需结合 Usage 核对首次调用。

---

## 7. 验收结论

**P979 External Customer First-Run Acceptance：通过。**

陌生客户可在 Dashboard 看到 Base URL、创建/复制 Key、三推荐模型、curl 与 Cursor 示例、成功扣费/失败不扣费与 request_id 反馈路径；管理端有首调经营一眼看；仓库商业文档与产品页口径对齐。核心生产链路未改。
