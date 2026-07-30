# P986 — Brutal Engineering Compatibility & Stability Report

> Violence test harness. **Does not claim fully compatible / Cursor Compatible.**

## Result: **HARNESS COMPLETE**

Marker: `TOKFAI_P986_BRUTAL_ENGINEERING_HARNESS_PASS`

## 1. Summary judgments

| Question | Answer |
|---|---|
| 可灰度？ | YES (no BLOCKER/FAIL in this run) |
| 可商业复制？ | CAUTIOUS YES |
| 可宣传 Cursor Compatible？ | **NO** (harness forbids this claim) |

## 2. BLOCKER list

- (none)

## 3. FAIL list

- (none)

## 4. WARN list

- `missing_model`: defaults BOT_MODEL instead of strict 400
- `missing_messages`: empty messages noop 200 not_billable (Cherry compat)
- `malformed_json`: status=500 (prefer 400)
- `invalid_role`: unknown role coerced rather than rejected
- `n_2`: n=2 but choices=1
- `response_format_json_schema`: json_schema not guaranteed forwarded upstream
- `legacy_function_role`: legacy function role accepted — document boundary
- `openai_sdk_node`: openai package not installed — SDK probe skipped

## 5. Model capability matrix (this run)

| Model | Chat | Stream | Tools required | Notes |
|---|---|---|---|---|
| auto-fast | exercised | exercised | not_capable expected | alias routing |
| gpt-5.5 | exercised | — | whitelist tools | VERIFIED_TOOLS |
| invalid | reject | — | — | not_billable |

## 6. Cursor compatibility matrix

| Scenario | Verdict |
|---|---|
| cursor_readonly_project_dir | PASS |
| cursor_read_file_explain | PASS |
| cursor_summarize_git_diff | PASS |
| cursor_create_tmp_file | PASS |
| cursor_modify_tmp_file | PASS |
| cursor_tool_fail_retry | PASS |
| cursor_forced_unsupported_tools | PASS |
| cursor_multi_turn | PASS |

## 7. SDK compatibility matrix

| Client | Status |
|---|---|
| openai (npm) | skip_not_installed |

## 8. Billing reconciliation matrix

| Rule | Result |
|---|---|
| Failure never charged | OK |
| Success has request_id | OK |
| No duplicate request_id charge | OK |
| Spend total | 0.00007899999999999987 |

## 9. Next fix priority

1. Keep WARN boundaries documented (n, json_schema, empty messages, malformed JSON→500).
2. Install `openai` optionally and re-run SDK probe (`node scripts/p986-openai-sdk-node-smoke.mjs`).
3. Run LIVE=1 with full concurrency (`DURATION_MS=180000`) on staging before wider gray.
4. Still do **not** advertise fully compatible / Cursor Compatible.

## Case table

| case | verdict | http | request_id | billing | credits | shape | reason |
|---|---|---|---|---|---|---|---|
| `non_stream_chat` | PASS | 200 | `req_mock_6b71c587b33be` | charged | 0.000001 | true |  |
| `stream_chat` | PASS | 200 | `req_mock_21a27635f65bf` | charged | 0.000001 | true |  |
| `missing_model` | WARN | 200 | `req_mock_d1c5b9588fc19` | charged | 0.000001 | true | defaults BOT_MODEL instead of strict 400 |
| `missing_messages` | WARN | 200 | `req_mock_d90fc46ad8b90` | not_billable | 0 | true | empty messages noop 200 not_billable (Cherry compat) |
| `malformed_json` | WARN | 500 | `req_mock_5eb262fa3036c` | — | 0 | true | status=500 (prefer 400) |
| `invalid_role` | WARN | 200 | `req_mock_236e664a30f0c` | charged | 0.000001 | true | unknown role coerced rather than rejected |
| `content_string` | PASS | 200 | `req_mock_fcb7c01d26e8e` | charged | 0.000001 | true |  |
| `content_array` | PASS | 200 | `req_mock_13d9f1b02609c` | charged | 0.000001 | true |  |
| `max_tokens` | PASS | 200 | `req_mock_28624af83d79a` | charged | 0.000001 | true |  |
| `max_completion_tokens` | PASS | 200 | `req_mock_bb7d9fdc3cec1` | charged | 0.000001 | true |  |
| `sampling_params` | PASS | 200 | `req_mock_c22d3b23f6e34` | charged | 0.000001 | true |  |
| `n_1` | PASS | 200 | `req_mock_b20cfeba73dd3` | charged | 0.000001 | true |  |
| `n_2` | WARN | 200 | `req_mock_37140c6113b50` | charged | 0.000001 | true | n=2 but choices=1 |
| `response_format_json_object` | PASS | 200 | `req_mock_39002294859b6` | charged | 0.000001 | true |  |
| `response_format_json_schema` | WARN | 200 | `req_mock_25175c4bcf8fb` | charged | 0.000001 | true | json_schema not guaranteed forwarded upstream |
| `extra_unknown_fields` | PASS | 200 | `req_mock_32969a71521e6` | charged | 0.000001 | true | canary=TOKFAI_P986_CANARY_SECRET_9c… stripped |
| `invalid_model` | PASS | 400 | `req_mock_eb4afef917d82` | not_billable | 0 | true |  |
| `tools_tool_choice_auto` | PASS | 200 | `req_mock_ec4423e25070e` | charged | 0.000001 | true |  |
| `tools_tool_choice_required` | PASS | 200 | `req_mock_8f78a1d621c35` | charged | 0.000001 | true |  |
| `tools_function_forced` | PASS | 200 | `req_mock_d604bdf9c94ed` | charged | 0.000001 | true |  |
| `tools_false_model_forced` | PASS | 400 | `req_mock_f980379868a89` | not_billable | 0 | true |  |
| `tools_stream_delta` | PASS | 200 | `req_mock_c3f9a3e89cf8e` | charged | 0.000001 | true |  |
| `tool_role_second_turn` | PASS | 200 | `req_mock_c7c7110701154` | charged | 0.000001 | true |  |
| `legacy_function_role` | WARN | 200 | `req_mock_fc99c674f645d` | charged | 0.000001 | true | legacy function role accepted — document boundary |
| `upstream_timeout` | PASS | 504 | `req_mock_e3cdfca80c596` | not_billable | 0 | true |  |
| `cursor_readonly_project_dir` | PASS | 200 | `req_mock_2d88a59616bf8` | charged | 0.000001 | true |  |
| `cursor_read_file_explain` | PASS | 200 | `req_mock_4967895a7fb63` | charged | 0.000001 | true |  |
| `cursor_summarize_git_diff` | PASS | 200 | `req_mock_8b700ed3a72c2` | charged | 0.000001 | true |  |
| `cursor_create_tmp_file` | PASS | 200 | `req_mock_feedbf8d7d9d1` | charged | 0.000001 | true |  |
| `cursor_modify_tmp_file` | PASS | 200 | `req_mock_55f82b77f0bef` | charged | 0.000001 | true |  |
| `cursor_tool_fail_retry` | PASS | 400 | `req_mock_6ace120acf7ac` | not_billable | 0 | true |  |
| `cursor_forced_unsupported_tools` | PASS | 400 | `req_mock_8aa5284cbc06c` | not_billable | 0 | true |  |
| `cursor_multi_turn` | PASS | 200 | `req_mock_4f23a180ed341` | charged | 0.000001 | true | 3-turn chat ok |
| `openai_sdk_node` | WARN | — | `—` | — | — | — | openai package not installed — SDK probe skipped |
| `concurrency_storm_summary` | PASS | — | `—` | — | 0.00007899999999999987 | — | chat={"wave_name":"chat","total":8,"success":8,"fail":0,"timeout":0,"aborted":0,"accounted":8,"charged_total":0.000008,"not_billable_total":0,"latency":{"count":5,"p50":1,"p90":2,"p95":2,"p99":2},"harness_bug":false} stream={"wave_name":"stream","total":4,"success":4,"fail":0,"timeout":0,"aborted":0,"accounted":4,"charged_total":0.000004,"not_billable_total":0,"latency":{"count":3,"p50":1,"p90":1,"p95":1,"p99":1},"harness_bug":false} tool={"wave_name":"tool","total":3,"success":3,"fail":0,"timeout":0,"aborted":0,"accounted":3,"charged_total":0,"not_billable_total":3,"latency":{"count":0,"p50":null,"p90":null,"p95":null,"p99":null},"harness_bug":false} mixed={"total":60,"success":60,"fail":0,"timeout":0,"aborted":0,"spend_total":0.00007899999999999987} details=75 |

## PM2

```json
{
  "before": {
    "available": false,
    "skipped": true,
    "dirty": [],
    "apps": []
  },
  "after": {
    "available": false,
    "skipped": true,
    "dirty": [],
    "apps": []
  }
}
```

## Concurrency storm

```json
{
  "skipped": false,
  "chat": {
    "wave_name": "chat",
    "total": 8,
    "success": 8,
    "fail": 0,
    "timeout": 0,
    "aborted": 0,
    "accounted": 8,
    "charged_total": 0.000008,
    "not_billable_total": 0,
    "latency": {
      "count": 5,
      "p50": 1,
      "p90": 2,
      "p95": 2,
      "p99": 2
    },
    "harness_bug": false
  },
  "stream": {
    "wave_name": "stream",
    "total": 4,
    "success": 4,
    "fail": 0,
    "timeout": 0,
    "aborted": 0,
    "accounted": 4,
    "charged_total": 0.000004,
    "not_billable_total": 0,
    "latency": {
      "count": 3,
      "p50": 1,
      "p90": 1,
      "p95": 1,
      "p99": 1
    },
    "harness_bug": false
  },
  "tool": {
    "wave_name": "tool",
    "total": 3,
    "success": 3,
    "fail": 0,
    "timeout": 0,
    "aborted": 0,
    "accounted": 3,
    "charged_total": 0,
    "not_billable_total": 3,
    "latency": {
      "count": 0,
      "p50": null,
      "p90": null,
      "p95": null,
      "p99": null
    },
    "harness_bug": false
  },
  "mixed": {
    "wave_name": "mixed",
    "total": 60,
    "success": 60,
    "fail": 0,
    "timeout": 0,
    "aborted": 0,
    "accounted": 60,
    "charged_total": 0.00003999999999999998,
    "not_billable_total": 20,
    "latency": {
      "count": 23,
      "p50": 1,
      "p90": 1,
      "p95": 1,
      "p99": 2
    },
    "harness_bug": false,
    "duration_ms": 12000,
    "spend_total": 0.00007899999999999987,
    "max_storm_requests": 60,
    "mixed_issued": 60
  },
  "details_count": 75,
  "details_stored": 75,
  "details_overflow": 0
}
```

## Re-run

```bash
node scripts/p986-brutal-engineering-harness.mjs
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... DURATION_MS=180000 node scripts/p986-brutal-engineering-harness.mjs
```
