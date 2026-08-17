# 16 — P1240 Aviation Workspace Reality Test Plan (R0)

```text
P1240-R0 = PLAN ONLY
PRODUCTION_CODE_CHANGED=NO
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
WORKSPACE_UPLOADED_TO_TOKFAI=NO
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
CONCURRENCY_NOT_THE_GOAL=YES
COMMIT_PUSH_DEPLOY=NO
```

Depends on: [14-p1231-real-codex-gemini-capacity-closure.md](./14-p1231-real-codex-gemini-capacity-closure.md)  
Synthetic fixture (default safe target): [01-synthetic-customer.md](./01-synthetic-customer.md) → `test-fixtures/aviation/customer-001/`  
Isolation red line: [04-session-isolation.md](./04-session-isolation.md)

---

## 1. Goal

Prove that a **single Agent** can enter a real (or synthetic-but-realistic) aviation engineering workspace on the **client machine**, use **local** tools to discover, search, read, and trace call chains, and produce engineering judgments backed by **file evidence** — not by filename guessing or verbal claims.

Tokfai remains a **protocol bridge** only:

```text
Client Agent (Codex)  ←local tools→  Workspace on disk
        ↕ HTTPS / responses / tools protocol
     Tokfai / DMIT
        ↕
   Upstream model
```

- Local Read / Search / Shell run on the **client**.
- Customer source stays on the client; **do not upload** workspace trees to Tokfai servers.
- Docs and reports must cite **paths / function names / canary tokens / tool-use proof**, never paste customer source bodies.

### Must verify

| Capability | Meaning |
| ---------- | ------- |
| Workspace discovery | Agent finds the right subtree from a higher root without being handed the leaf path as the only step |
| File search | Agent uses search (name/content) to locate control-law / task files |
| File read | Agent actually Reads file bytes via local tool; transcript shows Read, not “I read it” |
| Call graph tracing | Agent follows caller → callee with path + function evidence |
| Function-level evidence | Claims about allocation / signals cite functions and paths |
| Canary-based read verification | Hidden deep-file token found only via real Search/Read → `FILE_ACCESS_VERIFIED=YES` |

Non-goals for P1240-R0 / early R1:

- High concurrency (that is Curve A/B / P1231–P1232)
- Production code changes
- Dumping OEM source into `docs/`
- Treating model narration as proof of file access

---

## 2. Target Example

Illustrative customer-shaped problem (paths and symbol names only — **no source bodies** in this doc):

| Role | Example locator (opaque) |
| ---- | ------------------------ |
| Control-law subtree | `…/FCU_X5/Flight/FlightControl/ControlLaw/RotorLaw` |
| Task / law C file | `…/Flight/FlightControl/ControlLaw/txg_control_task.c` |
| Focus symbol | `control_allocation()` |

How to use this example in a live run:

1. Point the Agent at a **parent** of `Flight/` / `FCU_X5/` (or the synthetic stand-in), not at the leaf file alone.
2. Require Directory Discovery → Search → Read → call-chain before any engineering conclusion about `control_allocation()`.
3. Record evidence as: absolute or workspace-relative **paths**, **function names**, **caller/callee**, **signal names** if present in source — never paste function bodies into Tokfai docs or tickets.

Default **safe** rehearsal target (no real OEM IP):

```text
test-fixtures/aviation/customer-001/
```

Synthetic pack may later grow a deep ControlLaw-like tree + canary file for automated scoring. Real customer trees are operator-local only; paths may be redacted in published scoresheets.

---

## 3. Required Gates

All gates must pass for `P1240_WORKSPACE_REALITY_PASS=YES` on a given run. Verbal claims without tool evidence → gate fail.

### A. Directory Discovery

```text
GATE_A_DIRECTORY_DISCOVERY
```

- Agent starts from an **upper** directory (repo root, `Flight/`, or `FCU_X5/`), not from a pre-opened leaf.
- Agent must **list and/or search** to locate `ControlLaw` / `RotorLaw` (or synthetic equivalents).
- Evidence: tool transcript shows directory listing or path search hits leading to the subtree.
- Fail if the only “discovery” is the user pasting the full leaf path and the Agent never lists/searches parents.

### B. Exact File Read

```text
GATE_B_EXACT_FILE_READ
```

- Agent must prove a local **Read** of `txg_control_task.c` (or synthetic twin), not inference from the filename.
- Evidence (any sufficient set):
  - Tool call log with Read targeting that path, **and**
  - Downstream claim that depends on content only knowable from the file (e.g. canary, distinctive signal name, callee only defined inside that file).
- Fail if: “I have read `txg_control_task.c`” with no Read tool; or conclusions that match only public/filename priors.

### C. Call Chain Trace

```text
GATE_C_CALL_CHAIN_TRACE
```

Agent output (scoresheet / structured note — still **no source dump**) must include:

| Field | Required |
| ----- | -------- |
| source file path | yes |
| function name | yes (e.g. `control_allocation`) |
| caller | yes (or explicit `UNKNOWN` with search evidence that none found) |
| callee | yes (or explicit `UNKNOWN` with evidence) |
| input signal | yes if present in file; else `NOT_IN_FILE` |
| output signal | yes if present in file; else `NOT_IN_FILE` |
| actuator / control allocation mapping | yes if present; else `NOT_IN_FILE` |

Rules:

- Every row must cite at least one **path + function** evidence pair from Read/Search.
- `UNKNOWN` / `NOT_IN_FILE` are allowed only after Search/Read support that claim.
- Guessing from function name alone → `HALLUCINATION_DETECTED=YES`.

### D. Canary Verification

```text
GATE_D_CANARY_VERIFICATION
```

In the **synthetic** project (required for automated honesty), place a token that exists **only** in a deep file, not in README or top-level prompts:

```text
TOKFAI_AVIATION_FILE_CANARY_<opaque_suffix>
```

Pass condition:

1. Agent does not receive the token in the user prompt.
2. Agent finds it via local **Search** and/or **Read**.
3. Agent reports the token value (or a hash of it) plus the **path** where it was found.

```text
FILE_ACCESS_VERIFIED=YES  ⟺  canary recovered via real Read/Search
FILE_ACCESS_VERIFIED=NO   ⟺  model claims read without tool proof, or wrong/missing canary
```

For real customer workspaces: do **not** insert canaries into OEM trees without customer consent. Prefer synthetic twin + path-redacted customer rehearsal, or a customer-approved canary file outside IP-sensitive law code.

---

## 4. Evaluation Matrix

Score each run. Prefer machine-checkable fields where possible.

| Metric | Type | Pass hint |
| ------ | ---- | --------- |
| `FILE_ACCESS_VERIFIED` | YES/NO | Canary (synthetic) or content-only-knowable fact + Read tool |
| `SEARCH_USED` | YES/NO | Search/grep tool appears in transcript toward target |
| `READ_USED` | YES/NO | Read tool appears on target path(s) |
| `CALL_CHAIN_COMPLETE` | YES/NO | Path, function, caller, callee, in/out signals, allocation mapping fields all filled per Gate C rules |
| `HALLUCINATION_DETECTED` | YES/NO | Claim without tool support, or contradicts file |
| `SOURCE_PATHS_PRESENT` | YES/NO | Engineering claims cite workspace paths |
| `UNSUPPORTED_CLAIMS_COUNT` | integer | Count of assertions lacking path/function/canary evidence; target **0** for PASS |

Aggregate (suggested):

```text
P1240_RUN_PASS = FILE_ACCESS_VERIFIED
  AND SEARCH_USED
  AND READ_USED
  AND CALL_CHAIN_COMPLETE
  AND HALLUCINATION_DETECTED=NO
  AND SOURCE_PATHS_PRESENT
  AND UNSUPPORTED_CLAIMS_COUNT=0
```

Honesty anti-patterns (auto-fail or hard flag):

- Model says “I read the file” without Read tool.
- Conclusions from symbol name alone (`control_allocation` ⇒ assumed mixer topology).
- Paths cited that never appear in tool results.
- Customer source pasted into chat logs that get committed to `docs/`.

---

## 5. Business Conclusion

无人机 / 飞控工程目录不是 Tokfai 的终点，而是**高复杂工程试金石**：深层路径、真实 C 任务文件、分配律与信号链路，逼出“协议桥 + 本地工具 + 证据型输出”是否成立。

**优先验证单 Agent 深度工程读取，不优先追求高并发。**

| Track | Question | Stage |
| ----- | -------- | ----- |
| Depth (P1240) | Can one Agent prove file-grounded flight-control understanding? | This plan |
| Width (P1231/P1232) | How many Agents under gates / mock infra? | Separate curves |

Tokfai does not become an onboard FCU runtime; it must remain the bridge that lets Agents work where the code already lives — on the engineer’s disk — with verifiable tool use.

---

## Execution sketch (later R1+; not executed in R0)

1. Prepare synthetic deep tree + canary under `test-fixtures/aviation/` (implementation round — not this plan).
2. Run one Codex Agent against Tokfai with workspace root = fixture (or consented customer root).
3. Prompt: locate RotorLaw/ControlLaw-class area, read the task file, trace `control_allocation` (or twin), report Gate C table + canary.
4. Score Evaluation Matrix; publish **redacted** scoresheet only.
5. Optional: second Agent on a second workspace to spot-check isolation ([04](./04-session-isolation.md)) — still depth-first, not a load ladder.

---

## Honesty Bound

```text
P1240-R0 is a plan only.
No production load test executed.
No production code changed.
No customer source content dumped into docs.
No workspace uploaded to Tokfai servers by this plan.
```

```text
TOKFAI_P1240_AVIATION_WORKSPACE_REALITY_TEST_PLAN_COMPLETE=YES
APPLICATION_CODE_CHANGED=NO
CUSTOMER_SOURCE_CONTENT_DUMPED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
