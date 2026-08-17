# 12 — DMIT Real HTTP Observation (READ ONLY)

```text
P1230-R1.5 — DMIT SSH Terminal
READ_ONLY_OBSERVATION=TRUE
Forbidden: pm2 restart | reload | stop | delete
Forbidden: npm install on production
Forbidden: edit .env | nginx | ecosystem
Forbidden: DB writes / migrations / balance edits
```

Correlate with Mac paste-back from
[11-mac-real-dmit-verification.md](./11-mac-real-dmit-verification.md).

---

## Step A — SSH (operator-specific)

```bash
# Use your normal jump host / SSH alias. Example only:
# ssh tokfai-dmit
hostname
pwd
whoami
date -u +"OBS_UTC=%Y-%m-%dT%H:%M:%SZ"
```

---

## Step B — Process discovery (do not assume name)

```bash
pm2 ls
# Look for the API process that serves api.tokfai.com.
# Repo contract: name tokfai-api (legacy dmit-api may exist on older hosts).
# Record the exact name you see — do not invent.
```

Capture before smoke (safe fields only):

```bash
# Replace NAME with the process name from pm2 ls
NAME=tokfai-api

pm2 show "$NAME" | egrep -i 'status|restarts|uptime|memory|cpu|script path|pid|created at|exec cwd'
```

Optional JSON extract:

```bash
NAME=tokfai-api
pm2 jlist | python3 -c 'import json,sys; name=sys.argv[1]; apps=json.load(sys.stdin)
for a in apps:
  if a.get("name")==name:
    m=a.get("monit") or {}; pm=a.get("pm2_env") or {}
    print("status=", pm.get("status")); print("restarts=", pm.get("restart_time"))
    print("cpu=", m.get("cpu")); print("memory=", m.get("memory")); break
else: print("PROCESS_NOT_FOUND")' "$NAME"
```
Record:

```text
BEFORE_STATUS=
BEFORE_RESTARTS=
BEFORE_UPTIME=
BEFORE_CPU=
BEFORE_MEMORY=
```

---

## Step C — Safe log observation

Identify log paths from `pm2 show` (out/err). Then search **only** safe markers in the Mac smoke time window:

```bash
# Example — adjust paths from pm2 show:
# OUT=~/.pm2/logs/tokfai-api-out.log
# ERR=~/.pm2/logs/tokfai-api-error.log

# Prefer: rg with time window + requestId if Mac provided one.
# Forbidden patterns to print: Authorization, API key, prompt body, tool args, client source paths.

rg -n "cursor_tool_request_received|upstreamReturnedToolCalls|responses_tool_state_saved|incomingToolMessageCount|finish_reason|requestId|request_id" \
  ~/.pm2/logs/tokfai-api-out.log ~/.pm2/logs/tokfai-api-error.log 2>/dev/null | tail -n 80
```

If Mac provided `request_id_*` / `response_id_*`:

```bash
RID='paste-safe-id-here'
rg -n "$RID" ~/.pm2/logs/tokfai-api-out.log ~/.pm2/logs/tokfai-api-error.log 2>/dev/null | tail -n 40
```

Expected chain for tool canary (conceptual):

```text
Round 1:
  cursor_tool_request_received
  upstreamReturnedToolCalls (true / tool path)
  responses_tool_state_saved

Round 2:
  incomingToolMessageCount > 0
  resume / final finish_reason
```

Do **not** print message/tool payloads.

---

## Step D — After smoke: process health

```bash
NAME=tokfai-api
pm2 show "$NAME" | egrep -i 'status|restarts|uptime|memory|cpu|script path|pid'
```

Record:

```text
AFTER_STATUS=
AFTER_RESTARTS=
AFTER_UPTIME=
AFTER_CPU=
AFTER_MEMORY=
PROCESS_RESTART_DELTA=$((AFTER_RESTARTS - BEFORE_RESTARTS))   # must be 0
```

Require:

```text
PROCESS_RESTART_DELTA=0
status remains online
```

---

## Step E — Billing / state (optional, safe)

If you have a **test account** dashboard or admin read-only view:

```text
BILLING: show delta / pass / mismatch only — no emails, no full ledger dumps
STATE:   REAL_SUPABASE_STATE_DIRECT_CHECK=NOT_RUN  unless a safe hashed id query exists
```

Forbidden: SQL that prints prompt/tool blobs; updates; debit RPCs from SSH.

---

## Paste-back template

```text
DMIT_OBS_EXECUTED=YES
PROCESS_NAME=
BEFORE_RESTARTS=
AFTER_RESTARTS=
PROCESS_RESTART_DELTA=
ROUND1_TOOL_SEEN=YES|NO
ROUND2_RESUME_FINAL_SEEN=YES|NO
REQUEST_ID_CORRELATED=YES|NO|PARTIAL
REAL_SUPABASE_STATE_DIRECT_CHECK=NOT_RUN
FORBIDDEN_COMMANDS_RUN=NO
```

Joint with Mac:

```text
REAL_HTTP_TOOL_ROUNDTRIP_PASS=YES
  only if Mac diff PASS AND DMIT Round1+Round2 explained by same session/request chain
```
