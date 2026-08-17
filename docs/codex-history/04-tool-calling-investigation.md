# 04 — Tool Calling Investigation（技术核心）

核验源码默认：`TOKFAI_CODEX_TOOL_CHOICE_POLICY` → **`preserve_auto`**（`apps/dmit-api/src/env.ts`）。

---

## 三层请求体（必须分清）

```text
Client request
    │  clientBody.tools / clientBody.tool_choice
    ▼
Tokfai normalized / adapted body
    │  Responses→Chat tools 形状；可选 P1115 改写 tool_choice
    ▼
Actual provider wire (upstreamBody)
    │  providerFetch({ json: upstreamBody })
    ▼
Upstream model response (tool_calls | stop)
```

### 关键不等式

```text
client tool_choice
    ≠
provider outbound tool_choice   （仅当 policy applied 或 adapter 改写时）
```

```text
chat_completion_succeeded.toolChoice
    ≠
证明 upstream JSON 里的 tool_choice
```

要用：`upstream_tool_choice_wire`（P1116R2）。

---

## 调查链

```text
P1109 → P1114 → P1115 → P1116R2 → P1117 → P1118 → P1119 → P1120
         (+ P1123/R2 PARTIAL → P1124 吸收)
```

---

## 最早问题

Codex 带 tools，常 `tool_choice=auto`，上游经 Tokfai 返回：

```text
stop + tool_calls=none
```

同时网关可看到 tools 已到达（`cursor_tool_request_received`）。

---

## P1109 — Transparent no-force

**FACT** commit `3e15e0a` · `transparentToolForceBypass.ts`

当 transparent `/v1/responses` + auto/missing：

Tokfai **不应**：

```text
猜 Prompt → 猜工具 → 强制工具 → 再发 provider request
```

应：

```text
provider stop + no tool_calls → 原样返回 stop
默认保持 transparent relay
```

日志：`transparent_tool_force_bypassed`

---

## P1114 — Capability matrix（简化客户端）

**SESSION**（脚本已入库）：auto 无 tool_calls；required/named 有。

Historical：`B_MODEL_AUTO_TOOL_DECISION`  
Current：链路 capable；auto=模型决策 —— 仍参考，但不解释真 Codex 全量失败。

---

## P1115 — Explicit policy（opt-in）

**FACT** `3c95377` · `codexExplicitToolChoicePolicy.ts`

| Env | 行为 |
|-----|------|
| `preserve_auto`（**默认**） | 不改写 |
| `required_when_tools_present` | responses+transparent+tools>0+auto/missing → `required` |

不做：看 prompt、选工具名、执行工具、第二轮 fetch、改 chat 路由。

Historical：opt-in 可提升简化场景。  
Later：真 Codex 仍可能 ignore required（P1118）。  
Current：默认 preserve；生产 env UNKNOWN。

---

## P1116R2 — 为什么需要 wire diag

Historical：只看成功日志的 `toolChoice` 会误判。  
Current：fetch 前记录 outbound kind/shape + schema 指纹；**不 mutate body**。

Commit：`5f25c39`（经 P1126 approve）。

---

## P1117 / P1118 / P1119 — harness vs real

### simplified harness

短消息、少 tools、干净 parameters、少 metadata。

### real Codex full request

可能含：多条 system/developer/user、reasoning、include、client_metadata、previous state、大量 tools、大 schema、多轮 resume。

| 阶段 | 结论 |
|------|------|
| P1117 Historical | `MODEL_AUTO_TOOL_DECISION_ONLY`（简化） |
| P1118 | 真 Desktop + required 仍 stop |
| P1119 Historical | 疑 schema/stub |
| P1119 Later | 空 stub / 真 parameters harness 均可出 tool_calls；吞 tool_calls=NO |
| P1119 Current | `C_PROVIDER_MODEL_IGNORES_REQUIRED_FOR_REAL_SCHEMA`；下一杠杆模型选择 |

P1117 脚本：**NOT_IN_REPO**（TRANSCRIPT-VERIFIED）。

---

## inputSchema vs parameters investigation

源码：`apps/dmit-api/src/lib/responsesToolAdapter.ts`

### `copyFunctionFields`

- 拷贝 `name` / `description` / `parameters` / `strict`
- 缺 `parameters` → stub `{ type:"object", properties:{} }`
- **不拷贝** `inputSchema` / `input_schema`

### `normalizeResponsesToolsForChatCompletions`

- flat Responses function → nested Chat `function`
- 已 nested 再规范化
- 非 function（computer_use/mcp）passthrough

### 当时怀疑

Codex session 用 `inputSchema` → 转换只取 `parameters` → empty stub → 模型不调工具。

### 后续验证（P1119 SESSION）

inputSchema-only（空 stub）+ `required` **仍能**产生 tool_calls；P1118 历史 wire 常有大字节 schema。

> **Empty schema stub was not sufficient to explain the real-Codex failure.**

### Current

潜在兼容缺口可另修；**不是** P1118 充分根因。

---

## P1120 — 模型选择成为杠杆

SESSION：gemini-3-pro CLASS A；gpt-5.5/5.4 CLASS C。  
Current（as of 2026-08）：推荐 gemini-3-pro + old CLI；**非**恢复 Agent orchestration。

---

## Streaming 是主因？

当上游未返回 tool_calls：`TOKFAI_SWALLOWED_TOOL_CALLS=NO`（P1119）→ **排除** stream converter 为主因。

---

## Evidence

- `3e15e0a` `3c95377` `5f25c39` `fcf2f7e`  
- `transparentToolForceBypass.ts` `codexExplicitToolChoicePolicy.ts` `responsesToolAdapter.ts` `upstreamToolChoiceWireDiag.ts` `executeChatCompletion.ts`  
- scripts：p1109 p1114 p1115 p1116r2 p1119  
- transcript：P1114–P1120
