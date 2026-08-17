# 14 — P1231 Real Codex/Gemini Capacity Gate Closure

```text
P1231-R2 ARCHIVE / CAPACITY GATE CLOSURE
SCOPE=docs + test-plan entry only
PRODUCTION_CODE_CHANGE=NO
HEAVY_QUEUE_ENLARGED=NO
KEY_CONCURRENCY_ENLARGED=NO
RATE_LIMIT_BYPASS=NO
COMMIT_PUSH_DEPLOY=NO
```

Canary artifacts (local, opaque payloads — do not paste contents):

- `.tokfai-canary/p1231/` — Normal Key 10-agent run
- `.tokfai-canary/p1231-ka6-r2/` — KA identity 6-agent run
- `.tokfai-canary/p1231-ka4-r1/` — KA identity 4-agent run

Prior foundation: [13-p1230-r15-local-full-http-status.md](./13-p1230-r15-local-full-http-status.md), Mac/DMIT path in [11](./11-mac-real-dmit-verification.md) / [12](./12-dmit-real-http-observation.md).

---

## Executive Summary

P1231 closed the **real** Codex → Tokfai HTTPS → DMIT → GRSAI/Gemini → local tool → resume path under controlled concurrency. Correctness held where admission allowed work; failures classified as **capacity gates**, not process crash or cross-session contamination.

### Mandatory markers

```text
NORMAL_KEY_CONCURRENCY=5
KA_TEST_IDENTITY_ACTIVATED=YES
KA4_R1=4/4 PASS
KA6_R2=5/6 PARTIAL
KA_IDENTITY_BYPASSES_NORMAL_KEY_CONCURRENCY_GATE=YES
HEAVY_QUEUE_IS_SECOND_WALL=YES
DMIT_PM2_CRASH_UNDER_P1231=NO
CROSS_SESSION_CONTAMINATION_OBSERVED=NO
```

Verdict:

1. **First wall** = normal-key concurrency admission (`limit=5`).
2. With KA test identity active (`PROCESS_KA_COUNT=2`), that wall is bypassed for the KA load path.
3. **Second wall** = Heavy Queue: at 6 concurrent real agents, 1/6 hit `HEAVY_QUEUE_TIMEOUT_BEFORE_TOOL_EXECUTION`.
4. At **4** concurrent KA agents: **4/4 PASS** (correctness OK; latency high).
5. Server health snapshot showed PM2 online, low load, Swap=0 — no evidence DMIT/PM2 was resource-exhausted by these runs.

Next stages are **P1232** (mock-provider load, scale without real Gemini cost) and **P1240** (aviation workspace reality), not production gate enlargement in this round.

---

## Test Matrix

| Stage | Identity | Agents | Duration (reported) | Pass / Fail | Primary signal |
| ----- | -------- | ------ | ------------------- | ----------- | -------------- |
| P1230-R1.5 | production path smoke | 1 (file roundtrip) | — | PASS (input == output) | Full HTTPS chain + resume + final stop |
| P1231 Normal Key | normal key | 10 concurrent | — | **5 / 5** | First wall: `key_concurrency` admission |
| P1231 KA Identity | KA load-test keys | ops reload | — | activation only | `KA_TEST_IDENTITY_ACTIVATED=YES`, `PROCESS_KA_COUNT=2` |
| P1231 KA6-R2 | KA | 6 concurrent | **304s** | **5 / 1** PARTIAL | Second wall: Heavy Queue timeout before tool |
| P1231 KA4-R1 | KA | 4 concurrent | **317s** | **4 / 0** PASS | Real Gemini tool stream correctness at 4 |

Local exit-code corroboration (no payload inspection):

| Canary dir | Exit 0 | Exit ≠0 | Out files present |
| ---------- | ------ | ------- | ----------------- |
| `.tokfai-canary/p1231/` | 5 | 5 | 5 |
| `.tokfai-canary/p1231-ka6-r2/` | 5 | 1 | 5 |
| `.tokfai-canary/p1231-ka4-r1/` | 4 | 0 | 4 |

---

## Gate Map

```text
Client (Mac Codex)
  → HTTPS
  → Nginx
  → DMIT (tokfai-api / PM2)
  → GRSAI / Gemini
  → Codex local tools
  → resume
  → final stop
```

Admission / capacity walls observed in P1231:

| Wall | Mechanism | Observed when | Effect |
| ---- | --------- | ------------- | ------ |
| **W1** | Key concurrency admission | Normal key, 10 agents | Failures at `limit=5`, `current=5`, `rate_limit_policy=normal` |
| **W2** | Heavy Queue | KA identity, 6 agents | Fail class `HEAVY_QUEUE_TIMEOUT_BEFORE_TOOL_EXECUTION` (1 agent) |
| (not hit) | DMIT CPU/RAM / PM2 crash | All P1231 runs above | No crash; load avg ~0.12/0.10/0.09; RSS ~106MB; Swap=0 |
| (not hit) | Cross-session contamination | All runs | No wrong output / shell write mix attributed |

Policy this archive respects: do **not** enlarge Heavy Queue, do **not** raise key concurrency, do **not** default-bypass rate limits for “pass rate optics.”

---

## Normal Key Result

```text
NORMAL_KEY_CONCURRENCY=5
AGENTS=10
RESULT=5 PASS / 5 FAIL
ROOT_CLASS=KEY_CONCURRENCY_ADMISSION_GATE
rate_limit_policy=normal
limit=5
current=5
```

Interpretation:

- Failures are **expected admission denials**, not model incorrectness.
- Not attributed to DMIT CPU/RAM saturation, PM2 crash, or cross-session contamination.
- Proves the normal-key concurrency ceiling is real and enforceable under concurrent Codex agents.

---

## KA Identity Activation

```text
KA_TEST_IDENTITY_ACTIVATED=YES
PROCESS_KA_COUNT=2
```

Ops facts (no secret material):

- `KA_LOAD_TEST_KEYS` count went from **1 → 2** in the server env (values never recorded here).
- PM2 process reloaded so the running process observed `PROCESS_KA_COUNT=2`.
- Purpose: exercise a KA load-test identity path so Normal Key W1 does not dominate the capacity picture.

This activation is **identity/config for test**, not a production concurrency policy change and not a Heavy Queue enlargement.

---

## KA6-R2 Result

```text
KA6_R2=5/6 PARTIAL
AGENTS=6
DURATION_S=304
PASS=5
FAIL=1
FAIL_ROOT_CLASS=HEAVY_QUEUE_TIMEOUT_BEFORE_TOOL_EXECUTION
WRONG_OUTPUT=NO
CROSS_SESSION_CONTAMINATION=NO
LOCAL_SHELL_WRITE_MISMATCH=NO
```

Interpretation:

- W1 (normal key concurrency) was bypassed via KA identity → work reached the heavy path.
- W2 (Heavy Queue) became the binding constraint at **6** concurrent real Codex/Gemini agents.
- The single failure timed out **before tool execution** — not a post-tool wrong file write.

Canary: `.tokfai-canary/p1231-ka6-r2/` (agent-6 exit ≠0; agents 1–5 exit 0).

---

## KA4-R1 Result

```text
KA4_R1=4/4 PASS
AGENTS=4
DURATION_S=317
PASS=4
FAIL=0
```

Interpretation:

- Real Gemini tool stream at **4** concurrent KA agents: **correctness passes**.
- Latency remains high (~5+ minutes wall clock for the cohort) — capacity/latency characterization, not a correctness fail.
- Establishes a practical **correctness-safe concurrency band** under current Heavy Queue policy: **4 yes / 6 partial**.

Canary: `.tokfai-canary/p1231-ka4-r1/` (all four exits 0; four out files).

---

## Failure Root Classes

| Class | Where seen | Meaning | Not meaning |
| ----- | ---------- | ------- | ----------- |
| `KEY_CONCURRENCY_ADMISSION_GATE` | Normal Key 10-agent | Admission refused at concurrency 5 | Model/tool bug |
| `HEAVY_QUEUE_TIMEOUT_BEFORE_TOOL_EXECUTION` | KA6-R2 (1 agent) | Queued/heavy path exceeded wait before tools ran | Wrong tool output / contamination |
| (absent) `DMIT_PM2_CRASH` | — | — | Would imply process death; not observed |
| (absent) `CROSS_SESSION_CONTAMINATION` | — | — | Would imply mixed session I/O; not observed |
| (absent) `WRONG_OUTPUT` | — | — | Would imply PASS path wrote incorrect payload; not observed on fails |

---

## What This Proves

1. End-to-end real path from P1230-R1.5 remains valid under multi-agent pressure when admitted.
2. `NORMAL_KEY_CONCURRENCY=5` is an enforced product gate, not a soft suggestion.
3. `KA_TEST_IDENTITY_ACTIVATED=YES` successfully moves the experiment past W1 for load characterization.
4. `KA4_R1=4/4 PASS` — real Codex/Gemini tool+resume correctness at 4 concurrent KA agents.
5. `KA6_R2=5/6 PARTIAL` — at 6, Heavy Queue is the second wall; failures are capacity/timeout class.
6. Server health snapshot (PM2 online, PID=135093, RSS≈106MB, Swap=0, load≈0.12/0.10/0.09) did **not** show resource collapse correlating with these fails.
7. Isolation red line held for these runs: no evidenced cross-session contamination or wrong local shell writes on the failed agent class.

---

## What This Does NOT Prove

1. Production readiness for **>4** concurrent real Gemini tool agents under current Heavy Queue policy.
2. That enlarging Heavy Queue or key concurrency is safe, desirable, or authorized (explicitly **out of scope** / forbidden this round).
3. Cost, quota, or billing exact-once under sustained ladder (needs dedicated billing/load stages).
4. Mock-provider scalability (that is **P1232**).
5. Aviation workspace / customer-fixture realism at scale (that is **P1240**).
6. Chaos resilience (C1–C10) or full session-isolation red-team beyond these canaries.
7. That low host load implies unlimited concurrency — gates are **policy/queue**, not only CPU.

---

## Next Stage P1232 Mock Provider Load Test

**Goal:** Scale concurrency and duration against a **mock upstream** so queue/admission/latency curves can be measured without real Gemini cost and without changing production gate sizes “to pass.”

Entry conditions:

```text
P1231_ARCHIVE=CLOSED (this doc)
MOCK_UPSTREAM=REQUIRED
REAL_GEMINI_DEFAULT=OFF
ALLOW_PRODUCTION_LOAD=human-gated
HEAVY_QUEUE_ENLARGE=FORBIDDEN_BY_DEFAULT
KEY_CONCURRENCY_ENLARGE=FORBIDDEN_BY_DEFAULT
```

Suggested plan shape (design only; not executed here):

| Item | Guidance |
| ---- | -------- |
| Target | Dev/dedicated DMIT or local gateway + mock upstream |
| Ladder | Align with [09-p1231-controlled-load-plan.md](./09-p1231-controlled-load-plan.md) spirit: escalate only while error class stays expected |
| Workload | Tool + resume sessions; record admission vs queue vs upstream latency separately |
| Stop gates | Rising 5xx, debit errors, event-loop stall, pool exhaustion — stop escalate |
| Success | Capacity curve + root-class histogram; **not** “raise limits until 6/6 green” |

Harness already present under `scripts/aviation-sim/` (mock/load helpers). P1232 should **not** wire mock load into the production main path.

---

## Next Stage P1240 Aviation Workspace Reality Test

**Goal:** Move from abstract canary I/O to the aviation synthetic customer workspace (`test-fixtures/aviation/customer-001/`) under real agent workflows — correctness and isolation in a domain-shaped tree.

Entry conditions:

```text
P1231_CORRECTNESS_BAND_KNOWN=YES   # KA4 pass / KA6 partial
P1232_MOCK_CURVE=preferred_before_or_parallel
CUSTOMER_FIXTURE=test-fixtures/aviation/customer-001/
SESSION_ISOLATION_RED_LINE=see doc 04
```

Suggested focus:

| Focus | Why |
| ----- | --- |
| Multi-file aviation pack | Modes, C2, certification, tests under one customer tree |
| Isolation | Two agents / two workspaces must not mix writes |
| Resume | Interrupted review rounds remain coherent |
| Expected findings | Compare against `expected-findings.json` without pasting secrets/prompts |

P1240 is **reality/correctness**, not a substitute for P1232 scale curves.

---

## Server Health Snapshot (P1231 window)

```text
PM2=online
PID=135093
RSS_MB≈106
SWAP=0
LOAD_AVG≈0.12 / 0.10 / 0.09
DMIT_PM2_CRASH_EVIDENCE=NO
```

Treat as correlating observation for these runs, not a permanent SLO claim.

---

## Archive stamp

```text
DOC=14-p1231-real-codex-gemini-capacity-closure
ROUND=P1231-R2
NORMAL_KEY_CONCURRENCY=5
KA_TEST_IDENTITY_ACTIVATED=YES
KA4_R1=4/4 PASS
KA6_R2=5/6 PARTIAL
NEXT=P1232_MOCK_PROVIDER_LOAD | P1240_AVIATION_WORKSPACE_REALITY
```
