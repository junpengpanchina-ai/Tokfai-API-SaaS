# Tokfai Codex 工程历史知识库

> 面向：新工程师 / 新 Cursor 会话 / 新 Codex 会话  
> 目标：5–30 分钟内恢复 Codex / Responses / Tool Calling 上下文  
> **日常操作入口：** [`docs/codex-cli-tokfai.md`](../codex-cli-tokfai.md)  
> **本目录：** 可审计工程历史（非操作手册全文复制）

---

## 仓库核验快照（本轮封档）

```text
CURRENT_HEAD=5f25c399d08bcb419d77f9061663f835627922b1
WORKTREE_STATUS=docs dirty only (codex-history + codex-cli-tokfai.md link)
DATE=2026-08-16
```

`git status --short`（封档时）：

```text
 M docs/codex-cli-tokfai.md
?? docs/codex-history/
```

应用代码 / scripts 逻辑：**未改**。

---

## 5 分钟问答

### 1. Tokfai 是什么？

OpenAI-compatible **API Gateway / Relay**（`https://api.tokfai.com`）。做：provider relay、协议适配、billing、durable/state、logs、Responses / tool wire 兼容。

### 2. Tokfai 不做什么？

**不**打开本地文件、不执行 Shell、不写用户目录、不自己跑 Read/Write/Shell loop。本地工具由 **Codex CLI / Agent Runtime** 执行。

### 3. 为什么 Codex tool flow 曾经失败？

常见表现：`tools` 已到网关，但上游返回 `stop` 且无 `tool_calls`。调查表明：transparent 下不应靠网关强制；简化 harness 上 `required` 常成功，**真 Codex 全量请求**下 gpt-5.x 仍常失败；根因更靠近 **模型 + 全请求上下文**，不是「网关没收到 tools」。

### 4. P1109 解决了什么？

transparent `/v1/responses` + `tool_choice=auto` 时：**禁止**猜 prompt、强制工具、二次 provider fetch。provider stop → 原样返回。Commit：`3e15e0a`。

### 5. P1115 解决了什么？

Opt-in 策略 `TOKFAI_CODEX_TOOL_CHOICE_POLICY`：默认 `preserve_auto`；仅 `required_when_tools_present` 时把 auto→required。不执行工具、不开第二轮。Commit：`3c95377`。

### 6. wire diag 为什么需要？

`chat_completion_succeeded.toolChoice` 反映 **client** 侧，不能证明 **outbound provider JSON**。`upstream_tool_choice_wire` 在 `providerFetch` 前记录隐私安全指纹。

**状态史：** P1126 审计 `A_APPROVE`（尚未 commit）→ 随后创建 commit `5f25c39` → **当前 COMMITTED**（生产是否已 deploy：**UNKNOWN**）。

### 7. gpt-5.x 为什么不是当前工具流首选？

P1120（会话）：`gpt-5.5` / `gpt-5.4` 可达 Tokfai、收到 tools，常无 `tool_calls`（CLASS C）。

### 8. gemini-3-pro 为什么被推荐？

**As of 2026-08（非永久真理）：** P1120 真实 `codex exec` 下 CLASS A（tool_calls + 文件 token 闭环）。上游路由可能变化；改默认前须重跑真实 Codex canary。

### 9. 当前代码 commit 到哪里？

| 主题 | Commit |
|------|--------|
| P1109 no-force | `3e15e0a` |
| P1115 policy | `3c95377` |
| P1124 runbook | `c123495` |
| wire-diag (P1116R2/P1119/P1126) | `5f25c39` ← **HEAD** |

### 10. 当前还有哪些 dirty / unknown？

- 工作区：仅 `docs/**`（本封档）  
- `stash@{0}`：STT + P1087/88/90 测试对齐（未提交）  
- 生产 deploy / 生产 env policy：**UNKNOWN**  
- P1117/P1120/P1101/P1102 脚本：**NOT_IN_REPO**  
- **P1123 / P1123R2：PARTIAL**（见下）

### 11. 下一步为什么是 Engineering Gateway / Aviation？

产品差异化不是「更便宜卖模型」，而是把上游能力变成可在真实工程目录执行、验证、交付的能力。Aviation 为 **PLANNED** 入口（见 `docs/aviation/`），本轮不实现业务逻辑。

---

## 当前推荐链路

```text
old Codex CLI
  → https://api.tokfai.com/v1
  → wire_api=responses
  → Tokfai
  → GRSAI / upstream
  → gemini-3-pro   (as of 2026-08)
```

Env：`TOKFAI_API_KEY`（禁止写真实 key）。  
Policy 代码默认：`TOKFAI_CODEX_TOOL_CHOICE_POLICY=preserve_auto`。

---

## P1123 / P1123R2（封档结论）

| 项 | 结论 |
|----|------|
| 仓库脚本 / commit | **无** |
| git log `--grep=1123` | **空** |
| runbook 引用 | `docs/codex-cli-tokfai.md`：「依据 P1120 / P1123R2」 |
| 本地痕迹 | `/tmp/tokfai-p1123-prompt.txt`（2026-08-16；内容不入库）；pm2 log 空 |
| 与 P1120 | 高度重叠：真 Codex + 文件 canary；P1120 有会话矩阵，P1123R2 **缺独立 PASS/矩阵** |
| 被谁吸收 | 结论被 **P1124 runbook** 吸收 |
| Status | **PARTIAL** |

---

## 文档索引

| 文件 | 内容 |
|------|------|
| [01-master-timeline.md](./01-master-timeline.md) | P 时间线 |
| [02-project-ledger.md](./02-project-ledger.md) | 台账 + DISCOVERED_PROJECT_IDS |
| [03-architecture-and-principles.md](./03-architecture-and-principles.md) | 架构与原则 |
| [04-tool-calling-investigation.md](./04-tool-calling-investigation.md) | 技术调查核心 |
| [05-real-codex-model-matrix.md](./05-real-codex-model-matrix.md) | 模型矩阵 |
| [06-production-and-wire-diagnostics.md](./06-production-and-wire-diagnostics.md) | 日志 / wire |
| [07-tests-and-regressions.md](./07-tests-and-regressions.md) | 测试表 |
| [08-worktree-leftovers.md](./08-worktree-leftovers.md) | leftovers / stash |
| [09-decisions-and-dead-ends.md](./09-decisions-and-dead-ends.md) | 死胡同 |
| [10-runbook-and-next-actions.md](./10-runbook-and-next-actions.md) | 下一步 + Engineering Gateway |
| [11-glossary.md](./11-glossary.md) | 专名 |
| [`../aviation/README.md`](../aviation/README.md) | Aviation（PLANNED） |

### 相关既有文档

- [`docs/codex-cli-tokfai.md`](../codex-cli-tokfai.md)  
- [`docs/cursor-codex-commercial-sop.zh.md`](../cursor-codex-commercial-sop.zh.md)（工具流话术可能过时）  
- Cursor 前史报告：`docs/p969-*` … `p987-*`

---

## 真实性规则

1. **FACT** = commit / 源码 / 入库脚本  
2. **SESSION** = transcript / LIVE（脚本可能已丢）  
3. **INFERENCE** 须标明  
4. **UNKNOWN** 不猜测  
5. **PLANNED** ≠ DONE  
6. Historical vs Current **必须分开**
