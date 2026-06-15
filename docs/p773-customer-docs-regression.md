# P773 — Dashboard docs link and copy regression

## Scope

Customer-facing `/dashboard/docs` and `/docs` handbook — links, anchors, copy
actions, i18n, mobile nav. No DMIT / billing / API changes.

## Checklist

| Item | Expected |
|---|---|
| Sidebar / nav anchors | Scroll to section `#id` with mobile header offset |
| Create API key | `/dashboard/api-keys` |
| Chat Playground | `/dashboard/playground` (onboarding section) |
| Batch API | `#batch-api` on docs page |
| Usage / Credits | `/dashboard/usage`, `/dashboard/credits` |
| Copy buttons | curl, SDK, Cursor, Cherry, quick-start fields |
| Internal terms | No P770/P769, docs paths, repo, artifact, runbook |
| i18n | No raw `integration.xxx` keys in EN/ZH |
| Mobile nav | Horizontal scroll chips; no overlay on body |

## Fixes (P773)

- Hash scroll handler + `scroll-mt` for mobile sticky header
- Nav uses horizontal scroll on small screens
- Footer links: Image Playground + Models (was self-referential docs link)
- `GuideHashLink` for same-page section jumps (Batch section, onboarding CTA)

## Verify

```bash
cd apps/web
npm run typecheck
npm run build
grep -R "P770\|P769\|docs/p\|artifact\|internal runbook\|production acceptance\|repo" apps/web/components apps/web/lib || true
```
