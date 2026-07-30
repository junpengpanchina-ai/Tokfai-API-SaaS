# P984 — Model Routing Evidence / Scheduling Result Acceptance Report

> 目标：把 Tokfai 从「可对账」推进到「可解释模型调度、可截图交付、可售后复盘」。  
> 约束：不破坏 P971–P983；不新增核心 Chat/Billing 逻辑（仅补充 routing evidence）；不宣称 fully compatible；不泄露完整 API Key / 上游密钥。

## Result: **PASS**

Marker: `TOKFAI_P984_MODEL_ROUTING_EVIDENCE_PASS`

---

## 1. Deliverables

| Artifact | Status |
|---|---|
| `apps/dmit-api/src/lib/routingEvidence.ts` | Created — strategy / success / failure builders + log flatten + tokfai merge |
| Success `tokfai` routing fields | Wired in `executeChatCompletion` via `mergeTokfaiRouting` |
| Failure `tokfai` routing fields | Wired via `result.routing` → `handleExecuteChatCompletionResult` |
| Logs (`chat_completion_succeeded` / `failed` / `upstream_timeout_policy` / `model_not_tool_capable`) | Include routing + billing fields |
| Admin recent requests | Attempted models / fallback attempts / strategy / reason / latency / billing |
| `docs/model-routing-evidence.zh.md` | Created |
| `docs/customer-model-routing-sop.zh.md` | Created |
| `scripts/p984-model-routing-evidence-smoke.mjs` | Created |
| Offline mock | `tokfaiMeta` / `notBillableExtras` include routing evidence |

---

## 2. Smoke results (offline mock)

```text
PASS  doc_exists:docs/model-routing-evidence.zh.md
PASS  doc_exists:docs/customer-model-routing-sop.zh.md
PASS  docs_routing_keywords
PASS  routing_evidence_module
PASS  executor_wires_routing
PASS  admin_routing_columns
PASS  models_capabilities
PASS  chat_success_routing_and_billing
PASS  billing_routing_request_id_consistent
PASS  auto_fast_routing_evidence
PASS  auto_pro_routing_evidence
PASS  unknown_model_not_billable_routing
PASS  tools_non_whitelist_not_billable
PASS  pm2_dirty_logs

TOKFAI_P984_MODEL_ROUTING_EVIDENCE_PASS
```

Command:

```bash
node scripts/p984-model-routing-evidence-smoke.mjs
# optional LIVE:
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p984-model-routing-evidence-smoke.mjs
```

---

## 3. Build / typecheck

| Check | Result |
|---|---|
| `apps/dmit-api` `npm run typecheck` | PASS |
| `apps/dmit-api` `npm run build` | PASS |
| `apps/web` `tsc --noEmit` | PASS |

---

## 4. Acceptance checklist

| # | Criterion | Verdict |
|---|---|---|
| 1 | Success tokfai has request_id / requested / resolved / strategy / attempted / fallback_attempts / latency / billing / credits | PASS |
| 2 | Failure tokfai not_billable + credits=0 + routing fields | PASS |
| 3 | Logs carry routing evidence | PASS |
| 4 | Admin recent requests show routing columns | PASS |
| 5 | Docs explain auto-* as strategy, not single model | PASS |
| 6 | No fully compatible overpromise | PASS |
| 7 | No full API key leak | PASS |
| 8 | Tools non-whitelist fails not_billable | PASS |

---

## 5. Notes

- `routing_strategy` for `auto-fast` / `auto-pro` / `auto-cheap` keeps the alias id; other alias chains use `alias:<id>`; direct catalog ids use `direct`.
- Admin reads routing from `usage_logs.response_snapshot.tokfai` when present (success + enriched failures).
- Provider labels in logs are opaque ids only — never upstream credentials.
