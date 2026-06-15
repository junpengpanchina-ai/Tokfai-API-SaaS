# P772 — Customer docs cleanup + editable docs foundation

## Goal

Remove internal engineering artifacts from customer-visible `/dashboard/docs` and
`/docs`, rewrite copy for integrators, and introduce a static content layer that
can later be replaced by Supabase CMS / admin editing.

## Scope

- `apps/web` only — components, i18n, `lib/docs/customer-docs-content.ts`
- No changes to DMIT, billing, Stripe, API keys backend, Image API, or database

## Customer-visible cleanup

Removed or replaced:

| Internal term | Customer replacement |
|---|---|
| `docs/p770-production-demo-flow.md` | Follow steps on this page |
| `P770` / `P769` | (removed) |
| `production acceptance` / 生产验收 | Production onboarding / 生产接入 |
| `repo` / 仓库 | (removed) |
| `checklist artifact` / artifact | (removed) |
| `companion docs` / internal runbook | (removed) |
| `see docs/xxx.md` | On-page onboarding steps |

## Content abstraction

`apps/web/lib/docs/customer-docs-content.ts` defines:

- `CustomerDocSection` — id, title/description i18n keys, blocks
- Block types: `paragraph`, `bullets`, `ordered`, `code`, `copy-fields`,
  `error-table`, `model-list`, `dashboard-links`
- `CUSTOMER_DOC_SECTIONS` — ordered handbook sections
- Snippet registry keyed for curl / SDK / IDE config blocks

`CustomerIntegrationGuide` renders from this structure; i18n strings remain in
`messages.ts` for now.

## Section order (customer handbook)

1. Product positioning
2. Production onboarding flow
3. Quick start
4. curl examples (chat, models, batch create, batch poll)
5. OpenAI SDK
6. Cursor (config fields only)
7. Cherry Studio (config fields only)
8. Models guide
9. Error codes (9 stable codes aligned with DMIT)
10. Billing & Usage
11. Batch API

## Verification

```bash
cd apps/web
npm run typecheck
npm run build
grep -Ri "p770\|P770\|p769\|P769\|production-demo-flow.md\|artifact\|companion docs\|repo" apps/web/components apps/web/lib || true
```

Grep should not match customer-facing strings (dev doc `docs/p772-*.md` is OK).
