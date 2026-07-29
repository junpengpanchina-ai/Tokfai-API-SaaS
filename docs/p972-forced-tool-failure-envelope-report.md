# P972 Forced Tool Failure Envelope Report

> 日期：2026-07-29
> 范围：forced tool 失败时 OpenAI-compatible JSON / SSE 错误信封；不改 P971 计费
> 约束：不破坏普通 Chat/stream/图片；不破坏 P954/P961/P970/P971
> 验证：`npm run typecheck` + `npm run build` + offline p972（含 prior smokes）

## 最终结论

```
TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS
```

## 核心改动

| 文件 | 作用 |
|---|---|
| `apps/dmit-api/src/lib/toolCallFailureEnvelope.ts` | 统一 JSON / SSE 信封；HTTP clamp 到 400/422/502/503 |
| `apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts` | non-stream forced tool → 可解析 JSON + not_billable |
| `apps/dmit-api/src/lib/respondEarlySse.ts` | stream forced tool → SSE error + `[DONE]` |
| `scripts/p786-offline-customer-mock.mjs` | mock stream 镜像 SSE error |
| `scripts/p972-forced-tool-failure-envelope-smoke.mjs` | 验收 smoke |

## 行为

| 模式 | 期望 |
|---|---|
| non-stream forced fail | HTTP 400/422/502/503 + JSON `{error,tokfai}`；非 504/HTML/空 |
| stream forced fail | SSE `data:{error…}` + `data: [DONE]`；credits_charged=0 |
| billing | 始终 not_billable / credits=0（P971 不变） |

## 用例结果

- **PASS** `static_envelope_helper`
- **PASS** `static_nonstream_json_path`
- **PASS** `static_stream_sse_path`
- **PASS** `static_p971_billing_untouched`
- **PASS** `static_mock_stream_sse`
- **PASS** `static_prior_scripts`
- **PASS** `nonstream_forced_tool_json_envelope`
- **PASS** `stream_forced_tool_sse_error_done`
- **PASS** `ordinary_chat_unaffected`
- **PASS** `ordinary_stream_unaffected`
- **PASS** `image_path_unaffected`
- **PASS** `prior_p971-fake-tool-call-guard-smoke`
- **PASS** `prior_p970-cursor-tool-call-smoke`
- **PASS** `prior_p954-image-provider-routing-isolation-smoke`
- **PASS** `prior_p961-image-cost-reconciliation-smoke`

## 验收标记

```
TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS
```

## Deploy note

上线后 grep pm2 / error logs：不应出现 `bad_billing` / `charged_missing_url` / `provider_success_unpaid` / `Cannot set headers` / `api_error_500`（forced tool 路径）。
