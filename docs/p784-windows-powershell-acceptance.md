# P784 — Windows PowerShell acceptance (internal)

> **Internal only.** Customer UI must not reference P784 or this doc.

## Environment

| Field | Value |
|-------|-------|
| Test OS | macOS darwin (PowerShell curl **not executed** on Windows in this run) |
| API base | `https://api.tokfai.com/v1` |
| Model | `auto-fast` |
| API Key | Customer `sk-tokfai_xxx` (replace before run) |

## Customer copy source

- Docs → Client software acceptance → **Windows PowerShell — curl.exe one-line**
- Quick Start / Chat API one-line curl blocks (PowerShell variant when shown)
- API Keys success card → Copy one-line Chat curl (bash); use Docs panel for PowerShell

## Full PowerShell one-line command

Paste in **Windows PowerShell** from **any directory**. Use `curl.exe` (not the `Invoke-WebRequest` alias).

```powershell
curl.exe -sS "https://api.tokfai.com/v1/chat/completions" -H "Authorization: Bearer sk-tokfai_xxx" -H "Content-Type: application/json" -d "{\"model\":\"auto-fast\",\"messages\":[{\"role\":\"user\",\"content\":\"Say ok only.\"}],\"stream\":false}"
```

Replace `sk-tokfai_xxx` with your full API Key secret.

## JSON escape validation (automated)

| Check | Result |
|-------|--------|
| Command is single line | PASS |
| `-d` JSON parses after `\"` unescape | PASS |
| No bash single-quote body in PowerShell block | PASS |

## Live run on Windows

| Check | Result |
|-------|--------|
| HTTP 200 | **PENDING MANUAL** — no Windows host in CI |
| `choices` | PENDING MANUAL |
| `request_id` | PENDING MANUAL |
| `credits_charged` | PENDING MANUAL |
| `tokfai.requested_model` | PENDING MANUAL |
| `tokfai.resolved_model` | PENDING MANUAL |

## Customer failure signals

| Symptom | Likely cause |
|---------|----------------|
| `Invoke-WebRequest` error | Used `curl` alias — use `curl.exe` |
| JSON parse error | Line broken across lines — copy full one-line from Docs |
| HTTP 401 `invalid_token` | Wrong or truncated Key — recreate on API Keys |
| HTTP 401 `missing_token` | Authorization header missing |

## Reconciliation

Copy `request_id` from JSON → Dashboard **Usage** (search `request_id`) → **Credits** (search `reference_id` / `request_id`).

## Conclusion

**PENDING MANUAL** on Windows live HTTP 200. Copy format and JSON escaping **PASS** (verified programmatically).
