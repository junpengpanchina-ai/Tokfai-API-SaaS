# 19 — P1240-R3 Strict Chain Execution Archive

```text
P1240-R3-CLOSE = STRICT-R3 RESULT ARCHIVE
SCOPE=docs only
PRODUCTION_CODE_CHANGED=NO
DMIT_DEPLOY_NEEDED=NO
CUSTOMER_SOURCE=NO
CANARY_LITERAL_IN_THIS_DOC=NO
CANARY_LITERAL_IN_PROMPT=NO
COMMIT_PUSH_DEPLOY=NO
```

Plan: [16-p1240-aviation-workspace-reality-test-plan.md](./16-p1240-aviation-workspace-reality-test-plan.md)  
Checklist: [17-p1240-r1-workspace-reality-execution-checklist.md](./17-p1240-r1-workspace-reality-execution-checklist.md)  
Fixture: [18-p1240-r2-synthetic-workspace-execution.md](./18-p1240-r2-synthetic-workspace-execution.md) → `test-fixtures/aviation/p1240-r2-synthetic-fcu/`

---

## Verdict

P1240-R3 **strict-r3** closed as **PASS** on the synthetic FCU tree using a **fixed four-file scope**, not free directory search.

```text
RUN=P1240-R3-strict-r3
EXIT=0
FIXED_FOUR_FILE_SCOPE=PASS
CANARY_LITERAL_IN_PROMPT=NO
DMIT_DEPLOY_NEEDED=NO
APPLICATION_CODE_CHANGED=NO
PASS_CLASS=A_PASS_ENGINEERING_TRACE
```

Customer engineering demos should use **fixed-file-scope / segmented engineering trace**. Do not use unconstrained tree walk plus a long full prompt as the default demo path.

---

## What ran

| Field | Value |
| ----- | ----- |
| Target | Synthetic FCU fixture only (not OEM / customer source) |
| Mode | Strict chain, fixed four-file scope |
| Protocol | Tokfai as protocol bridge; local Read/Search on the client |
| Prompt leak control | Canary literal was **not** placed in the prompt |
| Result artifact | Operator `result.md` generated (not copied here) |
| Process | `EXIT=0` |

Log noise observed (model refresh / stream disconnected / reconnect) did **not** change the acceptance outcome: final `EXIT=0`.

---

## Fixed four-file scope (PASS)

Agent work was bounded to these paths (no source bodies in this archive):

1. `…/ControlLaw/txg_control_task.c`
2. `…/ControlLaw/RotorLaw/rotor_law.c`
3. `…/ControlLaw/control_allocation.c`
4. `…/Actuator/actuator_command.c`

Fixture prefix:

```text
test-fixtures/aviation/p1240-r2-synthetic-fcu/1.FCU_X5/Flight/FlightControl/
```

---

## Result hits (strict-r3)

Required markers present in the result (names / paths only):

| # | Hit | Evidence class |
| - | --- | -------------- |
| 1 | `txg_control_task.c` | 文件证据 |
| 2 | `attitude_control_entry` | 文件证据 |
| 3 | `rotor_law_update` | 文件证据 |
| 4 | `control_allocation` | 文件证据 |
| 5 | `actuator_command_write` | 文件证据 |
| 6 | Deep-file canary recovered (`[REDACTED_CANARY_TOKEN]`; literal not in this doc or prompt) | 文件证据 |
| 7 | 文件证据 / 工程推断 distinguished in the result | bound |

Canary literal remains only in `ControlLaw/RotorLaw/rotor_law.c` inside the fixture. This archive does not repeat it.

---

## Call chain (accepted)

```text
attitude_control_entry       (ControlLaw/txg_control_task.c)
  → rotor_law_update         (ControlLaw/RotorLaw/rotor_law.c)
  → control_allocation       (ControlLaw/control_allocation.c)
  → actuator_command_write   (Actuator/actuator_command.c)
```

This matches the P1240-R2 expected chain. Sensors/`imu_input.c` was out of the four-file scope and was not required for this PASS.

---

## Pass/fail stamp

| Field | Value |
| ----- | ----- |
| `WORKSPACE_DISCOVERY` | N/A (fixed-file-scope; discovery not the goal of strict-r3) |
| `FILE_ACCESS_VERIFIED` | YES (canary recovered from deep RotorLaw file, not from prompt/docs) |
| `SEARCH_USED` | in-scope (four files only) |
| `READ_USED` | YES |
| `SYMBOL_FOUND` | YES |
| `CALL_CHAIN_COMPLETE` | YES |
| `UNSUPPORTED_CLAIMS_COUNT` | 0 (no archive evidence of unsupported claims) |
| `CUSTOMER_SOURCE_DUMPED` | NO |
| `HALLUCINATION_DETECTED` | NO |
| `PASS_CLASS` | `A_PASS_ENGINEERING_TRACE` |

---

## Risk boundaries

| Do | Do not |
| -- | ------ |
| Demo with the four-file list and segmented questions (entry → rotor → allocation → actuator) | Default to free-directory search + one long prompt |
| Keep canary out of prompts and docs | Paste `[REDACTED_CANARY_TOKEN]` literal into tickets, prompts, or this pack |
| Treat stream refresh/reconnect as noise if `EXIT=0` and hits above are present | Fail the run solely on reconnect log lines |
| Keep Tokfai as protocol bridge; tools stay on the client | Upload fixture or OEM trees to Tokfai |
| Cite path + function + 文件证据 / 工程推断 | Dump source bodies, keys, Authorization, apiKeyId, or canary logs into docs |

Strict-r3 does **not** prove:

- Free-walk discovery from repo root (that was deliberately out of scope)
- OEM / customer workspace correctness
- Concurrency / Heavy Queue / Curve A capacity (P1231 / P1232)
- Production gateway changes (none made)

---

## Demo recommendation (customer engineering)

```text
PREFERRED_DEMO=fixed-file-scope + segmented engineering trace
NOT_PREFERRED=unconstrained directory search + long full prompt
```

Segmented trace (one hop per turn or per checklist item):

1. Read `txg_control_task.c` → name `attitude_control_entry`
2. Trace `rotor_law_update`
3. Trace `control_allocation`
4. Trace `actuator_command_write`
5. Recover deep canary from `RotorLaw/rotor_law.c` only via local file tools

---

## Honesty bound

```text
P1240-R3-CLOSE archives strict-r3 PASS.
No application code changed.
No DMIT deploy required.
No customer source dumped.
No canary literal in this document.
No commit / push / deploy by this task.
```

```text
TOKFAI_P1240_R3_STRICT_CHAIN_ARCHIVE_COMPLETE=YES
APPLICATION_CODE_CHANGED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
