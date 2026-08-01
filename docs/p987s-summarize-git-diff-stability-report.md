# P987S — Summarize Git Diff Stability Report

> Converges intermittent LIVE 504 on `cursor_read_summarize_git_diff`.
> Scope: `summarizeGitDiffStable` harness only — no billing / catalog / public chat changes.
> Does not claim fully tools compatible. Does not treat 504 as PASS.

## Result: **STABLE (this run)**

Generated: 2026-08-01T04:50:27.113Z
Mode: offline mock

## Root cause (observed)

- LIVE `auto-fast` alias can intermittently 504 on light text-agent summarization.
- PM2 stayed healthy; billing did not charge on failure.

## Stability strategy (harness / text-agent)

1. Compress / truncate diff input (`P987_DIFF_MAX_CHARS`, default 1200).
2. Primary model via `P987_SUMMARIZE_MODEL` (default stable chat model `gemini-2.5-flash`, not auto-*).
3. On transient 504/timeout/busy: **one** lightweight fallback (`P987_SUMMARIZE_FALLBACK_MODEL`, short prompt, `max_tokens=32`).
4. If fallback still fails: OpenAI-compatible error envelope with `status=504`, `billing_status=not_billable`, `credits_charged=0`; **FAIL** (never fake 200).
5. Success path still requires usage + request_id + routing evidence + charged credits.

## Env (this run)

| knobs | value |
|---|---|
| P987_SUMMARIZE_MODEL | `gemini-2.5-flash` |
| P987_SUMMARIZE_FALLBACK_MODEL | `gemini-2.5-flash` |
| P987_DIFF_MAX_CHARS | 1200 |

## This run — summarize case

| Field | Value |
|---|---|
| verdict | PASS |
| kind | 200_content_success |
| http | 200 |
| billing | charged |
| credits | 0.000001 |
| usage | true |
| request_id | `req_mock_405751f9265f4cf9` |
| routing_ok | true |
| reason | stable_ok primary=gemini-2.5-flash diff_chars=65 |

## Continuous acceptance

After deploy, run 5 consecutive LIVE rounds; all must print:

```
Cases=9
blockers=0
fails=0
TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS
```

```bash
for i in 1 2 3 4 5; do
  echo "=== P987S round $i ==="
  LIVE=1 BASE=https://api.tokfai.com/v1 TOKFAI_API_KEY=sk-tokfai_... \
    node scripts/p987-agent-runtime-compatibility-smoke.mjs || exit 1
done
```
