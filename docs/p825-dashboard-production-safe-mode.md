# P825 — Dashboard production safe mode

## Status

**Active emergency safe mode** (P825). Deployed to stop client-side `Application error` /
`ReferenceError: Cannot access 'i' before initialization` on dashboard routes.

## What changed

Advanced dashboard tools are temporarily replaced with a **server-only safe fallback**
(`apps/web/lib/dashboard-safe/fallback-page.tsx`):

- Static title and description (no i18n provider)
- One-line curl example (chat or image where relevant)
- Links to API Keys, Usage, Credits, Docs, and public docs
- No client hooks, no `customer-*` modules, no model catalog, no shared copy components

### Routes in safe mode (fallback only)

| Route | Interactive UI |
|-------|----------------|
| `/dashboard/docs` | Fallback |
| `/dashboard/integration-workbench` | Fallback |
| `/dashboard/troubleshooting` | Fallback |
| `/dashboard/starter-templates` | Fallback |
| `/dashboard/payload-builder` | Fallback |
| `/dashboard/playground` | Fallback |
| `/dashboard/image-playground` | Fallback |
| `/dashboard/models` | Fallback |

### Routes still interactive

| Route | Notes |
|-------|--------|
| `/dashboard` | Overview |
| `/dashboard/api-keys` | Key management |
| `/dashboard/usage` | Usage ledger |
| `/dashboard/credits` | Credits & recharge |

## API availability

**The Tokfai API (`api.tokfai.com`) is unaffected.** Safe mode only degrades
dashboard browser UI. All endpoints, billing, credits RPC, and Stripe flows
continue to operate on the backend.

## Verification

After deploy, open each dashboard route in Chrome Incognito with DevTools console open.
Success = no `Application error`, no TDZ `ReferenceError`, no `ChunkLoadError`.

```bash
cd apps/web
npm run check:dashboard-imports
npm run typecheck
npm run build
```

## Next steps (P826)

Restore pages **one at a time** behind the dashboard-safe import boundary:

1. Re-enable route client bundle only when `check:dashboard-imports` passes
2. Confirm production chunk grep shows no banned strings for that route
3. Smoke-test in Incognito before enabling the next route

Do not re-import `customer-*` snippets, full i18n `messages`, `model-catalog`,
or shared `copy-code-block` / `copyable-snippet-field` into `app/dashboard` clients.
