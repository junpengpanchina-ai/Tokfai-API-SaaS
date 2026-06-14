# P767 — Customer integration experience pack

Goal: customers with a new API key can integrate in **about 3 minutes** without
seeing upstream provider, GRSAI, or fallback internals.

Scope: **docs + dashboard UX only** — no billing core, Stripe, Supabase ledger,
or webhook changes.

---

## Deliverables

| Item | Location |
| --- | --- |
| Unified integration guide (TOC + 9 sections) | `apps/web/components/customer-integration-guide.tsx` |
| Copy-paste snippets | `apps/web/lib/customer-integration-snippets.ts` |
| Dashboard docs | `/dashboard/docs` → `CustomerIntegrationGuide` |
| Public docs | `/docs` → same guide (logged-out CTA to sign in) |
| API Keys post-create card | `apps/web/app/dashboard/api-keys/api-keys-client.tsx` |
| i18n (`integration.*`, `dashboard.apiKeys.*`) | `apps/web/lib/i18n/messages.ts` |

---

## Docs structure (customer manual)

Sidebar navigation:

1. **Quick Start** — key, base URL, `auto-fast`, first request
2. **curl examples** — chat + models list
3. **OpenAI SDK** — Node.js & Python
4. **Cursor integration** — steps + copyable config block
5. **Cherry Studio integration** — provider table
6. **Models guide** — `auto-fast` / `auto-pro` / `auto-cheap` customer wording
7. **Error codes** — stable `error.code` table (9 codes)
8. **Billing & Usage** — success debits, failures generally not charged, `request_id`
9. **Batch API guide** — create + poll curl

Unified messaging:

- Tokfai is an **OpenAI-compatible AI gateway**
- One key, multiple models, smart routing, usage tracking, credit billing
- Recommended first model: **`auto-fast`**
- Quality: **`auto-pro`** · Batch low-cost: **`auto-cheap`**

Legacy `DocsContent` / `QuickstartContent` remain in repo for reference; primary
customer path is `CustomerIntegrationGuide`.

---

## API Keys dashboard flow

After **Create API key** success:

| Element | Purpose |
| --- | --- |
| Base URL | `https://api.tokfai.com/v1` |
| Recommended model | `auto-fast` |
| Authorization header | `Bearer <full secret>` |
| curl example | Pre-filled with user's secret — **Copy curl** |
| Copy full key | Primary action |
| Try Chat Playground | Immediate test |
| View Docs | Integration guide |
| Cursor / Cherry guides | Deep links `#cursor-integration`, `#cherry-studio` |

Legacy keys (`can_reveal=false`): message **"Full key is not available. Create a new key."**
(`dashboard.apiKeys.fullKeyUnavailable`).

All UI strings use i18n — no raw keys like `dashboard.apiKeys.tryChatPlayground` in UI.

---

## Customer path (acceptance)

```text
Sign in
  → API Keys → Create key → Copy full key / Copy curl
  → Chat Playground (optional smoke)
  → Docs → Quick Start → Cursor / Cherry / SDK
  → Terminal: run copied curl → HTTP 200 + resolved model
  → Usage: request_id + credits_charged on success
```

---

## Acceptance checklist

| # | Check |
| --- | --- |
| 1 | `npm run typecheck` (web + dmit-api) |
| 2 | `npm run build` (web + dmit-api) |
| 3 | API Keys page: no untranslated i18n keys |
| 4 | Post-create card shows Base URL, model, auth header, curl |
| 5 | `/docs` and `/dashboard/docs` share TOC; links to Cursor / Cherry / SDK / curl |
| 6 | Error table lists 9 required codes |
| 7 | No changes to Stripe webhook, ledger RPCs, or DMIT billing routes |

---

## Related

- [P766.3 API key recovery](./p766-3-api-key-production-recovery.md)
- [P766.4 Provider health acceptance](./p766-4-provider-health-production-acceptance.md)
- [P760 Smart routing](./p760-smart-model-routing.md)
- [P762 Batch API](./p762-batch-chat-queue-mvp.md)
