# P971 Fake Tool Call Billing Guard Report

> 日期：2026-07-29
> 范围：strict tool-call 判定、假兼容计费拦截、capabilities 保守标注、auto 语义保留
> 约束：未破坏 P954/P961/P968/P970；未打印 API Key 明文

## 最终结论

```
TOKFAI_P971_FAKE_TOOL_CALL_GUARD_PASS
```

## 行为摘要

| 场景 | 期望 | 计费 |
|---|---|---|
| `tool_choice` function / `required` 且返回 tool_calls | 200 + finish_reason=tool_calls | billable |
| strict 请求但上游只回普通 content | `tool_call_not_generated` | not_billable / credits=0 |
| `tokfai.require_tool_call=true` 且无 tool_calls | 同上 | not_billable |
| `tool_choice:auto` 普通回答 | 允许，`tokfai.auto_no_tool_call` | billable |
| `/v1/models` capabilities.tools | 仅 LIVE 验证 → true；其余 experimental/false；auto-fast 不为 true | — |

## 用例结果

- **PASS** `static_strict_helpers` — strict + capability mark helpers
- **PASS** `static_fake_guard_wired` — executeChatCompletion guard before debit
- **PASS** `static_error_envelope` — 502 + tokfai not_billable
- **PASS** `static_logger_fields` — P971 log allowlist
- **PASS** `static_capabilities_conservative` — catalog tools whitelist-only (P974)
- **PASS** `static_mock_p971` — offline mock mirrors guard
- **PASS** `static_prior_smokes_present` — P954/P961/P968/P970 scripts intact
- **PASS** `models_auto_fast_tools_not_true` — auto-fast.tools=false toolsTrue=false true=0
- **SOFT** `forced_tool_choice_billable_tool_calls` — guard/not_billable code=model_not_tool_capable
- **PASS** `forced_fake_content_not_billable` — code=model_not_tool_capable charged=0
- **PASS** `require_tool_call_fake_not_billable` — code=model_not_tool_capable
- **PASS** `auto_no_tool_call_allowed` — content=ok
- **PASS** `invalid_model_tools_not_billable` — status=400 code=model_not_available
- **PASS** `ordinary_chat_unaffected` — len=2
- **PASS** `image_chat_isolation_unaffected` — status=400 code=image_model_not_for_chat
- **PASS** `prior_p954-image-provider-routing-isolation-smoke` — exit 0
- **PASS** `prior_p961-image-cost-reconciliation-smoke` — exit 0

## 日志字段（必记）

`hasTools`, `toolChoice`, `requireToolCall`, `strictToolCall`, `upstreamReturnedToolCalls`, `finishReason`, `fakeToolCallGuard`, `billing_status`, `credits_charged`

## 验收标记

```
TOKFAI_P971_FAKE_TOOL_CALL_GUARD_PASS
```
