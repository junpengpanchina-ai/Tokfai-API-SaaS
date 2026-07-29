# P978 — Commercial Replication Acceptance Report

> 目标：把 Tokfai 从「接口能跑」补成可复制、可沉淀、可交付的商业样板。  
> 约束：不大改核心生产链路；不破坏 P971–P977；不把 tools 宣传成 fully compatible；不引入新扣费逻辑。

## Result: **PASS**

Marker: `TOKFAI_P978_COMMERCIAL_REPLICATION_PASS`

Base commit (pre-change HEAD): `0b3ce04`

---

## 1. Deliverables

| Artifact | Status |
|---|---|
| `docs/customer-onboarding-playbook.zh.md` | Created — 产品说明、客户画像、注册/Key/Base URL、curl、Cursor、模型建议、账单、request_id SOP |
| `docs/model-commercial-matrix.zh.md` | Created — 模型定位/场景/推荐/chat/stream/coding/image；**tools 仅白名单可承诺** |
| `docs/error-code-guide.zh.md` | Created — 常见码、可读解释、是否扣费、处理建议 |
| `scripts/p978-commercial-replication-smoke.mjs` | Created — 只读/轻量；docs + capabilities + chat + not_billable + request_id |
| Usage 用量页 | 补齐类型列、错误码列；文案强调失败不扣费 |
| Admin 经营视角 | 今日成功/失败、今日不计费、Top 用户、低余额用户（Top 模型/最近错误已有） |

---

## 2. Smoke results (offline mock)

```text
PASS  doc_exists:docs/customer-onboarding-playbook.zh.md
PASS  doc_exists:docs/model-commercial-matrix.zh.md
PASS  doc_exists:docs/error-code-guide.zh.md
PASS  matrix_tools_not_overpromised
PASS  usage_ui_error_column
PASS  admin_commercial_metrics
PASS  models_capabilities
PASS  chat_success_request_id
PASS  failure_not_billable_request_id

TOKFAI_P978_COMMERCIAL_REPLICATION_PASS
```

Command:

```bash
node scripts/p978-commercial-replication-smoke.mjs
# optional LIVE:
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p978-commercial-replication-smoke.mjs
```

---

## 3. Build / typecheck

| Check | Result |
|---|---|
| `apps/dmit-api` `npm run typecheck` | PASS |
| `apps/dmit-api` `npm run build` | PASS |
| `apps/web` `tsc --noEmit` | PASS |

---

## 4. Changed files

- `docs/customer-onboarding-playbook.zh.md` (new)
- `docs/model-commercial-matrix.zh.md` (new)
- `docs/error-code-guide.zh.md` (new)
- `docs/p978-commercial-replication-report.md` (this file)
- `scripts/p978-commercial-replication-smoke.mjs` (new)
- `apps/dmit-api/src/routes/adminDashboardSummary.ts` — commercial glance fields (display-only aggregates)
- `apps/web/lib/admin/client.ts` — types
- `apps/web/components/admin/admin-overview-panel.tsx` — success/fail/not_billable/top users/low balance
- `apps/web/components/usage-view-client.tsx` — type + error_code columns
- `apps/web/lib/i18n/messages.ts` — en/zh copy

---

## 5. Acceptance checklist

| # | Criterion | Verdict |
|---|---|---|
| 1 | 新客户能看懂是什么、怎么接入、怎么选模型、怎么付费 | **PASS** — onboarding playbook |
| 2 | 管理员能看用户、消耗、失败、扣费、异常 | **PASS** — overview metrics + existing errors/models |
| 3 | 销售可复制话术与接入 SOP | **PASS** — playbook §11 + commercial matrix + error guide |
| 4 | 不破坏 Chat / Stream / Billing / P971–P977 | **PASS** — no chat debit path changes; tools still whitelist-gated |
| 5 | Usage 字段可读（时间/模型/类型/成败/tokens/积分/request_id/失败原因/失败不扣费） | **PASS** |
| 6 | Admin 经营指标齐全 | **PASS**（今日成功/失败、不计费、Top 用户/模型、低余额、最近错误） |
| 7 | p978 smoke marker | **PASS** |

---

## 6. Explicit non-goals / guardrails honored

- Tools **not** marketed as fully compatible; matrix points to `VERIFIED_TOOLS_CAPABLE_MODEL_IDS`
- No new debit / billing write path — admin fields are read aggregates only
- Core `executeChatCompletion` untouched in this slice

---

## 7. 验收结论

**P978 Commercial Replication Acceptance：通过。**

Tokfai 现具备可复制的商业交付包：中文客户接入手册、模型商业矩阵、错误码指南；用户 Usage 与 Admin 经营视角可读性补齐；轻量 smoke 输出 `TOKFAI_P978_COMMERCIAL_REPLICATION_PASS`。未扩大核心计费面，未把 tools 写成公开承诺能力。
