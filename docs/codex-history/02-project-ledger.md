# 02 — Project Ledger

核验：`HEAD=5f25c399d08bcb419d77f9061663f835627922b1`（2026-08-16）

```text
代码存在 ≠ 已 commit ≠ 已 deploy ≠ 生产验证
```

Deploy 列无 SSH 证据时一律 `UNKNOWN`。

---

## DISCOVERED_PROJECT_IDS

仓库 `docs/` + `scripts/` + `apps/dmit-api/src` + `AGENTS.md` 扫描到的 P 编号（去重后约 **248** 个，含商业/图像/Hermes 等旁路）。

### Codex / Responses / Tool 主线（本知识库焦点）

```text
P785 P930 P969 P970 P971 P972 P974 P985 P986 P987
P1017–P1055 (tool-intent / resume / gemini adapter 前史)
P1059 P1061 P1062 P1067 P1070
P1080 P1081 P1081R2 P1082 P1083 P1084 P1085 P1085R2
P1087 P1088 P1090 P1092 P1093 P1095 P1096 P1097 P1098
P1100 P1101 P1102 P1103 P1104 P1105 P1106 P1107
P1109 P1110 P1111 P1114 P1115 P1115R2 P1116 P1116D1 P1116R2
P1117 P1118 P1119 P1120 P1123 P1123R2 P1124 P1125 P1126
P1128R2 (stash 标签 only)
```

完整枚举见扫描输出；台账下表覆盖 **P1080–P1126 及相关**。

---

## 主台账

| ID | 名称 | 类型 | 首次问题 | Result | Commit | Deploy | Current Status | Superseded By | Evidence |
|----|------|------|----------|--------|--------|--------|----------------|---------------|----------|
| P1080 | Stream cancel + heavy queue | prod fix | 流取消未 abort / 重请求 | 修复 | `a37994a` | UNKNOWN | ACTIVE+COMMITTED | — | scripts/p1080* |
| P1081 | completed usage total_tokens | prod fix | usage 缺 total | 修复 | `fb772e7` | UNKNOWN | ACTIVE+COMMITTED | — | scripts/p1081* |
| P1081R2 | Wire predeploy gate | gate | 部署前 wire | gate | UNKNOWN 精确 | n/a | ACTIVE | — | scripts/p1081r2* |
| P1082 | （stash 提及） | UNKNOWN | UNKNOWN | UNKNOWN | — | — | UNKNOWN | — | stash@{1} msg |
| P1083 | Tools/tool_choice adapter | prod adapter | Responses≠Chat tools 形 | 适配器落地 | `fcf2f7e` | UNKNOWN | ACTIVE+COMMITTED | — | responsesToolAdapter.ts |
| P1084 | Usage client/upstream route | prod/audit | usage 路由混淆 | 分离展示 | `7b80632` | UNKNOWN | ACTIVE | — | scripts/p1084* |
| P1085R2 | STT channel reality | STT | 错误分类 | 修复 | `36b9a0d` | UNKNOWN | ACTIVE；stash 有测试 diff | — | scripts/p1085r2* |
| P1087 | Auto tool retry | prod | auto 无 tool_calls | 二次 fetch | `d5a0c67` | UNKNOWN | SUPERSEDED(transparent) | P1109 | codexAutoToolRetry.ts |
| P1088 | Retry blank reject | prod | 空白 retry | 拒绝空白 | `f67a3a0` | UNKNOWN | SUPERSEDED(transparent) | P1109 | |
| P1090 | GrsAI tool compat fallback | prod | 文本假 tool | fallback | `caa5a37` | UNKNOWN | SUPERSEDED(transparent) | P1109 | |
| P1092 | Global compat matrix | diag LIVE | 兼容面 | 脚本 | via `82d1d11` | n/a | DIAGNOSTIC_ONLY | — | scripts/p1092* |
| P1093 | previous_response_id bridge | prod | 工具回传断链 | bridge | `82d1d11` | UNKNOWN | ACTIVE+COMMITTED | — | |
| P1095 | Durable tool state | prod opt-in | 多实例状态 | durable | `944c040` | UNKNOWN | ACTIVE(opt-in) | — | |
| P1097 | Canonical state key | prod | id 不对齐 | canonicalize | `cb052c3` | UNKNOWN | ACTIVE | — | |
| P1098 | Await stream state save | prod | 流结束未 await save | await | `04ff80d` | UNKNOWN | ACTIVE | — | |
| P1100 | Transport failover | prod | 无响应传输失败 | retry | `3e1e437` | UNKNOWN | ACTIVE | — | |
| P1101 | Client config docs | diag | 客户端配置 | SESSION | — | — | NOT_IN_REPO | — | P1125 列表 |
| P1102 | Config helper / canary | diag | 本机 Codex→Tokfai | SESSION | — | — | NOT_IN_REPO | — | runbook 死链 |
| P1103 | STT admin root cause | STT | admin 400 | 修复 | 见 stt commits | UNKNOWN | ACTIVE；stash | — | |
| P1104 | GrsAI STT adapter | STT | STT provider | adapter | `0176d9c` 等 | UNKNOWN | ACTIVE；stash | — | |
| P1105 | leftovers | UNKNOWN | UNKNOWN | UNKNOWN | — | — | NOT_IN_REPO | — | P1125 |
| P1106 | leftovers | UNKNOWN | UNKNOWN | UNKNOWN | — | — | NOT_IN_REPO | — | P1125 |
| P1107 | STT capability gate | STT | 能力/文档真相 | gate | `312ff00` 等 | UNKNOWN | ACTIVE；stash | — | |
| P1109 | Transparent no tool force | prod principle | 透明路径被强制 | bypass | `3e15e0a` | UNKNOWN | ACTIVE+COMMITTED | — | |
| P1110 | 本地读文件归因 | session | 误判流量 | 审计 | — | — | DIAGNOSTIC_ONLY | — | transcript |
| P1111 | Client route audit | session | key/env 缺失 | 审计 | — | — | DIAGNOSTIC_ONLY | — | transcript |
| P1114 | Capability matrix | diag | 是否支持 tool_call | auto=NO required=YES | `3c95377` | n/a | DIAGNOSTIC_ONLY+COMMITTED(script) | — | |
| P1115 | Explicit tool_choice policy | prod opt-in | 可控 required | policy | `3c95377` | UNKNOWN | ACTIVE+COMMITTED | — | env default preserve_auto |
| P1115R2 | Precommit audit | audit | 可否提交 P1115 | APPROVE→commit | →`3c95377` | n/a | DONE | — | transcript |
| P1116 | Wire 问题提出 | diag | outbound 未证 | 引出 R2 | — | — | SUPERSEDED | P1116R2 | |
| P1116D1 | Prod env restore | ops | opt-in 验证后收回 | preserve_auto | — | UNKNOWN | DIAGNOSTIC_ONLY | — | session |
| P1116R2 | Wire proof + diag | diag+prod log | client≠outbound | wire log | `5f25c39` | UNKNOWN | ACTIVE+COMMITTED | — | |
| P1117 | Upstream LIVE matrix | diag | required vs auto | MODEL_AUTO_ONLY | — | n/a | TRANSCRIPT；SCRIPT NOT IN REPO | — | |
| P1118 | Real Codex Desktop observe | observe | required 仍 stop | 观测 | — | n/a | DIAGNOSTIC_ONLY | →P1119 | |
| P1119 | Schema wire diff | diag | P1117 vs P1118 | ROOT C | `5f25c39` | UNKNOWN | ACTIVE+COMMITTED(script) | — | |
| P1120 | Model canary | diag | 哪模型可用 | gemini A | — | n/a | TRANSCRIPT；SCRIPT NOT IN REPO；结论 ACTIVE | →P1124 | |
| P1123 | CLI file canary（推断） | diag | 真文件读写 | PARTIAL | — | — | PARTIAL/UNKNOWN | →P1124 | /tmp 痕迹；无 PASS |
| P1123R2 | CLI proof（runbook 依据） | diag | 固化操作事实 | PARTIAL | — | — | PARTIAL | →P1124 | 仅被引用 |
| P1124 | Codex CLI runbook | docs | 可交接操作 | 文档+check | `c123495` | n/a | ACTIVE+COMMITTED | — | |
| P1125 | Leftover classify | audit | dirty 分类 | plan | — | n/a | DONE | — | |
| P1126 | Wire-diag precommit | audit→commit | 可否提交 diag | A_APPROVE→`5f25c39` | `5f25c39` | UNKNOWN | COMMITTED | — | 见状态史 |
| P1128R2 | stash 标签 | ops | freeze leftovers | stash | — | — | UNKNOWN 细节 | — | `stash@{0}` msg |

---

## Wire-diag 状态史（禁止覆盖）

```text
P1126 audit（会话）:
  FINAL_VERDICT=A_APPROVE_WIRE_DIAG_COMMIT
  状态 = APPROVED / 尚未 commit

        ↓ 后续（同日）

commit 5f25c39 chore(diagnostics): add upstream tool choice wire diag
  文件集合 = P1126 allowlist 8 paths（git show 核验，无混入 STT/canary）

        ↓ 当前（2026-08-16 HEAD）

WIRE_DIAG_STATUS=COMMITTED_IN_MAIN
WIRE_DIAG_COMMIT=5f25c39
DEPLOYED=UNKNOWN
```

Allowlist（与 commit 一致）：

```text
apps/dmit-api/src/lib/upstreamToolChoiceWireDiag.ts
apps/dmit-api/src/lib/executeChatCompletion.ts
apps/dmit-api/src/logger.ts
scripts/lib/p1109-allow-transparent-tool-force-chat-diff.mjs
scripts/p1116r2-responses-upstream-tool-choice-wire-proof.mts
scripts/p1116r2-responses-upstream-tool-choice-wire-proof.mjs
scripts/p1119-real-codex-tool-schema-wire-diff.mts
scripts/p1119-real-codex-tool-schema-wire-diff.mjs
```

---

## 计数（封档用）

| 指标 | 约数 |
|------|------|
| DISCOVERED_PROJECT_IDS（全仓扫描） | 248 |
| LEDGER 表行（本文件主线） | 45+ |
| SUPERSEDED（transparent 默认） | P1087 P1088 P1090 |
| NOT_IN_REPO / PARTIAL | P1101–06, P1117, P1120, P1123/R2 |
| ACTIVE 原则 | P1109 P1115(default) P1083 P1093… |

---

## Evidence

- `git show --name-only 5f25c39`  
- `git log --oneline -n 100`  
- `rg -o 'P[0-9]{3,4}…'` on docs/scripts/src  
- Agent transcript（P1114–P1126）
