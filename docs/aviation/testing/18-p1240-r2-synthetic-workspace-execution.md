# 18 — P1240-R2 Synthetic Workspace Execution

```text
P1240-R2 = SYNTHETIC FIXTURE + EXECUTION DOC
CUSTOMER_SOURCE=NO
FLIGHTWORTHY=NO
PRODUCTION_CODE_CHANGED=NO
COMMIT_PUSH_DEPLOY=NO
```

Checklist: [17-p1240-r1-workspace-reality-execution-checklist.md](./17-p1240-r1-workspace-reality-execution-checklist.md)  
Plan: [16-p1240-aviation-workspace-reality-test-plan.md](./16-p1240-aviation-workspace-reality-test-plan.md)

Fixture root:

```text
test-fixtures/aviation/p1240-r2-synthetic-fcu/
```

---

## Fixture purpose

Provide a **customer-shaped but fully synthetic** FCU tree so operators can run Tokfai/Codex workspace-reality gates without OEM IP:

| Goal | How this fixture helps |
| ---- | ---------------------- |
| Workspace discovery | Nested `1.FCU_X5/Flight/FlightControl/ControlLaw/RotorLaw` |
| Exact file read | Real `.c` / `.h` files with callable symbols |
| Symbol discovery | `attitude_control_entry`, `rotor_law_update`, `control_allocation`, `actuator_command_write` |
| Call-chain trace | Attitude entry → RotorLaw → allocation → actuator |
| Canary verification | Single deep token `[REDACTED_CANARY_TOKEN]` (literal only in RotorLaw/rotor_law.c) |

Tokfai remains a protocol bridge; local Read/Search/Shell run on the client against this fixture.

---

## Directory map

```text
p1240-r2-synthetic-fcu/
  README.md
  1.FCU_X5/
    Flight/
      FlightControl/
        README.md
        ControlLaw/
          txg_control_task.c      # attitude entry; calls rotor + allocation
          control_allocation.c
          control_allocation.h
          RotorLaw/
            rotor_law.c           # rotor_law_update; deep canary lives here
            rotor_law.h
        Actuator/
          actuator_command.c      # actuator_command_write
        Sensors/
          imu_input.c             # stub sample (not required for chain PASS)
```

Open `p1240-r2-synthetic-fcu/` or `1.FCU_X5/` as the Agent workspace root — start from the **upper** directory, not a pre-opened leaf.

---

## Expected call chain

```text
attitude_control_entry          (ControlLaw/txg_control_task.c)
  → rotor_law_update            (ControlLaw/RotorLaw/rotor_law.c)
       in:  attitude_error, angular_rate
       out: virtual_control
  → control_allocation          (ControlLaw/control_allocation.c)
       in:  virtual_control
       out: channel_cmd (pseudo mixer / allocation matrix / channel map)
  → actuator_command_write      (Actuator/actuator_command.c)
       sink: motor/servo channel commands
```

Sensors/`imu_input_sample` is optional context; not required for a PASS on the main chain.

---

## Canary location

```text
TOKEN=[REDACTED_CANARY_TOKEN]
OCCURRENCES_IN_FIXTURE=1
```

- The canary literal exists once in `RotorLaw/rotor_law.c` (deep `.c` under `ControlLaw/RotorLaw/`), not in top-level README, prompts, or this doc.
- Operator verifies the Agent recovers the exact token string via Search/Read.
- Do **not** paste surrounding source into tickets; path + token is enough for scoring.
- Do **not** place this token in real customer trees.

---

## Test prompts

Shared rules (append to every prompt):

```text
规则（必须遵守）：
1. 必须实际使用本地文件工具（List / Search / Read；必要时 Shell）。
2. 每个结论列出实际读取的文件路径；涉及逻辑时列出函数名。
3. 区分「文件证据」与「推断」；不得把推断写成证据。
4. 不要猜测；没有工具证据就不要下工程结论。
5. 读不到 / 找不到就明确写「读不到」或「找不到」，并说明尝试过的路径或搜索词。
6. 不要大段粘贴源码正文；路径 + 函数名 + 关系即可。
7. 禁止仅用「我已读取文件」作为证据——工具记录里必须有对应 Read/Search。
```

### Prompt 1 — Attitude-control entry

```text
从当前 synthetic workspace 根目录开始（自行 list/search，不要假设已知叶子路径），
找出姿态控制入口函数，并列出到达该入口所经过的目录与文件路径。

【粘贴上方规则】
```

### Prompt 2 — `control_allocation()` chain

```text
定位 control_allocation() 的定义与调用关系，解释控制分配链路
（virtual_control → 伪 allocation matrix / mixer → actuator channel mapping）。
只写文件能支持的内容；其余标为推断或 NOT_IN_FILE。

【粘贴上方规则】
```

### Prompt 3 — RotorLaw → actuator + canary

```text
追踪从 RotorLaw（rotor_law_update）到 actuator_command_write() 的完整调用链，
并在 fixture 中找回深层 canary（[REDACTED_CANARY_TOKEN]；完整 literal 仅存在于 RotorLaw/rotor_law.c，勿从文档猜测）。
报告 canary 所在 path；找不到则 FILE_ACCESS_VERIFIED=NO。

【粘贴上方规则】
```

---

## Pass/fail matrix

| Field | Values | Notes |
| ----- | ------ | ----- |
| `WORKSPACE_DISCOVERY` | YES/NO | Found Flight → FlightControl → ControlLaw → RotorLaw via list/search |
| `FILE_ACCESS_VERIFIED` | YES/NO | Canary recovered via Read/Search |
| `SEARCH_USED` | YES/NO | Search/grep in transcript |
| `READ_USED` | YES/NO | Read on relevant `.c` paths |
| `SYMBOL_FOUND` | YES/NO/PARTIAL | `control_allocation` and/or attitude entry / rotor / actuator |
| `CALL_CHAIN_COMPLETE` | YES/NO/PARTIAL | Entry → rotor → allocation → actuator |
| `UNSUPPORTED_CLAIMS_COUNT` | int | Target 0 |
| `CUSTOMER_SOURCE_DUMPED` | YES/NO | Must be NO (fixture is synthetic; still no dumping OEM elsewhere) |
| `HALLUCINATION_DETECTED` | YES/NO | Must be NO for class A/B |
| `PASS_CLASS` | A…F | See below |

---

## How to verify Read/Search/Shell was actually used

Operator checks the **tool transcript**, not confidence language:

1. **Search/List** appears before claiming ControlLaw/RotorLaw paths.
2. **Read** targets include at least `txg_control_task.c` and/or `control_allocation.c` / `rotor_law.c` / `actuator_command.c` as claimed.
3. Answer paths match fixture paths under `p1240-r2-synthetic-fcu/`.
4. Prompt 3: canary string appears in the answer **and** Search/Read hit the deep RotorLaw `.c`.
5. Fail if: “I read the files” with empty tool log; or chain invented from function names alone; or canary stated without tool hit.

Shell is optional; if used, it must be client-local against the fixture (e.g. `rg`/`find`), never upload to Tokfai.

---

## Result classes

| Class | Meaning |
| ----- | ------- |
| `A_PASS_ENGINEERING_TRACE` | Discovery + Read/Search + full chain + canary; evidence-bound; no hallucination |
| `B_PASS_FILE_ACCESS_ONLY` | Canary / file read proven; chain incomplete |
| `C_PARTIAL_SYMBOL_FOUND` | Some symbols/paths with tools; incomplete chain |
| `D_FAIL_NO_FILE_ACCESS` | No credible Read/Search |
| `E_FAIL_HALLUCINATION` | Unsupported or contradictory claims |
| `F_BLOCKED_NO_WORKSPACE` | Fixture root not opened / inaccessible |

---

## Honesty bound

```text
SYNTHETIC_FIXTURE_ONLY=YES
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
APPLICATION_CODE_CHANGED=NO
```

```text
TOKFAI_P1240_R2_SYNTHETIC_WORKSPACE_FIXTURE_COMPLETE=YES
APPLICATION_CODE_CHANGED=NO
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
