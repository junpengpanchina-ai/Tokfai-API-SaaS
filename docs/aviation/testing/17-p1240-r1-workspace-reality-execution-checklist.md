# 17 — P1240-R1 Aviation Workspace Reality Execution Checklist

```text
P1240-R1 = CHECKLIST + CUSTOMER-SAFE PROMPTS
PRODUCTION_CODE_CHANGED=NO
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
WORKSPACE_UPLOADED_TO_TOKFAI=NO
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
CONCURRENCY_NOT_THE_GOAL=YES
COMMIT_PUSH_DEPLOY=NO
```

Plan: [16-p1240-aviation-workspace-reality-test-plan.md](./16-p1240-aviation-workspace-reality-test-plan.md)  
Synthetic fixture (safe canary host): `test-fixtures/aviation/customer-001/`  
Isolation: [04-session-isolation.md](./04-session-isolation.md)

---

## 1. Purpose

This checklist verifies **real workspace file-access engineering** on the client:

| This test IS | This test is NOT |
| ------------ | ---------------- |
| Agent discovers dirs/files on disk via local tools | Model knowledge Q&A about flight control in general |
| Proof of Read / Search / Shell against a workspace | Concurrency / load ladder (P1231 / P1232) |
| Path + function + call-chain evidence | “I already read the file” without tool transcript |
| Tokfai as protocol bridge to the upstream model | Tokfai executing local tools or hosting customer trees |

```text
Client Agent (Codex)  ←local tools→  Workspace on disk
        ↕ protocol bridge
     Tokfai / DMIT
        ↕
   Upstream model
```

Customer source stays on the customer machine. Do **not** upload OEM trees to Tokfai. Do **not** paste source bodies into docs, tickets, or this checklist.

Illustrative locators (names/paths only):

| Locator | Role |
| ------- | ---- |
| `…/FCU_X5/Flight/FlightControl/ControlLaw/RotorLaw` | Control-law / rotor subtree |
| `…/Flight/FlightControl/ControlLaw/txg_control_task.c` | Task / law C file |
| `control_allocation()` | Allocation symbol |
| RotorLaw / 姿态控制 / 控制分配 / actuator command / mixer | Domain vocabulary for prompts |

---

## 2. Test Gates

Score each gate YES / NO / BLOCKED. Verbal claims without tool evidence → NO.

### A. WORKSPACE_DISCOVERY

```text
GATE_A=WORKSPACE_DISCOVERY
```

- Start Agent at an **upper** root (`FCU_X5/`, repo root, or `Flight/` parent) — not with only the leaf file open.
- Agent must **list and/or search** to locate `Flight` → `FlightControl` → `ControlLaw` → `RotorLaw` (or synthetic twins).
- Evidence: tool transcript shows listing/search hits that navigate the tree.
- Fail if discovery is only the human pasting the full leaf path with no list/search.

### B. EXACT_FILE_READ

```text
GATE_B=EXACT_FILE_READ
```

- Agent must prove a local **Read** of `txg_control_task.c` (or synthetic twin).
- Evidence: Read tool on that path **and** a claim that depends on file content (callee, signal, canary, distinctive mapping) — not filename alone.
- Fail if: “I read `txg_control_task.c`” with no Read tool; or conclusions from public/filename priors only.

### C. SYMBOL_DISCOVERY

```text
GATE_C=SYMBOL_DISCOVERY
```

- Agent must locate `control_allocation()` **definition**, **callers**, and **callees** via Search/Read.
- Output at minimum: defining path, caller list (or `UNKNOWN` + search evidence), callee list (or `UNKNOWN` + evidence).
- Fail if symbol “found” by guessing from the name without tool hits.

### D. CALL_CHAIN_TRACE

```text
GATE_D=CALL_CHAIN_TRACE
```

- Agent must produce a chain from **姿态控制** → **控制分配** → **actuator command** (or explicit `NOT_IN_FILE` / `UNKNOWN` with evidence).
- Each hop: source path + function name + evidence type (`READ` | `SEARCH` | `INFER` — see Gate F).
- Include mixer / allocation matrix / channel mapping **only if** files support it; otherwise mark `NOT_IN_FILE`.

### E. CANARY_VERIFICATION

```text
GATE_E=CANARY_VERIFICATION
```

- **Synthetic fixture only.** Embed a deep-only token, e.g. `TOKFAI_AVIATION_FILE_CANARY_<opaque_suffix>`, not in README or the user prompt.
- Agent must recover it via Search/Read → `FILE_ACCESS_VERIFIED=YES`.
- **Do not** inject canaries into real customer OEM trees without written consent. Customer runs use Gates A–D + F without Gate E, or a customer-approved non-IP canary file.

### F. EVIDENCE_BOUND

```text
GATE_F=EVIDENCE_BOUND
```

Every engineering conclusion must carry:

| Required field | Example form |
| -------------- | ------------ |
| file path | workspace-relative or absolute |
| function name | e.g. `control_allocation` |
| evidence type | `FILE` (Read/Search supported) or `INFER` (clearly labeled) |

Rules:

- Unsupported judgment → count toward `UNSUPPORTED_CLAIMS_COUNT`.
- If tools cannot open the path → Agent must say **读不到 / cannot read**, not invent.
- Distinguish **文件证据** vs **推断** in the answer.

---

## 3. Customer-Safe Prompt Templates

Copy-paste for Codex (or equivalent) with workspace root set to the engineering tree.  
Do not paste API keys. Do not ask the model to upload files to Tokfai.

Shared rules (append to every Q):

```text
规则（必须遵守）：
1. 不要猜测。没有本地文件工具证据的结论一律不要写。
2. 必须实际使用本地文件工具（List / Search / Read / 必要时 Shell）。
3. 每个结论必须列出文件路径；涉及逻辑时列出函数名。
4. 明确区分「文件证据」和「推断」两栏；推断不得伪装成证据。
5. 如果读不到文件或搜不到符号，明确写「读不到 / 找不到」，并说明已尝试的路径或搜索词。
6. 不要把源码正文大段粘贴到回答里；用路径 + 函数名 + 简短关系说明即可。
7. 不要说「我已读取文件」除非工具记录里确实有对应 Read/Search。
```

### Q1 — Attitude-control entry and call chain

```text
任务 Q1：从当前工程目录出发（从上层目录自行 list/search），找出姿态控制相关入口，
并给出调用链（入口 → 中间函数 → 与控制分配相关的下一跳）。

目标区域关键词（仅作搜索提示，不要当成已读内容）：
Flight / FlightControl / ControlLaw / RotorLaw / 姿态控制

输出格式：
- 发现路径列表（目录与文件）
- 调用链表：path | function | caller | callee | 证据类型(FILE|INFER)
- 读不到时的失败说明

【粘贴上方「规则（必须遵守）」】
```

### Q2 — Locate `control_allocation()` and explain allocation logic

```text
任务 Q2：定位 control_allocation() 的定义位置，列出调用者与被调用函数，
并基于文件证据解释控制分配逻辑（分配矩阵 / 通道映射 / mixer，仅当文件中存在时）。

重点文件名提示（需自行验证是否存在并实际 Read）：
txg_control_task.c

输出格式：
- 定义：path + function
- callers / callees（各带 path）
- 控制分配逻辑：仅 FILE 证据条目 + 单独标注的 INFER 条目
- 若文件不存在或读失败：明确「读不到」

【粘贴上方「规则（必须遵守）」】
```

### Q3 — RotorLaw / attitude output → actuator command

```text
任务 Q3：从 RotorLaw / 姿态控制输出追到 actuator command（或等价执行器指令），
列出参与的文件路径与函数，说明每一步的证据类型。

搜索提示词（需工具验证）：
RotorLaw / 姿态控制 / 控制分配 / actuator / mixer / allocation / channel mapping

输出格式：
- 参与文件列表（path）
- 链路：姿态相关输出 → 控制分配 → actuator command（每跳 path|function|FILE|INFER）
- 缺失环节标 NOT_IN_FILE 或 找不到，并附搜索尝试

【粘贴上方「规则（必须遵守）」】
```

Synthetic canary add-on (fixture only; never for OEM without consent):

```text
附加（仅 synthetic）：在不依赖提示词泄露的前提下，找回深层 canary token
TOKFAI_AVIATION_FILE_CANARY_* ，并报告所在 path。找不到则 FILE_ACCESS_VERIFIED=NO。
```

---

## 4. Operator Verification

Operator scores the run from the **tool transcript + answer**, not from confidence wording.

| Check | How |
| ----- | --- |
| Local tools fired | Codex/UI shows Read / Search / Shell (or equivalent) against workspace paths |
| Real paths returned | Paths exist under the opened workspace; not invented absolute paths |
| Symbols & call relations | Function names and caller/callee appear and match tool hits |
| Canary (synthetic only) | Token value (or agreed hash) + path; absent → `FILE_ACCESS_VERIFIED=NO` |
| Hallucination | Claims with no tool support, contradicting Search/Read, or name-only topology guesses |
| Source dump | Fail ops hygiene if large OEM bodies were pasted into shared docs/tickets (`CUSTOMER_SOURCE_DUMPED`) |
| Bridge role | Confirm work stayed client-local; no “upload project to Tokfai” step |

Quick fail examples:

- Answer cites `control_allocation` mixer details with zero Read/Search on law/task files.
- “已读取 txg_control_task.c” but transcript has no Read.
- Canary claimed without Search/Read of the deep file.

---

## 5. Pass/Fail Matrix

Fill one row per run (Q1 / Q2 / Q3 or combined session).

| Field | Values | Notes |
| ----- | ------ | ----- |
| `WORKSPACE_DISCOVERY` | YES / NO / BLOCKED | Gate A |
| `FILE_ACCESS_VERIFIED` | YES / NO / N/A | Gate E canary; N/A on consented customer run without canary |
| `SEARCH_USED` | YES / NO | Search/grep toward target |
| `READ_USED` | YES / NO | Read on target path(s) |
| `SYMBOL_FOUND` | YES / NO / PARTIAL | `control_allocation` def and/or callers/callees |
| `CALL_CHAIN_COMPLETE` | YES / NO / PARTIAL | Attitude → allocation → actuator |
| `UNSUPPORTED_CLAIMS_COUNT` | integer | Target 0 for engineering PASS |
| `CUSTOMER_SOURCE_DUMPED` | YES / NO | Must be NO for clean ops |
| `HALLUCINATION_DETECTED` | YES / NO | Must be NO for A/B pass classes |
| `PASS_CLASS` | A…F | See §6 |

Suggested coding:

```text
IF workspace missing/unreadable → F_BLOCKED_NO_WORKSPACE
ELSE IF HALLUCINATION_DETECTED=YES → E_FAIL_HALLUCINATION
ELSE IF READ_USED=NO AND SEARCH_USED=NO → D_FAIL_NO_FILE_ACCESS
ELSE IF CALL_CHAIN_COMPLETE=YES AND UNSUPPORTED_CLAIMS_COUNT=0
     AND (FILE_ACCESS_VERIFIED=YES OR FILE_ACCESS_VERIFIED=N/A)
     AND SYMBOL_FOUND=YES → A_PASS_ENGINEERING_TRACE
ELSE IF FILE_ACCESS_VERIFIED=YES AND CALL_CHAIN incomplete → B_PASS_FILE_ACCESS_ONLY
ELSE IF SYMBOL_FOUND=YES|PARTIAL but chain incomplete → C_PARTIAL_SYMBOL_FOUND
ELSE → D_FAIL_NO_FILE_ACCESS or C_PARTIAL_SYMBOL_FOUND (operator pick by evidence)
```

---

## 6. Result Classes

| Class | Meaning |
| ----- | ------- |
| `A_PASS_ENGINEERING_TRACE` | Discovery + Read/Search + symbol + full attitude→allocation→actuator chain; evidence-bound; no hallucination; canary YES or N/A |
| `B_PASS_FILE_ACCESS_ONLY` | Real file access proven (esp. canary or Read on task file) but call chain incomplete |
| `C_PARTIAL_SYMBOL_FOUND` | Symbol or fragment of chain found with tools; not full engineering trace |
| `D_FAIL_NO_FILE_ACCESS` | No credible Read/Search proof of workspace files |
| `E_FAIL_HALLUCINATION` | Unsupported or contradictory engineering claims |
| `F_BLOCKED_NO_WORKSPACE` | Workspace not mounted / path denied / Agent cannot see tree |

---

## 7. Business Conclusion

无人机客户验证重点是**单 Agent 深度工程读取、调用链追踪、证据可追溯**。当前不优先追高并发。

Tokfai 的商业价值是把上游模型能力**工程化落地到真实研发文件**，而不是只做聊天：协议桥接 + 客户端本地工具 + 路径/函数级证据，才是飞控/分配律场景里可销售的差异。

| Priority now | Defer |
| ------------ | ----- |
| Depth: Gates A–F on one Agent | Width: 10–500 concurrency ladders |
| Customer-safe prompts Q1–Q3 | Uploading OEM trees to the server |
| Scoresheet with `PASS_CLASS` | Treating narration as file proof |

---

## Operator run stamp (fill when executing)

```text
RUN_ID=
WORKSPACE_CLASS=synthetic|customer_local
GATES_A_F=
PASS_CLASS=
FILE_ACCESS_VERIFIED=
CUSTOMER_SOURCE_DUMPED=NO
NOTES_REDACTED_ONLY=
```

---

## Honesty Bound (this document)

```text
P1240-R1 checklist + prompts only.
No production code changed.
No customer source content dumped.
No commit / push / deploy by this task.
```

```text
TOKFAI_P1240_R1_WORKSPACE_REALITY_EXECUTION_CHECKLIST_COMPLETE=YES
APPLICATION_CODE_CHANGED=NO
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
