# 05 — Real Codex Model Matrix

## 重要区分

```text
model 出现在 /v1/models
    ≠
Codex tool flow works
```

后者需要：真实 Codex 客户端 + tools 到达 + upstream tool_calls + 本地执行 + resume。

---

## 证据层级

| 来源 | 状态 |
|------|------|
| P1120 SESSION 矩阵 | TRANSCRIPT-VERIFIED |
| `scripts/p1120-*` | **NOT IN REPOSITORY** |
| P1123 / P1123R2 | **PARTIAL**（无独立矩阵；runbook 引用；`/tmp` 痕迹） |
| P1124 runbook | COMMITTED `c123495`（固化推荐，非重新测矩阵） |

---

## P1120 矩阵（SESSION，2026-08）

客户端：真实 `codex exec` + Tokfai `wire_api=responses`。

| Model | HTTP | Tools Reached Tokfai | Tool Choice | Upstream Tool Calls | Client Executes Tool | Resume | Result | Class |
|-------|-----:|---------------------:|-------------|--------------------:|---------------------:|-------:|--------|-------|
| gpt-5.5 | 200 | YES (~15) | UNKNOWN* | NO | NO | — | stop | **C** |
| gpt-5.4 | 200 | YES (~15) | UNKNOWN* | NO | NO | — | stop | **C** |
| gpt-5.6-sol | — | NO | — | — | NO | — | unavailable | **E** |
| gemini-3.1-pro | — | NO | — | — | NO | — | unavailable | **E** |
| gemini-3-pro | 200 | YES (~22) | UNKNOWN* | YES | YES（文件 token） | YES | 完成 | **A** |

\*生产 `preserve_auto` 下无 policy 改写 → `TOOL_CHOICE_AFTER=UNKNOWN` 符合预期。

```text
VIABLE_CODEX_MODEL_FOUND=YES
BEST_CODEX_MODEL=gemini-3-pro
PROVIDER_MODEL_SELECTION_IS_NEXT_LEVER=YES
TOKFAI_NEEDS_AGENT_ORCHESTRATION=NO
TOKFAI_EXECUTES_TOOLS=NO
```

Marker（会话）：`TOKFAI_P1120_REAL_CODEX_MODEL_CANDIDATE_CANARY_PASS`

---

## gemini-3-pro 闭环（已验证形态）

```text
Codex → tools → Tokfai → provider tool_calls
  → Codex 本地执行 → tool result → resume → stop → 完成
```

---

## Current verified recommendation（时间属性）

```text
Current verified recommendation as of 2026-08:
  client = old Codex CLI
  model  = gemini-3-pro
```

> Provider routing / model implementation may change.  
> **Re-run a real-Codex canary before changing the production/default recommendation.**

禁止写成「gemini-3-pro 永远最好」。

---

## P1123 / P1123R2 与矩阵关系

- **不**另有可审计模型表  
- 意图：CLI 文件读写 proof，供 P1124 引用  
- Status：**PARTIAL** — 不可单独作为「第二套 VERIFIED 矩阵」

若需复现：重写 canary 脚本并入库（Pending）。

---

## Evidence

- Agent transcript P1120 报告  
- `docs/codex-cli-tokfai.md`  
- `01-master-timeline.md` P1123 节
