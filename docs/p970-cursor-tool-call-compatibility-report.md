# P970 Cursor / OpenAI-compatible Tool Call Compatibility Report

> 日期：2026-07-29
> 环境：offline mock + static source（`WRITE_REPORT=1 node scripts/p970-cursor-tool-call-smoke.mjs`）
> 约束：未改图片计费保护核心（P961）；未全局 timeout=700s；未打印 API Key 明文；未破坏普通 Chat
> HEAD 基线：`ace8239eaccc9da2cc9d88516b7a8ef2cbaca581`

## 最终结论

```
TOKFAI_P970_CURSOR_TOOL_CALL_COMPATIBILITY_PASS
```

| 检查 | 结果 | 细节 |
|---|---|---|
| static_tools_not_swallowed | PASS | sanitize + tool role preserve |
| static_sse_tool_calls | PASS | SSE synthesizes delta.tool_calls + DONE |
| static_layered_timeouts | PASS | tool_call 420s, not global 700s |
| static_capability_flags | PASS | models list capabilities |
| static_billing_not_billable_on_tool_errors | PASS | tool errors + normalize tool_calls |
| static_p961_orphan_untouched | PASS | P961 orphan helpers present |
| static_p969_p954_p961_scripts_present | PASS | prior smokes not deleted |
| static_heartbeat_early_sse | PASS | early SSE heartbeat for Cursor stream |
| prior_p954-image-provider-routing-isolation-smoke | PASS | exit 0 |
| prior_p961-image-cost-reconciliation-smoke | PASS | exit 0 |
| models_list_tools_coding_capabilities | PASS | caps=14 tools=14 coding=9 |
| nonstream_tools_returns_tool_calls | PASS | finish=tool_calls charged=0.000001 |
| stream_tools_delta_tool_calls | PASS | toolDelta=true finish=tool_calls done=true |
| invalid_model_tools_not_billable | PASS | status=400 code=model_not_available |
| image_model_tools_rejected_not_billable | PASS | status=400 code=image_model_not_for_chat |
| ordinary_chat_unaffected | PASS | content_len=2 |

## 实现摘要

### 1. tools / tool_choice 透传
- `sanitizeUpstreamChatBody`：非空 `tools` + `tool_choice` 转发上游
- 保留消息角色 `tool` / `function`，以及 `tool_calls` / `tool_call_id` / `name`
- 非 stream / stream（合成 SSE）均支持

### 2. 模型能力标记（GET `/v1/models`）
- `capabilities: { chat, stream, tools, image, coding }`
- 不支持 tools 的请求优先 fallback 到 tools-capable；否则 `model_not_tool_capable` / `all_tool_upstreams_unavailable`，`not_billable`

### 3. 分层 timeout（非全局 700s）
| Env | Default | 用途 |
|---|---:|---|
| `TOKFAI_UPSTREAM_TIMEOUT_MS` / `TOKFAI_UPSTREAM_ATTEMPT_TIMEOUT_MS` | 90000 | 单次 attempt |
| `TOKFAI_CHAT_TIMEOUT_MS` | 180000 | 普通 chat |
| `TOKFAI_STREAM_TIMEOUT_MS` | 300000 | stream=true（无 tools） |
| `TOKFAI_TOOL_CALL_TIMEOUT_MS` | 420000 | **仅**含 tools/tool_choice |
| Heavy responses | 700000 | **仅** `/v1/responses` heavy，不变 |

### 4. Stream Cursor 兼容
- Early SSE + `: ping` heartbeat（既有）
- 合成 `delta.tool_calls` + `finish_reason=tool_calls` + `data: [DONE]`

### 5. 账单保护
- timeout / 503 / `all_upstreams_unavailable` / `model_not_tool_capable` / `all_tool_upstreams_unavailable` → `billing_status=not_billable`，`credits_charged=0`
- 成功 200 且有效 usage 才扣费；失败不写成功 ledger

### 6. 关键文件
- `apps/dmit-api/src/lib/toolCallCapability.ts`（新）
- `chatCompletionCompat.ts` / `chatCompletionSse.ts` / `upstreamTimeoutPolicy.ts` / `executeChatCompletion.ts` / `env.ts` / `errors.ts` / `modelPricing.ts`
- `scripts/p970-cursor-tool-call-smoke.mjs` + offline mock P970 增强

## 复现

```bash
cd apps/dmit-api && npm run typecheck && npm run build
node scripts/p970-cursor-tool-call-smoke.mjs
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p970-cursor-tool-call-smoke.mjs
```
