# P987S — Summarize Git Diff Stability Report

> Converges intermittent LIVE 504 on `cursor_read_summarize_git_diff`.
> Does not claim fully tools compatible. Does not treat 504 as PASS.

## Result: **STABLE (this run)**

Generated: 2026-07-30T16:06:10.599Z
Mode: offline mock

## Root cause (observed)

- LIVE `auto-fast` alias can intermittently 504 on light text-agent summarization.
- PM2 stayed healthy; billing did not charge on failure.

## Stability strategy (harness / text-agent)

1. Compress / truncate diff input (`P987_DIFF_MAX_CHARS`, default 1200).
2. Prefer stable chat model `gemini-2.5-flash` (`P987_SUMMARIZE_MODEL`).
3. On transient 504/timeout/busy: **one** lightweight fallback request (shorter prompt).
4. If fallback still fails: keep OpenAI-compatible error envelope; **FAIL** (never fake 200).
5. Failure path must stay `not_billable` / `credits_charged=0`.
6. Success path still requires usage + request_id + routing evidence + charged credits.

## This run — summarize case

| Field | Value |
|---|---|
| verdict | PASS |
| kind | 200_content_success |
| http | 200 |
| billing | charged |
| credits | 0.000001 |
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
