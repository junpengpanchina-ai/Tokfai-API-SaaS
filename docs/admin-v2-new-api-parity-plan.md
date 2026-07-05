# Admin v2 — New API–class Parity Plan (Tokfai)

> **Scope:** Align Tokfai admin **capability model and information architecture** with a New API–class operations console.  
> **Out of scope:** Copying New API source, brand, logo, copy, or copyright.  
> **Phase stance:** Planning + test framework first. **Do not** bulk-enable dangerous writes in v2.0.

**Baseline (v1 shipped):** commit `b7b4bc7` — Admin shell + read-only pages, Demo Gate passed.  
**Readiness:** `scripts/smoke-prod.mjs`, `docs/production-readiness-checklist.md`, `docs/customer-demo-runbook.md`.

---

## 1. New API–class capability matrix

Legend: **R** read · **W** write · **—** not present · **UI** web `/admin` · **API** DMIT `/admin/*`

| Capability area | New API–class expectation | Tokfai v1 UI | Tokfai v1 API | Tokfai v2 target |
|-----------------|---------------------------|--------------|---------------|------------------|
| **用户管理** Users | List, search, filter, view balance, adjust credits, suspend | R (list) | `GET /users` | R + gated W (adjust) |
| **API Key 管理** | Global keys, revoke, owner map, usage | R | `GET /api-keys` | R + revoke (audit) |
| **模型管理** Models | CRUD, enable/disable, upstream mapping | R + partial W UI | Full CRUD | R + controlled W |
| **渠道管理** Channels | Multi-upstream, weight, test, failover | R (env snapshot) | `GET /channels` | R + config table (P1) |
| **模型定价** Pricing | Per-model input/output/image, multiplier | R | `GET /pricing` (+ models) | R + edit (audit) |
| **用量日志** Usage | Filter, export, request_id search | R | `GET /usage` | R + pagination/filters |
| **错误日志** Error logs | Failed requests, upstream status | R | `GET /logs` | R + filters |
| **充值订单** Credit orders | Stripe orders, status filter | R | `GET /credit-orders` | R |
| **充值套餐** Recharge plans | CRUD, Stripe price sync | R + W UI | Full CRUD | W (existing, audit) |
| **公告管理** Announcements | CRUD, schedule visibility | R + W UI | Full CRUD | W (existing, audit) |
| **积分账本** Credits ledger | Per-user ledger lookup | R (by email) | `GET /credits?email=` | R + admin search |
| **系统设置** Settings | Site name, signup credits, maintenance | R (env snapshot) | `GET /settings` | R + persisted settings (P1) |
| **管理员权限** Admin users | Grant/revoke admin, roles | — (layout allowlist) | `admin_users` + JWT | Registry UI + roles (P1) |
| **审计日志** Audit log | All admin writes, actor, payload | — | `admin_audit_logs` (writes only) | R UI + `GET /audit-logs` (P0) |

---

## 2. Tokfai current capabilities (v1)

### Web (`apps/web` `/admin/*`)

| Route | Status |
|-------|--------|
| `/admin/overview` | Read-only dashboard |
| `/admin/users` | Read-only list |
| `/admin/api-keys` | Read-only + revoke **placeholder** (disabled) |
| `/admin/models` | Read + **existing** model CRUD UI |
| `/admin/channels` | Read-only GRSAI snapshot |
| `/admin/pricing` | Read-only derived from models |
| `/admin/usage` | Read-only |
| `/admin/logs` | Read-only + request_id filter |
| `/admin/credit-orders` | Read-only |
| `/admin/recharge-plans` | Read + write (plans) |
| `/admin/announcements` | Read + write |
| `/admin/credits` | Ledger lookup by email |
| `/admin/settings` | Read-only snapshot |

### DMIT (`apps/dmit-api` `/admin/*`)

| Method | Path | Auth | Audit |
|--------|------|------|-------|
| GET | `/me` | JWT | — |
| GET | `/dashboard-summary` | admin | — |
| GET | `/users`, `/api-keys`, `/usage`, `/logs`, … | admin | — |
| GET | `/credits?email=` | admin | — |
| POST | `/credits/adjust` | admin | **RPC + audit** |
| POST/PATCH/DELETE | `/models/*` | admin | **yes** |
| POST/PATCH/DELETE | `/recharge-plans/*` | admin | **yes** |
| POST/PATCH | `/announcements/*` | admin | **yes** |

### Permission model (v1)

1. **Web layout:** `isAdminEmail()` allowlist → else redirect `/dashboard`
2. **Client gate:** `GET /admin/me` → `is_admin`
3. **DMIT:** `requireAdminV1` → `admin_users` registry (+ legacy email fallback)

### Data stores

- `public.admin_users` — admin identity registry (service_role only)
- `public.admin_audit_logs` — append-only audit (service_role only)
- No admin audit **read** API or UI yet

---

## 3. Gap analysis (missing vs New API–class)

| Gap | Impact | Notes |
|-----|--------|-------|
| Audit log read API + UI | Ops cannot review writes | Table exists; no GET |
| Admin users management UI/API | Cannot grant/revoke without SQL | `admin_users` exists |
| API key **revoke** admin API | Security incident response | User revoke exists; no admin revoke |
| Channels persistence | Single GRSAI env row | No DB table |
| Settings persistence | maintenance / signup credits | Env snapshot only |
| Users: role, status, last_active | Incomplete user ops view | profiles fields limited |
| Usage/logs pagination at scale | 10k load risk | Fixed limits today |
| Pricing minimum_charge | Billing edge cases | Always null |
| Channel test / success_rate | Ops visibility | Placeholder null |
| RBAC roles (superadmin vs support) | Enterprise ops | Binary admin today |

---

## 4. Priority roadmap

### P0 — Safety + observability (v2.0)

| Item | Type | Rationale |
|------|------|-----------|
| `GET /admin/audit-logs` | R API + UI | Required before more writes |
| Enable **credits adjust** UI (existing API) | W | API + RPC audit already exist |
| Admin auth guard smoke | Test | `scripts/admin-auth-guard-smoke.mjs` |
| Admin 10k read load smoke | Test | `scripts/admin-load-smoke.mjs` |
| Pagination on users/usage/logs | R API | Load acceptance |

### P1 — Parity core (v2.1)

| Item | Type | Rationale |
|------|------|-----------|
| `POST /admin/api-keys/:id/revoke` | W + audit | Incident response |
| Settings table + `PATCH /admin/settings` | W + audit | maintenance / signup credits |
| Channels table (read/write) | W + audit | Multi-upstream prep |
| Admin users CRUD API + UI | W + audit | Replace email-only allowlist |
| User list: search, pagination, last_active | R | Ops efficiency |

### P2 — Advanced (v2.2+)

| Item | Type | Rationale |
|------|------|-----------|
| RBAC roles | W + audit | support vs superadmin |
| Channel weighted routing UI | W | New API–class routing |
| Export CSV (usage, orders) | R | Compliance |
| Global pricing multiplier | W + audit | Commercial ops |
| Real-time dashboard widgets | R | Nice-to-have |

---

## 5. Write operations policy

### 5.1 Safe to open immediately (v2.0)

| Operation | API | Preconditions |
|-----------|-----|---------------|
| Credits adjust | `POST /admin/credits/adjust` | Already implemented; enable UI only; idempotency key required |
| Announcements CRUD | existing | Already in UI; keep audit |
| Recharge plans CRUD | existing | Already in UI; keep audit |
| Models CRUD / archive | existing | Already in UI; keep audit |

### 5.2 Must write `admin_audit_logs` (mandatory)

| Operation | `action` (proposed) | `resource_type` |
|-----------|---------------------|-----------------|
| Credits adjust | `credits.adjust` | `profile` |
| Model create/update/archive | `models.*` | `model` |
| Recharge plan mutations | `recharge_plans.*` | `recharge_plan` |
| Announcement mutations | `announcements.*` | `announcement` |
| API key revoke (future) | `api_keys.revoke` | `api_key` |
| Admin grant/revoke (future) | `admin_users.grant` / `.revoke` | `admin_user` |
| Settings patch (future) | `settings.patch` | `settings` |
| Channel patch (future) | `channels.patch` | `channel` |

**Rules:**

- Sanitized `request_payload` / `result_payload` — **no secrets**, no full API keys
- `idempotency_key` required on all POST/PATCH/DELETE
- Actor = `admin_users.user_id` + email

### 5.3 Not open in v2.0 (defer)

| Operation | Reason |
|-----------|--------|
| Bulk credits adjust | High blast radius |
| Delete users / hard delete keys | Irreversible |
| Channel switch without dry-run | Customer traffic risk |
| Model price bulk sync to prod without preview | Billing incidents |
| Service role or env exposure via settings API | Security |
| Maintenance mode **enforce** on gateway | Needs dedicated middleware + comms |

---

## 6. Admin v2 route design (web)

No v1 UI rewrites in planning phase. Target IA:

```
/admin
  /overview          (existing)
  /users             (+ detail drawer, adjust credits P0)
  /api-keys          (+ revoke P1)
  /models            (existing CRUD)
  /channels          (read → config P1)
  /pricing           (read → edit P1)
  /usage             (+ pagination)
  /logs              (existing)
  /credit-orders     (existing)
  /recharge-plans    (existing)
  /announcements     (existing)
  /credits           (existing)
  /settings          (read → edit P1)
  /audit-logs        (NEW P0)
  /admin-users       (NEW P1 — staff registry)
```

Secondary / back link unchanged: `/dashboard`.

---

## 7. DMIT admin API design (v2)

Base: `https://api.tokfai.com/admin` (not under `/v1`).

### 7.1 Read (extend v1)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/dashboard-summary` | Alias name in UI: "overview" |
| GET | `/users?email=&page=&limit=` | Pagination P0 |
| GET | `/usage?request_id=&page=` | Filters P0 |
| GET | `/logs?request_id=&page=` | Existing filter |
| GET | `/audit-logs?actor=&action=&page=` | **NEW P0** |

### 7.2 Write (phased)

| Method | Path | Phase | Audit |
|--------|------|-------|-------|
| POST | `/credits/adjust` | **Open UI P0** | yes |
| POST | `/api-keys/:id/revoke` | P1 | yes |
| PATCH | `/settings` | P1 | yes |
| POST/PATCH | `/admin-users` | P1 | yes |
| PATCH | `/channels/:id` | P2 | yes |

All writes: `Authorization: Bearer <supabase_access_token>`, `Idempotency-Key` header, `requireAdminV1`.

---

## 8. Permission model (v2 target)

```
┌─────────────┐     JWT      ┌──────────────┐   service_role   ┌───────────┐
│  Browser    │ ──────────► │  DMIT /admin │ ───────────────► │ Supabase  │
│  /admin UI  │             │ requireAdminV1│                  │ admin_*   │
└─────────────┘             └──────────────┘                  └───────────┘
       │                              │
       │ isAdminEmail (shell)         │ admin_users.status=active
       └──────────────────────────────┘
```

| Layer | v1 | v2 target |
|-------|----|-----------|
| Web shell | Email allowlist | Allowlist + `/admin/me` |
| DMIT | `admin_users` + legacy fallback | **Remove legacy fallback** (P1) |
| Roles | Binary | `role: superadmin \| support \| readonly` (P2) |
| RLS | No frontend access to admin tables | Unchanged |

**Never:** expose `SUPABASE_SERVICE_ROLE_KEY` to `apps/web`.

---

## 9. Audit log model

Existing table: `public.admin_audit_logs` (migration `0012`).

| Column | Usage |
|--------|-------|
| `actor_user_id`, `actor_email` | Who |
| `action` | What (e.g. `credits.adjust`) |
| `resource_type`, `resource_id` | Target |
| `idempotency_key` | Dedup |
| `request_payload`, `result_payload` | Sanitized JSON |
| `status` | pending / succeeded / failed |
| `credit_ledger_id` | Optional link |

**v2 additions:**

- `GET /admin/audit-logs` — paginated, filter by actor/action/date
- UI table at `/admin/audit-logs`
- Gate 7: every write in §5.2 produces a row (acceptance query)

---

## 10. Rollback plan

| Change type | Rollback |
|-------------|----------|
| Docs / scripts only | Revert commit; no deploy |
| New read APIs | Revert DMIT deploy; UI fails open (empty) |
| New write APIs | Feature flag env `ADMIN_V2_WRITES=0` → 503 on write routes |
| DB migration | Forward-only; disable code path reading new tables |
| Admin UI pages | Revert Vercel deployment |

**Emergency:** disable admin writes at DMIT middleware (allow GET only) without taking down Chat API.

---

## 11. Customer demo boundary

**Safe to demo (v1 + v2 read):**

- Admin overview, users, api-keys, models, pricing, logs (read-only)
- Credits adjust **only in staging** until Gate 7 sign-off

**Do not demo live:**

- API key revoke, channel switch, settings maintenance mode
- Bulk pricing changes, admin user grant/revoke
- Audit log deletion (should never exist)

See: [customer-demo-runbook.md](./customer-demo-runbook.md).

---

## 12. Test framework (this phase)

| Script | Purpose |
|--------|---------|
| `scripts/smoke-prod.mjs` | Pre-demo public + API smoke |
| `scripts/admin-auth-guard-smoke.mjs` | Gate 3 — auth must not穿透 |
| `scripts/admin-load-smoke.mjs` | Gate 4 — 10k admin read load |
| `scripts/load-test-chat.mjs` | Gate 5 — chat load (existing) |

Acceptance gates: [admin-v2-acceptance-gates.md](./admin-v2-acceptance-gates.md).

---

## 13. References

- Admin v1 commit: `b7b4bc7`
- Smoke/readiness: `1d22311`
- Demo runbook: `71d8cfe`
- Migrations: `0012_admin_security_base.sql`, `0013_admin_adjust_credits.sql`
- Middleware: `apps/dmit-api/src/middleware/requireAdminV1.ts`
