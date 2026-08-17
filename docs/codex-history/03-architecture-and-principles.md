# 03 — Architecture and Principles

## 链路总览

```text
Codex CLI (old)
    ↓  HTTPS + Bearer TOKFAI_API_KEY
/v1/responses   (wire_api = responses)
    ↓
Tokfai apps/dmit-api
    ├── auth (sk-tokfai_ HMAC)
    ├── billing / usage
    ├── Responses normalization
    ├── tools / tool_choice adapter (Chat-compatible)
    ├── optional: P1115 tool_choice policy (opt-in)
    ├── privacy-safe wire logs
    ├── previous_response_id / tool state (memory ± durable)
    └── providerFetch
            ↓
      GRSAI / upstream (Chat Completions 等)
            ↓
      model (工具流推荐 as of 2026-08: gemini-3-pro；须重跑 canary)
            ↓
      tool_calls OR stop
            ↓
Tokfai → client (Responses SSE / envelope)
            ↓
Codex CLI 本地执行 Read/Write/Shell
            ↓
tool result + previous_response_id → /v1/responses (resume)
```

### Evidence

- `apps/dmit-api/src/routes/responses.ts`
- `apps/dmit-api/src/lib/executeChatCompletion.ts`
- `apps/dmit-api/src/lib/responsesToolAdapter.ts`
- `apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts`
- `docs/codex-cli-tokfai.md`

---

## Tokfai 做什么

| 能力 | 说明 |
|------|------|
| Relay | 把客户端请求转到上游 |
| Protocol adapter | Responses flat tools ↔ Chat nested `function`；tool_choice 形状 |
| Billing | 成功路径扣费；失败策略依既有网关规则 |
| State | `previous_response_id` 关联 tool 输出；可选 durable 表 |
| Logs | requestId、model、toolsCount、finishReason、wire fingerprint |
| Compatibility | Cherry / Cursor / Codex 等客户端差异的 **加法** 适配 |

---

## Tokfai 不做什么

Tokfai **不**：

- 打开本地文件
- 执行 shell
- 写用户目录
- 自己执行 Read / Write / Shell
- 自己跑完整 Agent tool loop（代替客户端）
- 根据自然语言 prompt「猜」该调用哪个工具并强制执行（P1109 / P1115 边界）

本地工具执行方：

```text
Codex CLI / Agent Runtime
```

---

## Compatibility Prime Directive

来源：`AGENTS.md`

> Additive compatibility。不为了 Codex 破坏已经成功的 Chat / Cherry Studio / billing / durable / provider 路径。

摘要：

1. 兼容是加法，不是替换  
2. 已成功路径是 Golden Path  
3. 不为新 provider 改已成功 provider 行为  
4. Provider 怪癖进 adapter  
5. 未知状态安全回退  
6. streaming / tool_calls / resume / timeout / billing exactly-once 语义保持  
7. 纯重构不是改行为的理由  
8. 变更需证明 GPT / 非 tool 文本 / tool / resume / billing / 新路径独立工作  
9. 禁止一次性大搬家抽象  
10. 增量抽取 + adapter + 可控采纳  

口号：

```text
DO NOT BREAK WHAT ALREADY WORKS.
EXTEND TOKFAI TO UNDERSTAND MORE.
```

---

## 三层架构与密钥边界

```text
apps/web          → tokfai.com   （anon / NEXT_PUBLIC_* only）
apps/dmit-api     → api.tokfai.com（全部服务端 secret）
supabase/         → DB + Auth 源真相
```

| Secret | web | dmit-api |
|--------|-----|----------|
| `NEXT_PUBLIC_*` | ✅ | — |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | ✅ |
| `SUPABASE_JWT_SECRET` | ❌ | ✅ |
| `TOKEN_PEPPER` | ❌ | ✅ |
| `TOKFAI_KEY_ENCRYPTION_SECRET` | ❌ | ✅ |
| `GRSAI_API_KEY` | ❌ | ✅ |
| `STRIPE_*` | ❌ | ✅ |

前端读用户自己的表靠 **anon + RLS**；写敏感路径走 DMIT。

Source: `AGENTS.md`、`.cursor/rules/architecture.mdc`

---

## Transparent vs Agent 历史路径

| 模式 | 含义 |
|------|------|
| Transparent gateway | 显式 gpt-/gemini-（及 auto-pro carrier）：尽量原样转发，不替模型决定工具 |
| 历史 force/retry | P1087/P1088/P1090：auto 无 tool_calls 时二次 fetch / 兼容解析 |
| P1109 | transparent + auto → **bypass** force/retry |
| P1115 | 仅 opt-in env 才把 auto 改写为 required（仍不执行工具、不开第二轮） |

---

## Release gate（改 dmit-api/src 或 scripts 后）

不得仅靠 typecheck / build / `pm2 online`。须跑 `scripts/tokfai-release-gate.mjs` 及规定 PASS markers（见仓库 release-gate 规则）。

本历史库 **不替代** release gate。
