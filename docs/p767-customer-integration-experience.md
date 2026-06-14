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

## P767.1 — Dashboard first-run onboarding

### Deliverables

| Item | Location |
| --- | --- |
| First-run onboarding card | `apps/web/components/dashboard-first-run-onboarding.tsx` |
| Dashboard overview (top) | `apps/web/components/dashboard-overview-content.tsx` |
| API Keys page (top) | `apps/web/app/dashboard/api-keys/api-keys-client.tsx` |
| i18n | `dashboard.firstRun.*` (EN + ZH) |

### Card content

Highlights:

- Base URL: `https://api.tokfai.com/v1`
- Recommended model: `auto-fast`
- One API key for multiple models
- Usage and credits traceable by `request_id`

Flow steps (with checkmarks when detected):

1. Create API key
2. Chat Playground test (`hasChatPlaygroundSuccess`)
3. Integration docs (Cursor / Cherry links)
4. Check Usage (`requestsLast7Days > 0`)

### Action buttons

| Button | Target |
| --- | --- |
| Create API key | `/dashboard/api-keys#create-api-key` |
| Try Chat Playground | `/dashboard/playground` |
| View Cursor guide | `/dashboard/docs#cursor-integration` |
| View Cherry Studio guide | `/dashboard/docs#cherry-studio` |
| Check Usage | `/dashboard/usage` |
| View integration docs | `/dashboard/docs` |

Dashboard home hides the full card when all three signals are true (active key,
chat success, recent usage); shows a compact “complete” banner. API Keys page
shows the full card until the user has an active key (then compact complete).

### P767.1 acceptance checklist

| # | Check |
| --- | --- |
| 1 | `npm run typecheck` + `npm run build` (web) |
| 2 | Overview + API Keys show onboarding card — no raw i18n keys |
| 3 | All five primary buttons navigate correctly |
| 4 | Playground → Docs (Cursor/Cherry) → Usage path is clickable end-to-end |
| 5 | No billing / Stripe / webhook / ledger code changes |

### P767.1 acceptance record

```text
Date:
Operator:
Overview card visible: yes / no
API Keys card visible: yes / no
Create API key → Playground → Cursor guide → Usage: pass / fail
i18n raw keys observed: none / list
Sign-off:
```

---

## P767.2 — Wording polish & copyable configs

### Deliverables

| Item | Location |
| --- | --- |
| Product essentials bullets (unified wording) | `customer-integration-guide.tsx` |
| Copy config / Copy curl on Cursor, Cherry, OpenAI SDK | `CopyConfigAction` + `CodeBlock` |
| API Keys success card copy fields | `CopyableSnippetField` in `api-keys-client.tsx` |
| Snippet helpers | `customer-integration-snippets.ts` (`authorizationHeader`, config snippets) |
| i18n | `integration.copyConfig`, `integration.copyCurl`, `integration.essential*`, `dashboard.apiKeys.copyBaseUrl`, `copyAuthHeader` |

### Unified customer wording

- Base URL: `https://api.tokfai.com/v1`
- Recommended model: `auto-fast`
- One API key can route multiple upstream models
- Successful requests are charged; failed upstream requests are generally not charged
- Use `request_id` to trace Usage and Credits

### API Keys post-create copy actions

| Button | Copies |
| --- | --- |
| Copy Base URL | `https://api.tokfai.com/v1` |
| Copy Authorization header | `Authorization: Bearer <full secret>` |
| Copy curl test | Pre-filled `chat/completions` curl with user's secret |
| Copy full key | Full `sk-tokfai_…` secret |

### P767.2 acceptance checklist

| # | Check |
| --- | --- |
| 1 | `npm run typecheck` + `npm run build` (web) |
| 2 | `/dashboard/docs`: essentials bullets + Copy config / Copy curl on Cursor, Cherry, SDK |
| 3 | `/dashboard/api-keys`: post-create card Copy Base URL / Auth header / curl test work |
| 4 | No raw i18n keys on docs or API Keys pages |
| 5 | No billing / Stripe / webhook / ledger / DMIT API changes |

### P767.2 acceptance record

```text
Date:
Operator:
/dashboard/docs Copy config + Copy curl (Cursor / Cherry / SDK): pass / fail
/dashboard/api-keys copy fields (Base URL / Auth / curl): pass / fail
npm run typecheck: pass / fail
npm run build: pass / fail
i18n raw keys observed: none / list
Sign-off:
```

---

## P767.3 — Dashboard shell credits visibility & sticky navigation

### Deliverables

| Item | Location |
| --- | --- |
| Shell credits loader (profiles RLS read) | `apps/web/lib/dashboard-shell-credits.ts` |
| Header + sidebar credits UI | `apps/web/components/dashboard-credits-balance.tsx` |
| Sticky header (always sticky on desktop) | `apps/web/components/dashboard-header.tsx` |
| Sidebar credits badge + bottom summary | `apps/web/components/dashboard-nav.tsx` |
| Docs TOC sticky offset | `customer-integration-guide.tsx` |
| i18n | `dashboard.shell.*` (EN + ZH) |

### Behavior

| Surface | Display |
| --- | --- |
| Top bar | `Credits: {balance}` / `积分：{balance}` + Top up / 充值 |
| Load failure | `Credits: —` — page functions normally |
| Low balance (`< 1` credit) | `Low credits` / `积分较低` badge |
| Sidebar Credits nav | Label + monospace balance under menu item |
| Sidebar footer | Compact balance card + top up link |

### Layout

- Dashboard sidebar: `sticky top-0 h-svh` — does not scroll away
- Top header: `sticky top-0` on all breakpoints (removed `md:static`)
- Docs in-page TOC: `sticky top-20` with scrollable max-height

No billing / Stripe / webhook / ledger / DMIT debit logic changes.

### P767.3 acceptance checklist

| # | Check |
| --- | --- |
| 1 | `npm run typecheck` + `npm run build` (web) |
| 2 | `/dashboard`, `/dashboard/api-keys`, `/dashboard/docs`, `/dashboard/playground`, `/dashboard/credits` show header balance |
| 3 | Sidebar fixed on desktop; docs TOC sticky while scrolling |
| 4 | EN / ZH switch — no raw i18n keys |
| 5 | Credits load failure shows `—` without breaking page |
| 6 | No billing / Stripe / webhook / ledger / DMIT changes |

### P767.3 acceptance record

```text
Date:
Operator:
Header credits visible on all dashboard routes: pass / fail
Sidebar fixed + credits badge/footer: pass / fail
Docs scroll — header + TOC sticky: pass / fail
Low credits hint (< 1): pass / fail
i18n EN/ZH: pass / fail
npm run typecheck: pass / fail
npm run build: pass / fail
Sign-off:
```

---

## Related

- [P766.3 API key recovery](./p766-3-api-key-production-recovery.md)
- [P766.4 Provider health acceptance](./p766-4-provider-health-production-acceptance.md)
- [P760 Smart routing](./p760-smart-model-routing.md)
- [P762 Batch API](./p762-batch-chat-queue-mvp.md)
