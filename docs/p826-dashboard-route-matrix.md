# P826 — Dashboard route matrix (import safety)

Generated during P826 landmine removal. **Safe** = no banned imports in route
`page.tsx` + route-local clients; shell uses `dashboard-safe` labels only.

| Route | Page mode | Client bundle | Import status |
|-------|-----------|---------------|---------------|
| `/dashboard` | Interactive overview | `dashboard-overview-content` | Safe — `useDashboardLabels` |
| `/dashboard/api-keys` | Interactive | `api-keys-client` | Safe — `dashboard-safe` labels/copy |
| `/dashboard/usage` | Interactive | `usage-view-client` | Safe — `dashboard-safe` labels/copy |
| `/dashboard/credits` | Interactive | `credits-content-client` | Safe — `dashboard-safe` labels/copy |
| `/dashboard/announcements` | Interactive | `dashboard-announcements-list` | Safe — `useDashboardLabels` |
| `/dashboard/playground` | **Restored** (P826.1) | `playground-client` + route-local modules | Safe — route-local labels/models |
| `/dashboard/image-playground` | **Restored** (P826.2) | `image-playground-client` + route-local | Safe — route-local labels/models |
| `/dashboard/models` | **Restored** (P826.3) | `models-client` | Safe — server `models-page-server` + dashboard-safe UI |
| `/dashboard/docs` | P825 server fallback | None (RSC) | Safe — `fallback-page` only |
| `/dashboard/integration-workbench` | P825 server fallback | None (RSC) | Safe |
| `/dashboard/starter-templates` | P825 server fallback | None (RSC) | Safe |
| `/dashboard/payload-builder` | P825 server fallback | None (RSC) | Safe |
| `/dashboard/troubleshooting` | P825 server fallback | None (RSC) | Safe |

## Shared layout (all dashboard routes)

| Module | Status |
|--------|--------|
| `dashboard-shell-nav` | Safe — `useDashboardLabels`, `DashboardLanguageSwitcher` |
| `dashboard-footer` | Safe |
| `dashboard-credits-balance` | Safe |
| `auth-success-toast` | Safe |
| Root `I18nProvider` (marketing/docs) | Still on `app/layout` — dashboard shell does **not** call `useI18n` |

## Restore priority (P826)

| Step | Route | Status |
|------|-------|--------|
| A | `/dashboard/playground` | Restored |
| B | `/dashboard/image-playground` | Restored |
| C | `/dashboard/models` | Restored |
| D | `/dashboard/payload-builder` | Server fallback (P825 baseline) |
| E | `/dashboard/starter-templates` | Server fallback |
| F | `/dashboard/troubleshooting` | Server fallback |
| G | `/dashboard/integration-workbench` | Server fallback |
| H | `/dashboard/docs` | Server fallback |

D–H remain on P825 server fallback until interactive rebuilds land behind
`check:dashboard-imports`.

## Verification

```bash
cd apps/web
npm run check:dashboard-imports
npm run typecheck
npm run build
```

After deploy: Chrome Incognito, console open on every route above — no
Application error, no TDZ `ReferenceError`, no ChunkLoadError.
