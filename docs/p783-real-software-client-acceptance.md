# P783 — Real Software Client-by-Client Acceptance (internal)

> **Internal only.** Customer UI must not reference P783, scripts, repo paths, or this doc.

## Scope

- **In scope:** `apps/web` docs, copy blocks, API Keys success card, i18n.
- **Out of scope:** billing, Stripe, Supabase migrations, `apps/dmit-api`, debit logic.

## Acceptance matrix

| # | Client | Customer path | Success criteria | JWT? | Manual? | Copy-only? |
|---|--------|---------------|------------------|------|---------|------------|
| 1 | macOS Terminal / zsh | Docs → Client software acceptance; API Keys success card | HTTP 200; `choices`, `request_id`, `credits_charged`, `tokfai.resolved_model` | No | Yes (paste curl) | No |
| 2 | Windows PowerShell | Same; `curl.exe` one-line | Same | No | Yes | No |
| 3 | Linux / Git Bash | Bash one-line curl | Same | No | Yes | No |
| 4 | OpenAI SDK Node.js | New empty dir; `npm install openai`; runnable file from docs | Prints content, `request_id`, `credits_charged`, `tokfai.resolved_model` | No | Yes | Partial (verify copy blocks) |
| 5 | OpenAI SDK Python | `pip install openai`; runnable file from docs | Same | No | Yes | Partial |
| 6 | Cursor | Provider OpenAI-compatible; base `https://api.tokfai.com/v1`; model `auto-fast` | Chat works; reconcile via Usage/Credits `request_id` | No | Yes | Partial (config copy) |
| 7 | Cherry Studio | Provider Tokfai; OpenAI compatible; same base URL/model | Same; disable stream if needed | No | Yes | Partial |
| 8 | Image API | One-line image curl; `response_format: url` | `data[0].url`, `request_id`, `credits_charged` | No | Yes | Partial |
| 9 | Batch API | Create + poll one-line curls | Batch id, `completed`, items with `request_id`; succeeded debited | No | Yes | Partial |
| 10 | Usage / Credits | Dashboard Usage search `request_id`; Credits `reference_id` / `request_id` | Chat, Image, Batch reconcile | No (session) | Yes | No |

## Verification commands (internal)

```bash
# Customer-visible grep — must be 0 hits in apps/web/components + apps/web/lib
node scripts/p778-docs-customer-visible-grep.mjs

cd apps/web && npm run typecheck && npm run build
```

## Customer-visible locations

- Docs chapter: `client-software-acceptance` (`/docs` integration guide)
- Component: `ClientSoftwareAcceptanceCopyPanel`
- API Keys success card copy buttons and doc links

## Notes

- Do not expose `TOKFAI_SUPABASE_JWT` or DMIT in customer copy.
- PowerShell uses `curl.exe` with escaped double quotes inside JSON.
- Bash/zsh uses single-quoted JSON body for one-paste runs from any directory.
