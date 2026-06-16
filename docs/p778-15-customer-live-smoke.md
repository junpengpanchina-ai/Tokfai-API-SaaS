# P778.15 — Customer live smoke (internal project record)

> **Internal operator record only.** Do not surface this file or its steps in Dashboard UI or customer handbook text.
>
> **Customer path** = API Key + one-line curl + Dashboard Usage/Credits.  
> **Operator path** = `scripts/*.mjs`, JWT, ledger API probes — see `docs/p778-15-operator-smoke.md` (operator scripts).

---

## Customer live smoke checklist

| # | Step | Expected |
|---|------|----------|
| 1 | Dashboard → API Keys → Create API key | Success card shows full `sk-tokfai_…` secret once |
| 2 | Copy full key / Authorization / one-line Chat curl from success card | Clipboard contains real secret, not `sk-tokfai_xxx` |
| 3 | Open Dashboard → Docs → Quick Start | Session key auto-filled if key was just created |
| 4 | Copy Quick Start one-line chat curl | Single line, `Authorization: Bearer sk-tokfai_…` |
| 5 | Paste in any terminal (any directory) | HTTP 200 |
| 6 | Response JSON | `choices[0].message.content` present |
| 7 | Response JSON | `request_id` present |
| 8 | Response JSON | `credits_charged` present |
| 9 | Response JSON | `tokfai.requested_model` present |
| 10 | Response JSON | `tokfai.resolved_model` present |
| 11 | Dashboard → Usage | Search `request_id` — model / tokens / `credits_charged` match |
| 12 | Dashboard → Credits | Ledger reference / amount matches Usage |
| 13 | Revoke test key, rerun same curl | `invalid_token`, no new Usage debit |
| 14 | Create new key, rerun curl | HTTP 200 again |

---

## What customers never do

- `TOKFAI_SUPABASE_JWT` or any dashboard JWT in terminal
- `cd` into Tokfai repo or `/opt/…` paths
- Run `scripts/*.mjs` smoke tools
- Call internal `/me/usage` or ledger APIs manually (Dashboard UI only)

---

## Separation from operator smoke

| | Customer live smoke | Operator / internal smoke |
|---|---------------------|---------------------------|
| Auth | `sk-tokfai_…` API Key | Optional JWT + API Key for automation |
| Where documented | `/dashboard/docs`, API Keys UI | `docs/p778-*-operator*.md`, `scripts/p778-*` |
| Usage/Credits | Dashboard pages | Scripts may call DMIT `/me/*` for CI |
