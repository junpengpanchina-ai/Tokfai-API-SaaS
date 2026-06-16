# P784.1 — One-line curl customer copy acceptance (internal)

> **Internal only.** Customer UI must not reference P784.1 or this doc.

**Suite:** `p784-1-one-line-curl-customer-copy`  
**Date:** 2026-06-14  
**Scope:** `apps/web` copy UX only — no billing / backend changes.

## Unified copy rules

| Rule | Status |
|------|--------|
| Default Copy = one-line bash curl (single-quote JSON) | PASS |
| PowerShell = separate `curl.exe` one-line | PASS |
| Multiline curl = display only, no copy button | PASS |
| No `export TOKFAI_API_KEY` / `export TOKFAI_API_BASE` in customer copy | PASS |
| Session `quickStartApiKey` auto-injected when Key created | PASS |
| Placeholder `sk-tokfai_xxx` + create Key hint when no session | PASS |
| Success fields documented | PASS |
| Usage/Credits reconcile path documented | PASS |

## Per-entry acceptance matrix

| Location | Default Copy button | One-line | Any dir | No cd/repo/env | Session key | Placeholder hint | bash | PowerShell |
|----------|---------------------|----------|---------|----------------|-------------|------------------|------|------------|
| API Keys success card | Copy one-line Chat curl | PASS | PASS | PASS | PASS (real secret) | — | PASS | PASS (new button) |
| Docs Quick Start | Copy one-line curl | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| API Key chapter panel | Copy one-line curl | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Chat API chapter panel | Copy one-line curl | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Image API chapter panel | Copy one-line curl | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Batch API chapter panel | Copy one-line curl (create/poll) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| OpenAI SDK chapter | Copy one-line Chat curl button | PASS | PASS | PASS | PASS | PASS | PASS | pending in panel* |
| Cursor chapter | Copy one-line curl (verify first) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Cherry Studio chapter | Copy one-line curl (verify first) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Industry examples | Copy one-line curl per scenario | PASS | PASS | PASS | PASS | PASS | PASS | — |
| Client software acceptance | bash + PowerShell fields | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Readable code blocks (docs) | No copy (display only) | — | — | — | — | — | display multiline | — |

\*OpenAI SDK primary copy is SDK config/code; one-line Chat curl action retained on panel.

## Success response (customer docs)

- `choices[0].message.content`
- `request_id`
- `credits_charged`
- `tokfai.requested_model`
- `tokfai.resolved_model`

## Reconciliation path (customer docs)

1. Copy `request_id` from JSON response
2. Dashboard → Usage → search `request_id`
3. Dashboard → Credits → search `reference_id` or `request_id`

## Live test — macOS Terminal / zsh

| Check | Result |
|-------|--------|
| One-line command (line count = 1) | PASS |
| Paste any directory | PASS (no cd) |
| API reachable | PASS (401 `invalid_token` with placeholder key) |
| HTTP 200 with real key | PENDING MANUAL (requires customer Key) |

Example one-line (bash):

```bash
curl -sS https://api.tokfai.com/v1/chat/completions -H "Authorization: Bearer sk-tokfai_xxx" -H "Content-Type: application/json" -d '{"model":"auto-fast","messages":[{"role":"user","content":"Say ok only."}],"stream":false}'
```

## PowerShell

| Check | Result |
|-------|--------|
| `curl.exe` one-line in Quick Start / chapter panels | PASS |
| Windows live HTTP 200 | PENDING MANUAL |

## Verification

```bash
node scripts/p778-docs-customer-visible-grep.mjs  # 0 hits
cd apps/web && npm run typecheck && npm run build
```

## Backend boundary

No changes to billing, Stripe, Supabase, `apps/dmit-api`, or debit logic.
