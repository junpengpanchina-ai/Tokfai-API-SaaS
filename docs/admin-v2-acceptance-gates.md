# Admin v2 Acceptance Gates

> Operational gates for Tokfai Admin v2 (New API–class parity) and **10,000-request** stability acceptance.  
> Planning doc: [admin-v2-new-api-parity-plan.md](./admin-v2-new-api-parity-plan.md)

**Current production baseline:**

| Milestone | Status |
|-----------|--------|
| Admin v1 Demo Gate | Passed (`b7b4bc7`) |
| Production full smoke | PASS=10 WARN=0 FAIL=0 SKIP=0 |
| Chat API | 200 OK |
| Image API | 200 OK (Beta — demo optional) |
| Readiness checklist | `docs/production-readiness-checklist.md` |
| Customer demo runbook | `docs/customer-demo-runbook.md` |

---

## Gate overview

| Gate | Name | Blocking? | Automation |
|------|------|-----------|------------|
| **1** | Build / typecheck | Yes | CI / local |
| **2** | Production smoke | Yes | `node scripts/smoke-prod.mjs` |
| **3** | Admin auth guard | Yes | `node scripts/admin-auth-guard-smoke.mjs` |
| **4** | Admin 10k load smoke | Yes (v2) | `node scripts/admin-load-smoke.mjs` |
| **5** | Chat 10k load smoke | Yes (capacity) | `node scripts/load-test-chat.mjs` |
| **6** | Credits ledger consistency | Yes (billing) | SQL / reconcile scripts |
| **7** | Audit log | Yes (before writes) | Query + write tests |
| **8** | Customer demo rehearsal | Yes (release) | Manual runbook |

---

## Gate 1 — Build / typecheck

**Goal:** No compile or type errors in deployable apps.

```bash
cd apps/web && npm run typecheck && npm run build
cd apps/dmit-api && npm run typecheck && npm run build
```

| Criterion | Pass |
|-----------|------|
| `tsc --noEmit` | 0 errors |
| `next build` | 39+ routes, no digest crash |
| `dmit-api build` | `tsc -p tsconfig.build.json` OK |

**Fail action:** Fix before any production promote.

---

## Gate 2 — Production smoke

**Goal:** Public site + API + CORS + Chat/Image paths healthy.

```bash
TOKFAI_TEST_API_KEY=sk-tokfai_xxx node scripts/smoke-prod.mjs
```

| Criterion | Pass |
|-----------|------|
| FAIL count | 0 |
| Admin no-auth | redirect login, no admin leak |
| Chat (with key) | 200 + `request_id` |
| Image | PASS or WARN (unless `TOKFAI_SMOKE_IMAGE=true`) |

**Fail action:** Block demo / release until smoke green.

---

## Gate 3 — Admin auth guard

**Goal:** Admin data cannot be read without admin JWT.

```bash
# Minimal (no JWTs)
node scripts/admin-auth-guard-smoke.mjs

# Full
TOKFAI_USER_JWT=<non_admin_access_token> \
TOKFAI_ADMIN_JWT=<admin_access_token> \
node scripts/admin-auth-guard-smoke.mjs
```

| Case | Expected |
|------|----------|
| No token → `GET /admin/users` | 401 or 403 |
| Fake token | 401 or 403 |
| User JWT (`TOKFAI_USER_JWT`) | 401 or 403 |
| Admin JWT (`TOKFAI_ADMIN_JWT`) | 200 JSON `{ data: [...] }` |

| Criterion | Pass |
|-----------|------|
| FAIL count | 0 |
| Admin JWT 200 | Required when `TOKFAI_ADMIN_JWT` set |

**Fail action:** Security incident — do not enable admin writes.

---

## Gate 4 — Admin 10k load smoke

**Goal:** Admin **read-only** endpoints stable under 10,000 requests.

```bash
TOKFAI_ADMIN_JWT=<admin_access_token> \
node scripts/admin-load-smoke.mjs

# Defaults: TOTAL=10000, CONCURRENCY=20
TOKFAI_LOAD_TOTAL=10000 TOKFAI_LOAD_CONCURRENCY=20 \
TOKFAI_ADMIN_JWT=... node scripts/admin-load-smoke.mjs
```

**Endpoints (round-robin):**

`dashboard-summary` (overview), `users`, `api-keys`, `models`, `channels`, `pricing`, `usage`, `credit-orders`, `logs`, `settings`, `announcements`, `recharge-plans`

| Criterion | Pass | Warn |
|-----------|------|------|
| 5xx | 0 | — |
| timeout | 0 | — |
| 401/403 (admin JWT) | 0 | — |
| p95 latency | — | ≥ 1000ms per endpoint |

| Exit code | Meaning |
|-----------|---------|
| 0 | PASS or PASS with WARN |
| 1 | Any FAIL |

**Fail action:** Profile DMIT/Supabase before v2 write rollout.

---

## Gate 5 — Chat 10k load smoke

**Goal:** Customer-facing Chat API stable under load (existing script).

```bash
TOKFAI_API_KEY=sk-tokfai_xxx \
TOTAL_REQUESTS=10000 CONCURRENCY=20 \
node scripts/load-test-chat.mjs
```

| Criterion | Pass |
|-----------|------|
| Error rate | Within script threshold |
| 5xx / upstream hard failures | 0 or documented upstream issue |
| Credits debited | Only on success (manual spot check) |

**Note:** Image load is **out of scope** for Gate 5 (Beta).

---

## Gate 6 — Credits ledger consistency

**Goal:** `profiles.credits_balance` matches ledger; usage debits correct.

| Check | Method |
|-------|--------|
| Balance = sum(ledger) | `supabase/scripts` / reconcile tooling |
| Failed requests not charged | Usage status + ledger |
| Admin adjust idempotent | Same `Idempotency-Key` → no double debit |

References: `docs/p765-usage-ledger-safety.md`, `scripts/reconcile-usage-ledger.mjs`

| Criterion | Pass |
|-----------|------|
| Reconcile script | 0 unexplained drift |
| Sample admin adjust | 1 row in `admin_audit_logs` + ledger |

---

## Gate 7 — Audit log

**Goal:** Every admin write leaves an audit trail before v2 opens additional writes.

| Check | Method |
|-------|--------|
| `admin_audit_logs` row on model/plan/announcement write | Staging test |
| `credits.adjust` → audit + ledger | `POST /admin/credits/adjust` |
| No secrets in payload | Inspect `request_payload` |
| Future: `GET /admin/audit-logs` | v2 P0 API |

| Criterion | Pass |
|-----------|------|
| Write without audit row | 0 |
| Audit read API (v2) | Returns actor, action, resource |

**Fail action:** Do not enable new write UI.

---

## Gate 8 — Customer demo rehearsal

**Goal:** End-to-end demo path rehearsed once within 24h of customer meeting.

Checklist: [customer-demo-runbook.md](./customer-demo-runbook.md) §1 (10-minute list).

| Step | Required |
|------|----------|
| `smoke-prod.mjs` | PASS |
| Homepage → login → dashboard → playground → curl → usage | Manual |
| Admin overview → users → api-keys → models → logs | Manual (read-only) |
| Image playground | Optional; Beta disclaimer ready |
| Screen share scrub | No real keys / emails / checkout IDs |

| Criterion | Pass |
|-----------|------|
| Rehearsal completed | Sign-off in ops notes |
| Backup话术 | Team knows §4 runbook |

---

## Recommended execution order

```
Gate 1 → Gate 2 → Gate 3 → Gate 4 → Gate 5 → Gate 6 → Gate 7 → Gate 8
```

For **docs/scripts-only** commits (this phase): Gates **1–3** locally; Gate **4–8** before v2 write enablement.

---

## Sign-off template

```text
Date:
Commit:
Gate 1: [ ] PASS
Gate 2: [ ] PASS (smoke summary)
Gate 3: [ ] PASS
Gate 4: [ ] PASS / WARN (p95 notes)
Gate 5: [ ] PASS / N/A
Gate 6: [ ] PASS
Gate 7: [ ] PASS / DEFER (v2 P0)
Gate 8: [ ] PASS
Approved by:
```

---

## Related files

| File | Role |
|------|------|
| `scripts/smoke-prod.mjs` | Gate 2 |
| `scripts/admin-auth-guard-smoke.mjs` | Gate 3 |
| `scripts/admin-load-smoke.mjs` | Gate 4 |
| `scripts/load-test-chat.mjs` | Gate 5 |
| `docs/admin-v2-new-api-parity-plan.md` | v2 scope |
| `docs/production-readiness-checklist.md` | Ops readiness |
| `docs/customer-demo-runbook.md` | Gate 8 |
