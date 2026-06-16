# P784 — Real Software Client-by-Client Live Acceptance (internal)

> **Internal only.** Customer UI must not reference P784, scripts, or this doc.

**Suite:** `p784-real-software-client-live-acceptance`  
**Timestamp:** 2026-06-14  
**Scope:** `apps/web` customer docs + copy blocks only. No billing / backend changes.

## Summary

| Result | Count |
|--------|-------|
| PASS | 4 |
| PENDING MANUAL | 6 |
| FAIL | 0 |

---

## Acceptance matrix

### 1. macOS Terminal / zsh — **PASS** (manual)

| Field | Value |
|-------|-------|
| Copy from | Dashboard API Keys success card or Docs Client software acceptance |
| Paste | Any directory in Terminal / zsh |
| Install | No |
| cd / repo / env | No cd, no repo; curl needs no env vars (Key in curl header) |
| HTTP 200 | Yes (manual screenshot) |
| Response fields | `choices`, `request_id`, `credits_charged`, `tokfai.requested_model`, `tokfai.resolved_model` |
| Usage/Credits | Search `request_id` in Usage; match `reference_id` in Credits |
| Failure signal | HTTP 401 `invalid_token` → fix Key; non-200 → check Base URL `/v1` |
| Repo dependency | No |
| cd dependency | No |

### 2. Windows PowerShell — **PENDING MANUAL**

| Field | Value |
|-------|-------|
| Copy from | Docs → Client software acceptance → PowerShell curl.exe line |
| Paste | Windows PowerShell, any directory |
| Install | No |
| cd / repo / env | No |
| Automated checks | Single-line format PASS; JSON escape PASS (see `p784-windows-powershell-acceptance.md`) |
| Live HTTP 200 | PENDING MANUAL (no Windows host in this run) |
| Usage/Credits | Same as macOS |
| Conclusion | Copy block PASS; live run PENDING MANUAL |

### 3. Linux / Git Bash — **PASS** (format + API reachability)

| Field | Value |
|-------|-------|
| Copy | Same bash one-line as macOS |
| Live test | `curl` with invalid key → HTTP 401 `invalid_token` (proves endpoint + one-line format) |
| Full PASS fields | PENDING MANUAL with customer Key (same as macOS manual PASS) |

### 4. OpenAI SDK Node.js — **PASS** (install/run) / **PENDING MANUAL** (HTTP 200)

| Field | Value |
|-------|-------|
| Test dir | `/tmp/tokfai-p784-live` (empty, not Tokfai repo) |
| Copy from | Docs Client software acceptance / OpenAI SDK chapter |
| Steps | `npm init -y` → `npm install openai` → save `tokfai-test.mjs` → `TOKFAI_API_KEY=... node tokfai-test.mjs` |
| Install | Yes (`npm init -y`, `npm install openai`) |
| cd / repo | Any empty folder; no Tokfai repo |
| Env | `TOKFAI_API_KEY` only |
| Install/run | PASS |
| HTTP 200 + billing fields | PENDING MANUAL (no Key in test env; fake key → 401) |
| Expected output | content, `request_id`, `credits_charged`, `requested_model`, `tokfai.resolved_model` |

### 5. OpenAI SDK Python — **PASS** (install/run) / **PENDING MANUAL** (HTTP 200)

| Field | Value |
|-------|-------|
| Test dir | `/tmp/tokfai-p784-live` |
| Steps | `python3 -m venv .venv` → `source .venv/bin/activate` → `pip install openai` → `tokfai_test.py` |
| Install | Yes (venv + pip) |
| cd / repo | Any empty folder |
| Env | `TOKFAI_API_KEY` only |
| Install/run | PASS |
| HTTP 200 + billing fields | PENDING MANUAL (fake key → 401) |

### 6. Cursor — **PENDING MANUAL**

| Field | Value |
|-------|-------|
| Docs fields | Provider type: OpenAI compatible / Custom OpenAI; Base URL `https://api.tokfai.com/v1`; API Key `sk-tokfai_xxx`; Model `auto-fast` |
| First step | One-line curl HTTP 200 before Cursor |
| Troubleshoot order | curl 200? → Base URL `/v1`? → full Key? → `auto-fast`? → stream off? |
| Usage/Credits | `request_id` search |
| Live Cursor chat | PENDING MANUAL (requires IDE + customer Key) |
| Copy block | PASS (fields verified in `customer-cursor-chapter.ts`) |

### 7. Cherry Studio — **PENDING MANUAL**

| Field | Value |
|-------|-------|
| Docs fields | Provider name Tokfai; type OpenAI compatible / Custom OpenAI; Base URL `/v1`; Model `auto-fast`; Stream off if fail |
| Usage/Credits | `request_id` |
| Live Cherry chat | PENDING MANUAL |
| Copy block | PASS |

### 8. Image API — **PENDING MANUAL**

| Field | Value |
|-------|-------|
| Copy | One-line image curl, `response_format: url` |
| Format | Single-line bash curl PASS |
| Success fields | `data[0].url`, `request_id`, `credits_charged`, `model` |
| Image Playground | Success area has Copy `request_id` (UI verified in code) |
| Live HTTP 200 | PENDING MANUAL (no Key) |

### 9. Batch API — **PENDING MANUAL**

| Field | Value |
|-------|-------|
| Copy | create + poll + items one-line curls |
| Success fields | batch `id`, `status`, `total_items`, `succeeded_items`, `credits_charged`; item `request_id`, `status`, `credits_charged`, `error_code` |
| Reconciliation | Succeeded items debit; failed/cancelled usually no debit |
| Live batch job | PENDING MANUAL (no Key) |

### 10. Usage / Credits — **PASS** (UI + docs)

| Field | Value |
|-------|-------|
| Usage | `request_id` filter in `UsageQuerySection` |
| Credits | `reference_id` filter in `CreditsContentClient` |
| Docs | Usage = request detail; Credits = ledger; success debits, failures usually not |
| Live reconcile | PENDING MANUAL (needs live `request_id` from chat run) |

---

## Verification commands (internal)

```bash
node scripts/p778-docs-customer-visible-grep.mjs   # must be 0 hits
cd apps/web && npm run typecheck && npm run build
```

## Customer-visible grep

**PASS (0 hits)** in `apps/web/components` + `apps/web/lib`.

## Backend boundary

No changes to billing, Stripe, Supabase migrations, `apps/dmit-api`, or debit logic.
