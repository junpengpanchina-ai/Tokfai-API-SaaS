# P972 Forced Tool Failure Envelope Report

> 日期：2026-07-29
> 范围：forced tool 失败时 OpenAI-compatible JSON / SSE 错误信封；不改 P971 计费
> 约束：不破坏普通 Chat/stream/图片；不破坏 P954/P961/P970/P971

## 最终结论

```
TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS
```

## 行为

| 模式 | 期望 |
|---|---|
| non-stream forced fail | HTTP 400/422/502/503 + JSON `{error,tokfai}`；非 504/HTML/空 |
| stream forced fail | SSE `data:{error…}` + `data: [DONE]`；credits_charged=0 |
| billing | 始终 not_billable / credits=0（P971 不变） |

## 用例结果

- **PASS** `static_envelope_helper` — P972 envelope helper + status clamp
- **PASS** `static_nonstream_json_path` — non-stream uses graceful JSON
- **PASS** `static_stream_sse_path` — stream uses SSE error + DONE
- **PASS** `static_p971_billing_untouched` — P971 guard still present
- **PASS** `static_mock_stream_sse` — mock stream returns SSE on forced fail
- **PASS** `static_prior_scripts` — prior smokes intact
- **PASS** `nonstream_forced_tool_json_envelope` — status=400 code=model_not_tool_capable charged=0
- **PASS** `stream_forced_tool_sse_error_done` — code=model_not_tool_capable done=true charged=0 ct=true
- **PASS** `ordinary_chat_unaffected` — len=2
- **PASS** `ordinary_stream_unaffected` — SSE DONE present
- **PASS** `image_path_unaffected` — status=400 code=image_model_not_for_chat
- **PASS** `prior_p971-fake-tool-call-guard-smoke` — exit 0
- **PASS** `prior_p970-cursor-tool-call-smoke` — exit 0
- **PASS** `prior_p954-image-provider-routing-isolation-smoke` — exit 0
- **PASS** `prior_p961-image-cost-reconciliation-smoke` — exit 0

## 验收标记

```
TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS
```
