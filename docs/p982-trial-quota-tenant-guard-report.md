# P982 — Trial Quota / Tenant Guard / Commercial Risk Control Report

> 目标：可灰度售卖、可控试用、超额/禁模失败不计费。  
> 约束：不破坏 Chat 成功扣费主路径；不宣传 fully compatible；保留 P971–P981。

## Result: **PASS**

Marker: `TOKFAI_P982_TRIAL_QUOTA_TENANT_GUARD_PASS`

---

## 1. 交付物

| Artifact | Status |
|---|---|
| `supabase/migrations/0038_p982_api_key_trial_quota.sql` | Created — `trial_mode` / limits columns |
| `apps/dmit-api/src/gateway/trialQuotaGuard.ts` | Created — early guard + masked commercial_request_trace |
| Wire in `executeChatCompletion` precheck + not_billable usage_log | Done |
| Envelope `tokfai.not_billable` for quota codes | Done |
| Env: `TOKFAI_TRIAL_*` | Done |
| Mock error models for offline envelope | Done |
| `docs/trial-quota-commercial-guard.zh.md` | Created |
| `docs/customer-risk-control-sop.zh.md` | Created |
| `scripts/p982-trial-quota-tenant-guard-smoke.mjs` | Created |
| Admin「试用额度 / 配额风控」提示 | Done（文案卡） |

---

## 2. 行为摘要

| Case | Expected |
|---|---|
| 普通 Chat 成功 | 可扣费 + `request_id` + commercial_request_trace |
| 未知模型失败 | not_billable / credits=0 |
| `trial_mode` + 非白名单模型 | `trial_model_not_allowed` / 不计费 |
| 试用终身额度满 | `trial_limit_exceeded` / 不计费 |
| 日/月超额 | `daily_limit_exceeded` / `quota_exceeded` / 不计费 |
| 日志 | 仅 mask Key，无完整 secret |

默认试用白名单：`auto-fast` · `auto-cheap`（高成本模型默认不可试用）。

---

## 3. Smoke

```bash
node scripts/p982-trial-quota-tenant-guard-smoke.mjs
```

全部 PASS（含 mock 风控信封四码 + 普通 Chat + unknown model not_billable）。

---

## 4. Build

| Check | Result |
|---|---|
| dmit-api typecheck | PASS |
| dmit-api build | PASS |
| web tsc | PASS |

---

## 5. 运维注意

1. 应用迁移 `0038_p982_api_key_trial_quota.sql` 后，试用 Key 才可写 `trial_mode`  
2. 未迁移时 guard 软降级（读列失败 → 跳过 Key 级试用规则；全局日/月仍在）  
3. LIVE 脏日志门禁仍按既有 release gate；本片未引入新扣费写路径  

---

## 6. 验收结论

**P982 Trial Quota / Tenant Guard Acceptance：通过。**

Tokfai 具备可配置试用额度与模型风控；超额与禁模失败不计费；商业追踪日志脱敏；普通 Chat 主路径保持可扣费成功。
