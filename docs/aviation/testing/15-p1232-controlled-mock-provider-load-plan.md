# 15 — P1232 Controlled Mock Provider Load Plan (R0)

```text
P1232-R0 = PLAN ONLY
PRODUCTION_LOAD_TEST_EXECUTED=NO
MOCK_PROVIDER_IMPLEMENTED=NO
PRODUCTION_CODE_CHANGED=NO
HEAVY_QUEUE_ENLARGED=NO
KEY_CONCURRENCY_ENLARGED=NO
RATE_LIMIT_BYPASS=NO
AUTH_BILLING_BYPASS=NO
COMMIT_PUSH_DEPLOY=NO
```

Depends on: [14-p1231-real-codex-gemini-capacity-closure.md](./14-p1231-real-codex-gemini-capacity-closure.md)  
Workload vocabulary: [02-load-model.md](./02-load-model.md)  
Isolation / billing red lines: [04](./04-session-isolation.md), [05](./05-billing-invariants.md)  
Earlier ladder sketch: [09-p1231-controlled-load-plan.md](./09-p1231-controlled-load-plan.md)

Harness location (existing, out-of-band): `scripts/aviation-sim/` — must **never** be imported by production `apps/dmit-api/src`.

---

## 1. Why P1232 Exists

P1231 measured the **real product path** (Codex → Tokfai → GRSAI/Gemini → tools → resume). Binding walls were:

| Wall | Observation |
| ---- | ----------- |
| W1 Normal key concurrency | `NORMAL_KEY_CONCURRENCY=5` admission gate |
| W2 Heavy Queue | KA6-R2: `HEAVY_QUEUE_TIMEOUT_BEFORE_TOOL_EXECUTION` at 6 agents |
| Host resources | PM2 stayed online; low load; Swap=0 — **not** the primary fail class |

Conclusion for P1232 design:

> Real Gemini runs characterized **heavy-queue / upstream / real-latency capacity**, not DMIT’s infrastructure ceiling.

Mixing the two curves produces false narratives (“DMIT cannot do N agents”) when the bottleneck is queue policy or upstream cost/latency. P1232 exists to **separate** those curves: keep Curve A (real product) as the honesty bound for customer-facing concurrency, and use Curve B (mock/controlled provider) to stress Nginx + DMIT + auth + billing + state + resume **without** burning Gemini quota or conflating upstream wait with Node capacity.

Non-goals this round (R0):

- Implement a mock provider
- Execute production load
- Enlarge Heavy Queue or key concurrency
- Disable auth, billing, or rate-limit gates
- Ship anything production-importable as a mock

---

## 2. Separation of Curves

### Curve A — Real Product Capacity

```text
Codex + Tokfai + GRSAI/Gemini + real billing + real latency
```

| Property | Value |
| -------- | ----- |
| Upstream | Real GRSAI/Gemini |
| Cost | Non-zero; human cost cap required |
| Latency | Real model + network |
| Gates | Production admission, Heavy Queue, billing — **unchanged** |
| Known band (P1231) | KA4 = 4/4 PASS; KA6 = 5/6 PARTIAL (Heavy Queue) |
| Answers | “What can a customer actually run today?” |

Curve A remains the **customer honesty bound**. P1232 does not replace or “greenwash” Curve A by raising limits.

### Curve B — DMIT Infrastructure Capacity

```text
Load harness + Nginx + DMIT + controlled/mock provider
  + auth + billing + state + resume
```

| Property | Value |
| -------- | ----- |
| Upstream | Controlled/mock OpenAI-compatible provider (out-of-band process) |
| Cost | Target **$0** Gemini (mock only) |
| Latency | Injected / scripted (fast, slow, timeout, 429, 5xx) |
| Gates | Auth, billing, rate limit, session state — **must stay on** |
| Answers | “Where does DMIT/Nginx/DB/process break before upstream does?” |

Architecture (mandatory for Curve B):

```text
Load Generator → (optional Nginx) → DMIT → Mock Upstream
```

Never:

```text
apps/dmit-api/src ──import──► mock provider
```

Mock lives only in harness / sidecar processes under `scripts/aviation-sim/` (or equivalent test-only tooling), pointed at via **test env on a dedicated/dev target**, not by embedding mock modules into the production gateway.

### How to read results

| If Curve B holds at N and Curve A fails earlier | Interpretation |
| ----------------------------------------------- | -------------- |
| Fail class = Heavy Queue / upstream timeout | Product gate / upstream — not proven DMIT CPU death |
| Fail class = RSS / Swap / PM2 restart / 5xx / DB | Infrastructure — fix/ops before raising customer N |
| Fail class = wrong output / contamination / billing | **STOP** — correctness blocker, not a ladder continue |

---

## 3. Required Test Layers

Execute layers in order within each ladder step unless a stop gate fires. Map to workloads in [02-load-model.md](./02-load-model.md).

| Layer | Workload ID | Must prove |
| ----- | ----------- | ---------- |
| TEXT baseline | W1_TEXT | Non-stream completion through DMIT + mock; auth + usage path alive |
| SSE stream baseline | W2_STREAM | SSE opens, chunks, **closes cleanly** |
| Tool-call roundtrip | W3_TOOL_CALL | Tool call emitted; client tool result accepted; no wrong mapping |
| Resume state | W4_TOOL_RESUME | `previous_response_id` resumes correct session only |
| Billing invariant | (see [05](./05-billing-invariants.md)) | Provider call ↔ usage ↔ ledger ↔ balance; no double/missing charge |
| Session isolation | (see [04](./04-session-isolation.md)) | A state/billing/tools/content ∉ B |
| Abort / timeout | chaos-aligned | Client abort and provider timeout leave consistent billing/state |
| Concurrency ladder | all above at each N | Escalate only while stop gates quiet |

### Ladder

```text
1 → 5 → 10 → 25 → 50 → 100 → 250 → 500
```

Rules:

1. Complete required layers at current N before escalating.
2. Do **not** escalate past a stop gate “to see if it recovers.”
3. Do **not** enlarge Heavy Queue or key concurrency to clear a ladder step.
4. Production host load requires `ALLOW_PRODUCTION_LOAD=1` + human authorization; default target = dedicated/dev DMIT or local Full HTTP with synthetic env — never silent prod.
5. 750/1000 only after prior gate documented (same spirit as doc 02); not part of R0 execution.

### Layer notes

- **TEXT / SSE:** Establish baseline latency and connection behavior under mock (inject fixed TTFT / chunk cadence).
- **Tool + Resume:** Minimum one tool round + one resume per session at every N that claims “agent capacity.”
- **Billing:** Sample ledger deltas; any unexplained double or missing charge = blocker ([05](./05-billing-invariants.md)).
- **Isolation:** At least two concurrent identities at N≥2; prove no cross resume / content / billing ([04](./04-session-isolation.md)).
- **Abort / timeout:** Force client disconnect and mock slow/timeout; SSE must close; no charged-timeout ghost without policy record.

---

## 4. Stop Gates

Any gate below → **STOP escalate**, record root class, do not “fix” by disabling safety.

| Stop gate | Signal | Action |
| --------- | ------ | ------ |
| PM2 restart unexpected | `restart_time` increases without operator action | STOP; capture `pm2 show` before/after |
| PID change unexpected | PID ≠ baseline for the run window | STOP; treat as process death/replace |
| RSS sustained growth | RSS rises across ladder steps without plateau / reclaim | STOP; suspect leak |
| Swap used and not recovered | Swap > 0 and stays after cool-down | STOP |
| 5xx spike | Network/5xx rate exceeds prior step baseline | STOP |
| Wrong output | Session output ≠ expected fixture / token | STOP; `FAIL_BLOCKER` |
| Cross-session contamination | A content/state/billing appears in B | STOP; enterprise red line |
| Double billing | Two ledger hits for one successful provider semantic | STOP; `FAIL_BLOCKER` |
| Missing billing | Successful billable path with no usage/ledger | STOP; `FAIL_BLOCKER` |
| Tool result mapped to wrong response | Tool payload applied to other session/response | STOP; `FAIL_BLOCKER` |
| `previous_response_id` mismatch | Resume attaches to wrong id / other customer | STOP; `FAIL_BLOCKER` |
| SSE not closing | Stream hangs open after done/error/abort | STOP; connection leak risk |

Also inherit soft stops from doc 02 when measurable: event-loop lag runaway, DB pool exhaustion, debit RPC errors — thresholds `UNKNOWN` until first Curve B baseline; do not invent SLOs.

Forbidden “pass” tactics:

```text
HEAVY_QUEUE_ENLARGE_TO_PASS=NO
KEY_CONCURRENCY_ENLARGE_TO_PASS=NO
DISABLE_RATE_LIMIT_TO_PASS=NO
BYPASS_AUTH_OR_BILLING_TO_PASS=NO
```

---

## 5. Required Metrics

Record per ladder step and per layer. Prefer machine-readable JSON summary + short markdown stamp (no secrets, no key material, no prompt bodies).

| Metric | Unit / form | Notes |
| ------ | ----------- | ----- |
| active agent sessions | count (peak + avg) | Concurrent agent sessions admitted |
| requests/session | count | HTTP requests per agent session |
| provider calls/session | count | Mock upstream invocations per session |
| tool rounds/session | count | Tool call ↔ result cycles |
| p50 / p95 / p99 latency | ms | Per layer (TEXT, SSE TTFB/TTFB-close, tool, resume) |
| RSS peak | MB | DMIT process |
| CPU peak | % | DMIT process / host as available |
| memory available low | MB or % | Host free memory floor during step |
| connection count peak | count | HTTP + SSE open connections |
| credits charged | credits (aggregate) | Sum of billable deltas for the step |
| failures by root class | histogram | e.g. admission, queue, 5xx, timeout, isolation, billing |

Optional but recommended when available: event-loop lag, DB pool in-use, Nginx active connections, mock upstream queue depth.

Health snapshot fields (safe):

```text
PM2_STATUS
PID
RESTART_TIME
RSS_MB
SWAP
LOAD_AVG
```

Never record: API keys, Authorization headers, apiKeyId plaintext, KA allowlist contents, prompts, tool args, file bodies.

---

## 6. Honesty Bound

```text
P1232-R0 is a plan only.
No production load test executed.
No mock provider implemented.
No production code changed.
```

Additional honesty markers for this document:

```text
CURVE_A_REPLACED_BY_MOCK=NO
HEAVY_QUEUE_POLICY_CHANGED=NO
KEY_CONCURRENCY_POLICY_CHANGED=NO
APPLICATION_CODE_CHANGED=NO
ENV_CHANGED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```

When a future R1+ **executes** Curve B, that run must stamp separately:

- target host class (local / dedicated / prod-with-explicit-allow)
- mock vs real upstream
- ladder step reached
- stop gate that fired (if any)
- PASS markers per layer

Until then: `PRODUCTION_LOAD_TEST_EXECUTED=NO`.

---

## Entry / Exit (for later execution rounds)

**Enter P1232 execution only when:**

1. P1231 archive accepted ([14](./14-p1231-real-codex-gemini-capacity-closure.md)).
2. Human authorizes target host and cost (mock should be $0 Gemini).
3. Mock/sidecar plan does not require production import.
4. Auth, billing, and rate-limit gates remain enabled.

**Exit toward scale claims only when:**

1. Ladder step N completes TEXT + SSE + tool + resume + billing sample + isolation sample.
2. No stop gate fired.
3. Metrics table filled for that N.
4. Curve A band still cited for real Gemini honesty (do not claim Curve B N as customer Gemini N).

**Parallel / next product reality:** P1240 aviation workspace ([14](./14-p1231-real-codex-gemini-capacity-closure.md) § P1240) — correctness in customer fixtures; not a substitute for Curve B.

---

## Acceptance stamp (R0 plan)

```text
TOKFAI_P1232_CONTROLLED_MOCK_PROVIDER_LOAD_PLAN_COMPLETE=YES
APPLICATION_CODE_CHANGED=NO
ENV_CHANGED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
