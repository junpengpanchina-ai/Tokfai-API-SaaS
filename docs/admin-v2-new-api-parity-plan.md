# Admin v2 — New API–class Parity Plan (Tokfai)

> **Scope:** Align Tokfai admin **capability model and information architecture** with a New API–class operations console.  
> **Out of scope:** Copying New API source, brand, logo, copy, or copyright.  
> **Phase stance:** P0 backend write parity + smoke gates. **Do not** change `apps/web` UI in this phase.

**Baseline (v1 stable):** commit `c2f0245` / tag `admin-v1-stable-c2f0245` — Admin shell + read-only pages, Demo Gate passed, prod smoke PASS, admin 10k load PASS with warnings.  
**Readiness:** `scripts/smoke-prod.mjs`, `docs/production-readiness-checklist.md`, `docs/customer-demo-runbook.md`.

---

## 1. New API–class capability matrix

Legend: **R** read · **W** write · **—** not present · **UI** web `/admin` · **API** DMIT `/admin/*`

| Capability area | New API–class expectation | Tokfai v1 UI | Tokfai API (this phase) | Tokfai v2 target |
|-----------------|---------------------------|--------------|-------------------------|------------------|
| **用户管理** Users | List, search, filter, view balance, adjust credits, suspend | R (list) | `GET /users` + `POST /credits/adjust` | R + gated W (adjust) |
| **API Key 管理** | Global keys, revoke, owner map, usage | R | `GET` + **`POST …/revoke` + `…/restore`** | R + revoke (audit) |
| **模型管理** Models | CRUD, enable/disable, upstream mapping | R + partial W UI | Full CRUD + **priority/status aliases** | R + controlled W |
| **渠道管理** Channels | Multi-upstream, weight, test, failover | R (env snapshot) | `GET` + **`PATCH` overlay** | R + config table (P1) |
| **模型定价** Pricing | Per-model input/output/image, multiplier | R | `GET` + **`PATCH /pricing/:modelId`** | R + edit (audit) |
| **用量日志** Usage | Filter, export, request_id search | R | `GET /usage` | R + pagination/filters |
| **错误日志** Error logs | Failed requests, upstream status | R | `GET /logs` | R + filters |
| **充值订单** Credit orders | Stripe orders, status filter | R | `GET /credit-orders` | R |
| **充值套餐** Recharge plans | CRUD, Stripe price sync | R + W UI | Full CRUD | W (existing, audit) |
| **公告管理** Announcements | CRUD, schedule visibility | R + W UI | CRUD + **publish/unpublish** | W (existing, audit) |
| **积分账本** Credits ledger | Per-user ledger lookup | R (by email) | `GET /credits?email=` | R + admin search |
| **系统设置** Settings | Site name, signup credits, maintenance | R (env snapshot) | `GET` + **`PATCH` allowlist overlay** | R + persisted settings (P1) |
| **管理员权限** Admin users | Grant/revoke admin, roles | — (layout allowlist) | `admin_users` + JWT | Registry UI + roles (P1) |
| **审计日志** Audit log | All admin writes, actor, payload | — | `admin_audit_logs` (writes) | R UI + `GET /audit-logs` (next) |

---

## 2. Completed in this phase (P0 backend writes)

### Stable GET routes (unchanged contract)

`/admin/dashboard-summary`, `/users`, `/api-keys`, `/models`, `/channels`, `/pricing`, `/usage`, `/credit-orders`, `/logs`, `/settings`, `/announcements`, `/recharge-plans`

### New / completed write APIs (all `requireAdminV1`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api-keys/:id/revoke` | Audit `api_keys.revoke`; never returns secret |
| POST | `/api-keys/:id/restore` | Audit `api_keys.restore`; never returns secret |
| PATCH | `/channels/:id` | Process-local overlay: enabled/status/priority/weight/base_url; always returns `base_url_masked` |
| PATCH | `/pricing/:modelId` | Pricing field aliases → models write path + audit |
| PATCH | `/settings` | Allowlisted only: `site_name`, `default_signup_credits`, `registration_enabled`, `maintenance_mode` |
| POST | `/announcements/:id/publish` | Sets `enabled=true` |
| POST | `/announcements/:id/unpublish` | Sets `enabled=false` |
| PATCH | `/models/:id` | Accepts `priority` (=sort_order) and `status` aliases |
| POST | `/credits/adjust` | Existing; RPC + audit |
| POST/PATCH/DELETE | `/models/*`, `/recharge-plans/*`, `/announcements/*` | Existing; audit |

### Safety rules enforced

- No service role / Stripe / GRSAI / full API key in responses
- Structured `{ error: { message, code, type } }` on write failures (no bare 500 bodies)
- `requestId` on structured logs for write paths
- Audit via `admin_audit_logs` when table write succeeds; logger fallback if insert fails
- Channels/settings overlays are **process-local** (reset on DMIT restart) — no schema migration

### Smoke / gates

| Script | Gate |
|--------|------|
| `scripts/admin-write-smoke.mjs` | **Gate 9** — dry-run default; live with `TOKFAI_ADMIN_WRITE_SMOKE=1` |
| `scripts/admin-load-smoke.mjs` | **Gate 10** — 10k reads, JWT fail-fast, per-endpoint PASS/WARN/FAIL |

---

## 3. Tokfai current capabilities (v1 UI + v2 API)

### Web (`apps/web` `/admin/*`) — **not modified this phase**

| Route | Status |
|-------|--------|
| `/admin/overview` | Read-only dashboard |
| `/admin/users` | Read-only list |
| `/admin/api-keys` | Read-only + revoke placeholder (disabled) |
| `/admin/models` | Read + existing model CRUD UI |
| `/admin/channels` | Read-only GRSAI snapshot |
| `/admin/pricing` | Read-only derived from models |
| `/admin/usage` | Read-only |
| `/admin/logs` | Read-only + request_id filter |
| `/admin/credit-orders` | Read-only |
| `/admin/recharge-plans` | Read + write (plans) |
| `/admin/announcements` | Read + write |
| `/admin/credits` | Ledger lookup by email |
| `/admin/settings` | Read-only snapshot |

### Permission model

1. **Web layout:** `isAdminEmail()` allowlist → else redirect `/dashboard`
2. **Client gate:** `GET /admin/me` → `is_admin`
3. **DMIT:** `requireAdminV1` → `admin_users` registry (+ legacy email fallback)

---

## 4. Remaining gaps (next phases)

| Gap | Impact | Notes |
|-----|--------|-------|
| Audit log **read** API + UI | Ops cannot review writes in UI | Table exists; no GET yet |
| Admin users management UI/API | Cannot grant/revoke without SQL | `admin_users` exists |
| Channels / settings **persistence** | Overlay lost on restart | Needs table (schema change — deferred) |
| Users: role, status, last_active | Incomplete user ops view | profiles fields limited |
| Usage/logs pagination at scale | 10k load risk | Fixed limits today |
| RBAC roles | Enterprise ops | Binary admin today |

---

## 5. Priority roadmap (updated)

### P0 — Done / in this commit

| Item | Status |
|------|--------|
| Controlled admin writes (keys, channels overlay, pricing, settings allowlist, publish) | **Done (API)** |
| Admin write smoke (dry-run + live flag) | **Done** |
| Admin 10k load smoke hardening (JWT fail-fast, per-endpoint) | **Done** |
| Credits adjust API | Already existed |
| Models / plans / announcements writes + audit | Already existed |

### P1 — Next

| Item | Type |
|------|------|
| `GET /admin/audit-logs` | R API + UI |
| Persist settings / channels tables | W + audit |
| Admin users CRUD API + UI | W + audit |
| Enable credits adjust / key revoke in web UI | UI only |
| User list: search, pagination | R |

### P2 — Advanced

RBAC, channel weighted routing, CSV export, global pricing multiplier.

---

## 6. Write operations policy

### Must write `admin_audit_logs` (or structured logger fallback)

| Operation | `action` | `resource_type` |
|-----------|----------|-----------------|
| Credits adjust | `credits.adjust` | `profile` |
| Model create/update/archive | `models.*` | `model` |
| Pricing patch | `model_pricing.update` / via models | `model_pricing` |
| Recharge plan mutations | `recharge_plans.*` | `recharge_plan` |
| Announcement mutations | `announcements.*` | `announcement` |
| API key revoke/restore | `api_keys.revoke` / `.restore` | `api_key` |
| Settings patch | `settings.patch` | `settings` |
| Channel patch | `channels.patch` | `channel` |

**Rules:**

- Sanitized payloads — **no secrets**, no full API keys
- Prefer `Idempotency-Key` on POST/PATCH/DELETE
- Actor = `admin_users.user_id` + email
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to `apps/web`

### Deferred (not open)

Bulk credits, hard-delete users/keys, channel switch affecting live traffic without dry-run, maintenance mode **enforcement** on gateway.

---

## 7. Rollback plan

| Change type | Rollback |
|-------------|----------|
| Docs / scripts only | Revert commit; no deploy |
| New write APIs | Revert DMIT deploy; GET routes remain |
| Process overlays | Restart DMIT clears channels/settings overlays |
| Emergency | Disable admin writes at middleware (GET only) |

---

## 8. Test framework

| Script | Purpose |
|--------|---------|
| `scripts/smoke-prod.mjs` | Pre-demo public + API smoke |
| `scripts/admin-auth-guard-smoke.mjs` | Gate 3 — auth must not穿透 |
| `scripts/admin-write-smoke.mjs` | **Gate 9** — write dry-run / live smoke |
| `scripts/admin-load-smoke.mjs` | **Gate 10** — 10k admin read load |
| `scripts/load-test-chat.mjs` | Gate 5 — chat load |

Acceptance gates: [admin-v2-acceptance-gates.md](./admin-v2-acceptance-gates.md).

---

## 9. References

- Admin v1 stable: `c2f0245` / `admin-v1-stable-c2f0245`
- Admin v1 UI: `b7b4bc7`
- Migrations: `0012_admin_security_base.sql`, `0013_admin_adjust_credits.sql`
- Middleware: `apps/dmit-api/src/middleware/requireAdminV1.ts`
