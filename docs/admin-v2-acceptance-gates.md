# Admin v2 Acceptance Gates

> Operational gates for Tokfai Admin v2 (New API–class parity) and **10,000-request** stability acceptance.  
> Planning doc: [admin-v2-new-api-parity-plan.md](./admin-v2-new-api-parity-plan.md)

**Current production baseline:**

| Milestone | Status |
|-----------|--------|
| Admin v1 Demo Gate | Passed (`b7b4bc7`) |
| Admin v1 stable tag | `admin-v1-stable-c2f0245` (`c2f0245`) |
| Production full smoke | PASS=10 WARN=0 FAIL=0 SKIP=0 |
| Admin 10k load (baseline) | PASS with warnings |
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
| **4** | Admin 10k load smoke (legacy id) | Yes (v2) | `node scripts/admin-load-smoke.mjs` |
| **5** | Chat 10k load smoke | Yes (capacity) | `node scripts/load-test-chat.mjs` |
| **6** | Credits ledger consistency | Yes (billing) | SQL / reconcile scripts |
| **7** | Audit log | Yes (before writes) | Query + write tests |
| **8** | Customer demo rehearsal | Yes (release) | Manual runbook |
| **9** | Admin write smoke dry-run | Yes (v2 writes) | `node scripts/admin-write-smoke.mjs` |
| **10** | Admin 10k load smoke no FAIL | Yes (v2) | `node scripts/admin-load-smoke.mjs` |

> **Gate 4** and **Gate 10** use the same script. Gate 10 is the explicit v2 acceptance criterion: **0 FAIL** (WARN for p95 allowed).

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

## Gate 4 / Gate 10 — Admin 10k load smoke

**Goal:** Admin **read-only** endpoints stable under 10,000 requests with **no FAIL**.

```bash
TOKFAI_ADMIN_JWT=<admin_access_token> \
node scripts/admin-load-smoke.mjs

# Defaults: TOTAL=10000, CONCURRENCY=20
TOKFAI_LOAD_TOTAL=10000 TOKFAI_LOAD_CONCURRENCY=20 \
TOKFAI_ADMIN_JWT=... node scripts/admin-load-smoke.mjs
```

**Fail-fast (before load):**

| Condition | Result |
|-----------|--------|
| Missing `TOKFAI_ADMIN_JWT` | FAIL exit 1 |
| Undecodable JWT | FAIL — regenerate token |
| Expired JWT (`exp` ≤ now) | FAIL — regenerate token |

**Endpoints (round-robin):**

`dashboard-summary` (overview), `users`, `api-keys`, `models`, `channels`, `pricing`, `usage`, `credit-orders`, `logs`, `settings`, `announcements`, `recharge-plans`

| Criterion | Pass | Warn | Fail |
|-----------|------|------|------|
| 5xx | 0 | — | any → FAIL |
| timeout / network | 0 | — | any → FAIL |
| 401/403 (admin JWT) | 0 | — | any → FAIL |
| completed iterations | = TOTAL | — | short run → FAIL |
| p95 latency | — | ≥ 1000ms per endpoint | — |

| Exit code | Meaning |
|-----------|---------|
| 0 | PASS or PASS with WARN |
| 1 | Any FAIL |

**Gate 10 pass:** `RESULT: PASS` or `PASS (with warnings)` and **FAIL=0** across all endpoints.

**Fail action:** Profile DMIT/Supabase before promoting write UI.

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

**Goal:** Every admin write leaves an audit trail before opening additional write UI.

| Check | Method |
|-------|--------|
| `admin_audit_logs` row on model/plan/announcement/key/settings/channel write | Staging test |
| `credits.adjust` → audit + ledger | `POST /admin/credits/adjust` |
| No secrets in payload | Inspect `request_payload` |
| Future: `GET /admin/audit-logs` | next P0/P1 API |

| Criterion | Pass |
|-----------|------|
| Write without audit row (or structured logger fallback) | 0 silent failures |
| Audit payloads | No service role / full API keys |

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

## Gate 9 — Admin write smoke dry-run

**Goal:** Write routes reject bad input / unauthenticated calls with structured errors; no accidental production mutation in default mode.

```bash
# Dry-run (default) — OPTIONS / validation / auth only
TOKFAI_ADMIN_JWT=<admin_access_token> \
node scripts/admin-write-smoke.mjs

# Live — only tokfai-smoke-* resources; cleanup at end
TOKFAI_ADMIN_JWT=<admin_access_token> \
TOKFAI_ADMIN_WRITE_SMOKE=1 \
node scripts/admin-write-smoke.mjs
```

| Mode | Behavior |
|------|----------|
| Default (no `TOKFAI_ADMIN_WRITE_SMOKE`) | Validation + OPTIONS + no-token auth; **no** durable mutations |
| `TOKFAI_ADMIN_WRITE_SMOKE=1` | Create/patch smoke-prefixed announcements/plans; settings/channel overlays restored/cleaned |

| Criterion | Pass |
|-----------|------|
| FAIL count | 0 |
| JWT missing / expired | Fail-fast before tests |
| Disallowed settings fields (e.g. secrets) | 400 |
| Empty patches | 400 |
| No-token write | 401 or 403 |

**Fail action:** Do not promote admin write UI; fix API envelopes first.

---

## Recommended execution order

```
Gate 1 → Gate 2 → Gate 3 → Gate 9 → Gate 10 → Gate 5 → Gate 6 → Gate 7 → Gate 8
```

For **docs/scripts + admin write API** commits: Gates **1**, **9** (dry-run), **10** before enabling web write UI.

---

## Sign-off template

```text
Date:
Commit:
Gate 1: [ ] PASS
Gate 2: [ ] PASS (smoke summary)
Gate 3: [ ] PASS
Gate 9: [ ] PASS (write smoke dry-run)
Gate 10: [ ] PASS / WARN (10k load, FAIL=0)
Gate 5: [ ] PASS / N/A
Gate 6: [ ] PASS
Gate 7: [ ] PASS / DEFER
Gate 8: [ ] PASS
Approved by:
```

---

## Related files

| File | Role |
|------|------|
| `scripts/smoke-prod.mjs` | Gate 2 |
| `scripts/admin-auth-guard-smoke.mjs` | Gate 3 |
| `scripts/admin-write-smoke.mjs` | Gate 9 |
| `scripts/admin-load-smoke.mjs` | Gate 4 / Gate 10 |
| `scripts/load-test-chat.mjs` | Gate 5 |
| `docs/admin-v2-new-api-parity-plan.md` | v2 scope |
| `docs/production-readiness-checklist.md` | Ops readiness |
| `docs/customer-demo-runbook.md` | Gate 8 |
