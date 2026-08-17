# 01 — Master Timeline（P108x–P1126 焦点）

每个重要项含 Historical / Later / Current。无法证明标 **UNKNOWN**。

核验 `HEAD=5f25c39`（2026-08-16）。

---

## P1083 — Responses tools / tool_choice adapter

**Status:** ACTIVE + COMMITTED

### Problem

`/v1/responses` flat tools 与 Chat Completions nested `function` 形状不一致，Codex 真实 toolcall 失败风险。

### Hypothesis

协议适配即可让上游识别 tools。

### Implementation / Investigation

`responsesToolAdapter.ts`：`normalizeResponsesToolsForChatCompletions`、`normalizeResponsesToolChoiceForChatCompletions`、`copyFunctionFields`。

### Files

`apps/dmit-api/src/lib/responsesToolAdapter.ts`、`responsesTransform.ts`、`scripts/p1083-*`

### Test

`TOKFAI_P1083_CODEX_RESPONSES_REAL_TOOLCALL_HOTFIX_PASS`

### Result

Adapter 落地。

### Historical conclusion

形状适配是必要条件。

### Later evidence

P1119：adapter 丢弃 `inputSchema` 填空 stub = 潜在洞，但非真 Codex 失败唯一根因。

### Current conclusion

Adapter **仍有效且必需**；不等于模型一定返回 tool_calls。

### Commit

`fcf2f7e`

### Deploy

UNKNOWN

### Evidence

`git show --stat fcf2f7e`

---

## P1087 / P1088 / P1090 — Auto retry / blank reject / GrsAI fallback

**Status:** COMMITTED；transparent 默认路径 **SUPERSEDED by P1109**

### Problem

`tool_choice=auto` 且无 tool_calls。

### Hypothesis

二次 fetch / 强制 required / 文本解析可“修好”。

### Implementation

`codexAutoToolRetry.ts`、`grsaiToolCompatFallback.ts` + exec 接线。

### Commits

`d5a0c67` · `f67a3a0` · `caa5a37`

### Historical conclusion

当时认为网关应补刀。

### Later evidence

P1109：transparent auto 必须 bypass。

### Current conclusion

模块保留；**transparent + auto 不走默认二次 fetch**。

### Deploy

UNKNOWN

---

## P1093 / P1095 / P1097 / P1098 — previous_response_id / durable / canonical / stream save

**Status:** ACTIVE + COMMITTED

### Problem

客户端执行工具后回传断链 / 状态丢失 / 流结束未保存。

### Hypothesis

Tokfai 做 state bridge（不执行工具）。

### Commits

`82d1d11` · `944c040` · `cb052c3` · `04ff80d`

### Current conclusion

多轮 resume 基础设施有效；Tokfai 仍不执行工具。

### Deploy

UNKNOWN（durable 还依赖 env opt-in）

---

## P1100 — Transport failover

**Status:** ACTIVE + COMMITTED · Commit `3e1e437` · Deploy UNKNOWN

---

## P1101 / P1102 — Client config / canary helpers

**Status:** NOT_IN_REPO

### Problem

本机 Codex→Tokfai 配置与手动 canary。

### Result

会话曾存在 docs/scripts；当前树与 git history **无文件**。

### Current conclusion

runbook 仍引用路径 → **死链**；结论被 P1124 部分吸收。

### Commit / Deploy

— / —

---

## P1109 — Transparent no tool force

**Status:** ACTIVE + COMMITTED

### Problem

transparent 路径被 retry/fallback 强制工具，破坏“透明 relay”。

### Hypothesis

auto 下应原样返回 provider 决策。

### Implementation

`transparentToolForceBypass.ts`；跳过 `codex_auto_tool_retry` / `grsai_tool_compat_fallback`。

### Files

bypass 模块、`executeChatCompletion.ts`、`scripts/p1109-*`

### Test

`TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_PASS`

### Historical conclusion

强制工具不是 transparent 正解。

### Later evidence

P1114+：auto 常无 tool_calls 是 **模型决策**；应用 opt-in policy / 换模型，而非恢复默认 force。

### Current conclusion

**现行默认原则。**

### Commit

`3e15e0a`

### Deploy

UNKNOWN

---

## P1111 — Client route audit（SESSION）

**Status:** DIAGNOSTIC_ONLY

### Result（会话）

当时 shell 可能缺 `TOKFAI_API_KEY`；`auth.json` 可能为 ChatGPT OAuth。

### Commit

—

---

## P1114 — Capability matrix

**Status:** DIAGNOSTIC + script COMMITTED（`3c95377`）

### Problem

`/v1/responses`→GrsAI 是否支持 tool_call。

### Result（SESSION，默认 gpt-5.5）

auto=NO；required/named=YES；chat 同理；真 Codex upstream tool_calls=NO。

### Historical conclusion

`B_MODEL_AUTO_TOOL_DECISION`

### Current conclusion

链路 **capable**；auto 下模型常不调 —— 仍成立，但不覆盖真 Codex 全量失败。

---

## P1115 — Explicit tool_choice policy

**Status:** ACTIVE + COMMITTED

### Problem

需要可控 required，且不破坏 P1109。

### Implementation

`TOKFAI_CODEX_TOOL_CHOICE_POLICY`：`preserve_auto`（**源码默认**）| `required_when_tools_present`  
条件：`/v1/responses` + transparent + toolsCount>0 + auto/missing → outbound `required`。

### Historical conclusion

opt-in 可在简化场景提升 tool_calls。

### Later evidence

P1118：真 Codex + required 仍可能 stop；P1116D1 生产恢复 preserve_auto（SESSION）。

### Current conclusion

默认 **preserve_auto**；opt-in 仅实验。生产 env 值 UNKNOWN。

### Commit

`3c95377`

---

## P1116R2 — Wire proof + privacy-safe diag

**Status:** ACTIVE + COMMITTED（`5f25c39`）

### Problem

无法证明 provider 真收到什么 `tool_choice`/tools。

### Hypothesis

clientBody.tool_choice ≠ outbound；需 fetch 前 wire 日志。

### Implementation

`upstreamToolChoiceWireDiag.ts` + `upstream_tool_choice_wire`。

### Historical conclusion

Wire 上 opt-in required 可证；若仍无 tool_calls → 非“policy 没打到线”。

### Current conclusion

诊断层有效；**不改变**模型是否 tool_call。

### Deploy

UNKNOWN

---

## P1117 — Upstream LIVE matrix

**Status:** TRANSCRIPT-VERIFIED / SCRIPT NOT IN REPOSITORY

### Result（SESSION）

```text
ROOT_CLASS=MODEL_AUTO_TOOL_DECISION_ONLY
MINIMAL_AUTO=NO; REQUIRED/NAMED=YES; CODEX_SCHEMA_REQUIRED=YES
```

### Current conclusion

简化探测仍有参考价值；脚本丢失 → 不可当前复现。

---

## P1118 — Real Codex Desktop observe

**Status:** DIAGNOSTIC_ONLY（无专用 commit）

### Result（SESSION）

toolsCount≈15、policy→required、toolsByteLength≈17202，仍 stop / 无 tool_calls。

### Historical conclusion

“required + 真 schema 字节”仍失败。

### Current conclusion

引出 P1119 / P1120。

---

## P1119 — Real Codex schema wire diff

**Status:** ACTIVE + script COMMITTED（`5f25c39`）

### Problem

为何 P1117 required 成功而 P1118 失败。

### Result（SESSION）

```text
ROOT_CLASS=C_PROVIDER_MODEL_IGNORES_REQUIRED_FOR_REAL_SCHEMA
TOKFAI_SWALLOWED_TOOL_CALLS=NO
```

空 stub alone **不能**解释。

### Historical conclusion

疑 schema / stub。

### Later evidence

简化/转换 schema + required 可成功；真 Codex 全请求仍可能 ignore。

### Current conclusion

下一杠杆 = **模型/客户端选择**（P1120）。

---

## P1120 — Real Codex model canary

**Status:** TRANSCRIPT-VERIFIED / SCRIPT NOT IN REPOSITORY；产品结论 ACTIVE

### Result（SESSION）

| Model | Class |
|-------|-------|
| gpt-5.5 / gpt-5.4 | C |
| gpt-5.6-sol / gemini-3.1-pro | E unavailable |
| gemini-3-pro | A |

```text
BEST_CODEX_MODEL=gemini-3-pro
PROVIDER_MODEL_SELECTION_IS_NEXT_LEVER=YES
TOKFAI_NEEDS_AGENT_ORCHESTRATION=NO
```

### Current conclusion

**As of 2026-08：** 推荐 gemini-3-pro；须定期重跑 canary。

---

## P1123 / P1123R2 — CLI file proof（PARTIAL）

**Status:** PARTIAL

### Problem

在 P1120 模型结论之上，固化“old CLI + 真文件读写”操作事实，供手册引用。

### Hypothesis

与 P1120 同类：真 Codex CLI 文件 roundtrip。

### Implementation / Investigation

- 仓库：**无** scripts / commit / PASS marker  
- `git log --grep=1123`：**空**  
- 引用：`docs/codex-cli-tokfai.md`「P1120 / P1123R2」  
- 本地：`/tmp/tokfai-p1123-prompt.txt`（2026-08-16；**不复述正文**）；`/tmp/tokfai-p1123-pm2.log` 为空  
- P1125 将 `.tokfai-canary` 标为 P1113–P1123 local tokens  

### Result

**无法从 repo 完整复现矩阵。** 仅能证明：存在过以 p1123 canary 为名的提示痕迹，且 P1124 声称基于 P1123R2。

### Historical conclusion

（若曾跑通）被视为 runbook 依据。

### Later evidence

P1124 吸收为操作文档；独立证据链弱于 P1120。

### Current conclusion

**P1123R2_STATUS=PARTIAL**。可操作事实以 P1120 SESSION + P1124 文档为准；缺独立可审计 PASS。

### Commit / Deploy

— / —

### Evidence

runbook 引用；`/tmp` 文件元数据；无 git 对象。

---

## P1124 — Codex CLI runbook

**Status:** ACTIVE + COMMITTED · `c123495`  
Marker：`TOKFAI_P1124_CODEX_CLI_TOKFAI_RUNBOOK_PASS`

### Current conclusion

**唯一日常操作入口。**

---

## P1125 — Worktree leftover classify

**Status:** DONE（审计）

### Result

分类 wire-diag / STT / canary / 未跟踪诊断脚本；禁止 silent discard prod dirty。

---

## P1126 — Wire-diag precommit audit → commit

**Status:** COMMITTED（经审批后落地）

### Historical（audit 当时）

```text
A_APPROVE_WIRE_DIAG_COMMIT
尚未 commit
```

### Later

创建 `5f25c39`（allowlist 8 文件，无混入）。

### Current conclusion

```text
WIRE_DIAG_STATUS=COMMITTED_IN_MAIN
WIRE_DIAG_COMMIT=5f25c39
DEPLOYED=UNKNOWN
```

---

## ASCII 主线

```text
P1083 adapter
 → P1087/88/90 force/retry     ──┐
 → P1093–98 state                 │
 → P1109 no-force transparent  ←─┘
 → P1114 matrix
 → P1115 opt-in policy
 → P1116R2 wire diag
 → P1117/18/19 harness vs real
 → P1120 model canary
 → P1123/R2 CLI proof (PARTIAL)
 → P1124 runbook
 → P1125 leftovers
 → P1126 approve → 5f25c39
```
