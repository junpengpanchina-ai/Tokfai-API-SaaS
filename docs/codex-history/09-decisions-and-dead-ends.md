# 09 — Decisions and Dead Ends

每个死胡同含：Why considered · Evidence · Why rejected · What replaced it。

---

## D1 — 全局 auto → required

**Why considered：** P1114 显示 required 能出 tool_calls。  
**Evidence：** P1115 opt-in；P1118 真 Codex 仍可能 stop。  
**Why rejected：** 破坏 P1109 透明语义；影响非 Codex 客户端；非充分修复。  
**What replaced it：** 默认 `preserve_auto`；opt-in 仅实验；推荐换模型。

---

## D2 — 默认二次 provider fetch

**Why considered：** P1087/P1090 补刀 auto 无 tool_calls。  
**Evidence：** 成本、计费复杂度、接近 Agent。  
**Why rejected：** P1109 transparent bypass。  
**What replaced it：** 原样返回 stop；模块保留给非 transparent 路径。

---

## D3 — prompt-based tool guessing

**Why considered：** 自然语言“请读文件”暗示该调工具。  
**Evidence：** 需读 prompt/path；不稳定。  
**Why rejected：** 网关不是 Agent runtime；P1115 决策输入仅 route/transparent/toolsCount/kind/env。  
**What replaced it：** 透明 relay + 客户端执行工具。

---

## D4 — streaming 是主因

**Why considered：** Responses SSE 可能吞 tool_calls。  
**Evidence：** P1119 `TOKFAI_SWALLOWED_TOOL_CALLS=NO`（上游未返回时）。  
**Why rejected：** 上游无 tool_calls 时 converter 非第一嫌疑。  
**What replaced it：** 查 wire + 模型行为。

---

## D5 — empty inputSchema stub 是唯一根因

**Why considered：** adapter 丢 inputSchema → 空 parameters。  
**Evidence：** P1119：空 stub + required 仍可 tool_calls；P1118 大字节 schema。  
**Why rejected：** 非充分解释。  
**What replaced it：** 记为潜在兼容缺口；主杠杆转向模型选择。

---

## D6 — 继续死磕 GPT 作工具默认

**Why considered：** gpt-5.x 产品默认心智。  
**Evidence：** P1120 CLASS C vs gemini-3-pro CLASS A。  
**Why rejected：** 同客户端下模型选择更有效。  
**What replaced it：** as of 2026-08 推荐 `gemini-3-pro`（须重跑 canary）。

---

## D7 — Desktop-first debugging

**Why considered：** 用户常用 Desktop UI。  
**Evidence：** runbook / P1124：Desktop 无响应时先换 CLI；P1120 用 `codex exec` 可复现。  
**Why rejected：** UI 路径变量多，不适合做基准。  
**What replaced it：** **old Codex CLI** 作为验证与推荐客户端。

---

## 仍有效正向决策

P1109 · P1115 default preserve · P1083 adapter · state bridge · wire diag · CLI+gemini（时效性）· Additive Prime Directive
