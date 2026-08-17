# Aviation Testing Pack

```text
P1230–P1234 design docs
No production load without human authorization.
```

| Doc | Purpose |
| --- | ------- |
| [01-synthetic-customer.md](./01-synthetic-customer.md) | Fake eVTOL cargo customer |
| [02-load-model.md](./02-load-model.md) | Workloads W1–W6 + ladder |
| [03-chaos-model.md](./03-chaos-model.md) | Chaos C1–C10 |
| [04-session-isolation.md](./04-session-isolation.md) | P1233 red line |
| [05-billing-invariants.md](./05-billing-invariants.md) | P1234 billing |
| [06-agent-runtime-state-machine.md](./06-agent-runtime-state-machine.md) | Runtime state machine |
| [07-runtime-invariants.md](./07-runtime-invariants.md) | INV-001…008 |
| [08-current-billing-model.md](./08-current-billing-model.md) | Source-derived billing model |
| [09-p1231-controlled-load-plan.md](./09-p1231-controlled-load-plan.md) | Next stage plan (not executed) |
| [10-real-dmit-functional-smoke.md](./10-real-dmit-functional-smoke.md) | L2 prepare + L1 env block notes |
| [11-mac-real-dmit-verification.md](./11-mac-real-dmit-verification.md) | Mac copy-paste runbook |
| [12-dmit-real-http-observation.md](./12-dmit-real-http-observation.md) | DMIT SSH read-only observation |
| [13-p1230-r15-local-full-http-status.md](./13-p1230-r15-local-full-http-status.md) | L1 Full HTTP blocked-by-env status |
| [14-p1231-real-codex-gemini-capacity-closure.md](./14-p1231-real-codex-gemini-capacity-closure.md) | P1231 real Codex/Gemini capacity gate closure → P1232/P1240 |
| [15-p1232-controlled-mock-provider-load-plan.md](./15-p1232-controlled-mock-provider-load-plan.md) | P1232-R0 controlled mock provider load plan (not executed) |
| [16-p1240-aviation-workspace-reality-test-plan.md](./16-p1240-aviation-workspace-reality-test-plan.md) | P1240-R0 aviation workspace reality test plan (depth, not concurrency) |
| [17-p1240-r1-workspace-reality-execution-checklist.md](./17-p1240-r1-workspace-reality-execution-checklist.md) | P1240-R1 execution checklist + customer-safe prompts |

Fixtures: `test-fixtures/aviation/customer-001/`  
Harness: `scripts/aviation-sim/`  
Canary: `.tokfai-canary/p1230-r15/input.txt`

P1230-R1: `node scripts/aviation-sim/runtime-closure.mjs` (needs `apps/dmit-api/dist`; no full DMIT `.env`)

P1230-R1.5: Full HTTP L1 **blocked by missing local `.env`** this workspace — see doc 10. Mac/DMIT smoke not executed by Cursor.

Gate to CUSTOMER_SANDBOX:

```text
Synthetic PASS
Tool Roundtrip PASS
Resume PASS
Session Isolation PASS
Billing Invariant PASS
Controlled Load PASS
Chaos Baseline PASS
```
