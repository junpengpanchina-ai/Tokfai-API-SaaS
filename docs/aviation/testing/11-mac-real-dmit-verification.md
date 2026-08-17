# 11 — Mac Real DMIT Verification Runbook

```text
P1230-R1.5 L2/L3 — Mac Terminal
Execute only after human authorization.
Do not run from Cursor against production.
Never echo or paste the raw API key.
```

Canary workspace (already seeded on this Mac):

```text
.tokfai-canary/p1230-r15/input.txt
→ TOKFAI_P1230_R15_REAL_HTTP_OK
```

---

## Step 1 — Check env

```bash
cd /Users/p/Documents/GitHub/Tokfai-API-SaaS
test -n "$TOKFAI_API_KEY" && echo "TOKFAI_API_KEY=present" || echo "TOKFAI_API_KEY=MISSING"
export TOKFAI_BASE_URL="${TOKFAI_BASE_URL:-https://api.tokfai.com}"
echo "TOKFAI_BASE_URL=$TOKFAI_BASE_URL"
```

Load key from your secret store if needed (example — adjust to your vault):

```bash
# Prefer: export TOKFAI_API_KEY from 1Password / shell profile — never commit.
# Forbidden: echo "$TOKFAI_API_KEY"
```

---

## Step 2 — Check Codex CLI

```bash
command -v codex || command -v npx
# Prefer the "old Codex CLI" you already use with Tokfai /v1/responses.
# Record version only (no secrets):
codex --version 2>/dev/null || npx --yes @openai/codex --version 2>/dev/null || echo "CODEX_CLI=UNKNOWN_RECORD_MANUALLY"
```

Confirm model target for this canary:

```text
model: gemini-3-pro
base:  $TOKFAI_BASE_URL  (OpenAI-compatible / Responses)
auth:  Authorization: Bearer $TOKFAI_API_KEY
```

---

## Step 3 — `/v1/models`

```bash
curl -sS -o /tmp/p1230-r15-models.json -w "HTTP_STATUS=%{http_code}\n" \
  -H "Authorization: Bearer ${TOKFAI_API_KEY}" \
  -H "Content-Type: application/json" \
  "${TOKFAI_BASE_URL}/v1/models"

python3 - <<'PY'
import json
p="/tmp/p1230-r15-models.json"
with open(p) as f:
    d=json.load(f)
data=d.get("data") or d.get("models") or []
print("MODELS_COUNT=", len(data) if isinstance(data, list) else "non-list")
print("RESPONSE_KEYS=", sorted(d.keys())[:12])
PY
```

Expect: HTTPS, auth accepted, JSON list. Do not log Authorization.

Record:

```text
HTTP_STATUS=
REQUEST_ID=  (if present in headers / body — x-request-id etc.)
```

---

## Step 4 — Minimal Responses (text canary)

Low-cost text only. Keep prompt tiny; do not dump full prompt into shared logs.

```bash
curl -sS -D /tmp/p1230-r15-text.hdr -o /tmp/p1230-r15-text.json -w "HTTP_STATUS=%{http_code}\n" \
  -X POST "${TOKFAI_BASE_URL}/v1/responses" \
  -H "Authorization: Bearer ${TOKFAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro",
    "input": "Reply with exactly: P1230_R15_TEXT_OK",
    "stream": false
  }'

# Safe header extract (no Authorization):
grep -iE '^(HTTP/|x-request-id|x-tokfai|content-type)' /tmp/p1230-r15-text.hdr || true

python3 - <<'PY'
import json
d=json.load(open("/tmp/p1230-r15-text.json"))
print("id=", d.get("id"))
print("status=", d.get("status") or d.get("object"))
print("model=", d.get("model"))
# finish / incomplete hints without dumping output text:
print("keys=", sorted(d.keys())[:20])
PY
```

Record:

```text
HTTP_STATUS=
REQUEST_ID=
MODEL=
FINISH_STATE=
```

---

## Step 5 — Codex file tool canary

```bash
cd /Users/p/Documents/GitHub/Tokfai-API-SaaS/.tokfai-canary/p1230-r15
cat input.txt
# Must be exactly:
# TOKFAI_P1230_R15_REAL_HTTP_OK

# Configure Codex to use Tokfai base URL + TOKFAI_API_KEY + gemini-3-pro
# (use your existing working Codex→Tokfai config; do not invent a second gateway).
#
# Prompt intent (do not paste secrets):
#   Read input.txt via local tool
#   Then Write the same bytes to output.txt
#   No other files

# Example shape — adjust to your Codex CLI flags:
# codex ... --model gemini-3-pro  "Read input.txt and Write identical contents to output.txt"
```

Capture wall-clock window for DMIT correlation:

```bash
date -u +"SMOKE_START_UTC=%Y-%m-%dT%H:%M:%SZ" | tee smoke-window.txt
# ... run Codex canary ...
date -u +"SMOKE_END_UTC=%Y-%m-%dT%H:%M:%SZ" | tee -a smoke-window.txt
```

---

## Step 6 — diff

```bash
cd /Users/p/Documents/GitHub/Tokfai-API-SaaS/.tokfai-canary/p1230-r15
diff -u input.txt output.txt && echo "REAL_DMIT_CODEX_TOOL_FLOW_PASS=YES" || echo "REAL_DMIT_CODEX_TOOL_FLOW_PASS=NO"
```

---

## Step 7 — Collect requestId

From Codex / client logs, collect **ids only** (no prompts, no tool args, no Authorization):

```text
response_id_round1=
previous_response_id_round2=
request_id_round1=
request_id_round2=
```

If client does not surface requestId, note `REQUEST_ID_CLIENT=UNKNOWN` and rely on DMIT time window + model.

---

## Step 8 — Compare with DMIT logs

On Mac, paste only safe fields to the operator running
[12-dmit-real-http-observation.md](./12-dmit-real-http-observation.md):

```text
SMOKE_START_UTC=
SMOKE_END_UTC=
response_id_round1=
previous_response_id_round2=
request_id_*=
diff_result=PASS|FAIL
```

Joint pass requires both sides:

```text
Mac:  input.txt → output.txt PASS
DMIT: Round1 tool_calls + Round2 tool result resume → final
→ REAL_HTTP_TOOL_ROUNDTRIP_PASS=YES
```

---

## Billing (optional same session — test account preferred)

Before/after balance: record **delta only**, never account email / full ledger rows.

```text
REAL_BILLING_SMOKE_PASS=YES|NO|NOT_RUN
BILLING_DELTA_CREDITS=<number or UNKNOWN>
DUPLICATE_CHARGE=NO|YES|UNKNOWN
```

---

## Paste-back template (for Cursor after human run)

```text
REAL_DMIT_TEST_EXECUTED=YES
REAL_DMIT_CODEX_TOOL_FLOW_PASS=
REAL_HTTP_TOOL_ROUNDTRIP_PASS=
REAL_BILLING_SMOKE_PASS=
REAL_SUPABASE_STATE_DIRECT_CHECK=NOT_RUN|YES|NO
PROCESS_RESTART_DELTA=   # from DMIT side
HTTP_STATUS_MODELS=
HTTP_STATUS_TEXT=
REQUEST_IDS_SAFE=
```
