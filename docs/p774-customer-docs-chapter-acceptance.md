# P774 — Customer docs chapter-by-chapter acceptance

## Chapter order (fixed)

1. Product positioning
2. Production onboarding flow
3. Quick start
4. API Key
5. Chat API
6. Image API
7. Batch API
8. Usage / Credits
9. Error codes
10. OpenAI SDK
11. Cursor
12. Cherry Studio
13. Industry API integration examples

Each chapter includes a four-field guide: purpose, copy, verify, failure.

## Industry examples (API integration only)

| ID | Scenario | API pattern |
|---|---|---|
| hospital | Chart assist / note structuring | Chat API (+ optional Batch) |
| automotive | Owner manual Q&A | Chat API |
| ecommerce | Bulk product copy | Batch API |
| support | Ticket triage drafts | Chat API |

Medical boundary on hospital card: AI assists documentation only — not diagnosis.

## CMS foundation

- `CustomerDocSection.chapterGuide` + block types in `customer-docs-content.ts`
- i18n strings in `messages.ts` (future Supabase CMS can replace static source)

## Verify

```bash
cd apps/web && npm run typecheck && npm run build
grep -R "P770\|P769\|P774\|docs/p\|artifact\|internal runbook\|production acceptance\|checklist artifact\|repo" apps/web/components apps/web/lib || true
```
