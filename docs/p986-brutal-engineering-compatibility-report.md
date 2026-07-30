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
| Spend total | 0.13512300000011446 |

## 9. Next fix priority

1. Keep WARN boundaries documented (n, json_schema, empty messages, malformed JSON→500).
2. Install `openai` optionally and re-run SDK probe (`node scripts/p986-openai-sdk-node-smoke.mjs`).
3. Run LIVE=1 with full concurrency (`DURATION_MS=180000`) on staging before wider gray.
4. Still do **not** advertise fully compatible / Cursor Compatible.

## Case table

| case | verdict | http | request_id | billing | credits | shape | reason |
|---|---|---|---|---|---|---|---|
| `non_stream_chat` | PASS | 200 | `req_mock_731a4ccfa6e1d` | charged | 0.000001 | true |  |
| `stream_chat` | PASS | 200 | `req_mock_614d95df03752` | charged | 0.000001 | true |  |
| `missing_model` | WARN | 200 | `req_mock_0b73b7bc7e762` | charged | 0.000001 | true | defaults BOT_MODEL instead of strict 400 |
| `missing_messages` | WARN | 200 | `req_mock_93d035bbe23d2` | not_billable | 0 | true | empty messages noop 200 not_billable (Cherry compat) |
| `malformed_json` | WARN | 500 | `req_mock_a95526b1c6518` | — | 0 | true | status=500 (prefer 400) |
| `invalid_role` | WARN | 200 | `req_mock_901ccd14fcf33` | charged | 0.000001 | true | unknown role coerced rather than rejected |
| `content_string` | PASS | 200 | `req_mock_4674b67db001e` | charged | 0.000001 | true |  |
| `content_array` | PASS | 200 | `req_mock_f2f6750b9a80a` | charged | 0.000001 | true |  |
| `max_tokens` | PASS | 200 | `req_mock_e07cc6dc9b42f` | charged | 0.000001 | true |  |
| `max_completion_tokens` | PASS | 200 | `req_mock_3618fa066c3d6` | charged | 0.000001 | true |  |
| `sampling_params` | PASS | 200 | `req_mock_8d08fd884fbd5` | charged | 0.000001 | true |  |
| `n_1` | PASS | 200 | `req_mock_f896b74ff16a7` | charged | 0.000001 | true |  |
| `n_2` | WARN | 200 | `req_mock_221f8896a8f4c` | charged | 0.000001 | true | n=2 but choices=1 |
| `response_format_json_object` | PASS | 200 | `req_mock_0c5217f3768f3` | charged | 0.000001 | true |  |
| `response_format_json_schema` | WARN | 200 | `req_mock_133f5b0437b87` | charged | 0.000001 | true | json_schema not guaranteed forwarded upstream |
| `extra_unknown_fields` | PASS | 200 | `req_mock_6474820ad8922` | charged | 0.000001 | true |  |
| `invalid_model` | PASS | 400 | `req_mock_f03719df94e3f` | not_billable | 0 | true |  |
| `tools_tool_choice_auto` | PASS | 200 | `req_mock_68e6607b09555` | charged | 0.000001 | true |  |
| `tools_tool_choice_required` | PASS | 200 | `req_mock_657976cbdce18` | charged | 0.000001 | true |  |
| `tools_function_forced` | PASS | 200 | `req_mock_ae07ad6e005eb` | charged | 0.000001 | true |  |
| `tools_false_model_forced` | PASS | 400 | `req_mock_b47a47e2f33bb` | not_billable | 0 | true |  |
| `tools_stream_delta` | PASS | 200 | `req_mock_c6dc991345f7a` | charged | 0.000001 | true |  |
| `tool_role_second_turn` | PASS | 200 | `req_mock_fde3acfc60373` | charged | 0.000001 | true |  |
| `legacy_function_role` | WARN | 200 | `req_mock_db2ded45d8c62` | charged | 0.000001 | true | legacy function role accepted — document boundary |
| `upstream_timeout` | PASS | 504 | `req_mock_517d1336eb954` | not_billable | 0 | true |  |
| `cursor_readonly_project_dir` | PASS | 200 | `req_mock_2d96c2ba8d30e` | charged | 0.000001 | true |  |
| `cursor_read_file_explain` | PASS | 200 | `req_mock_7f7623b295567` | charged | 0.000001 | true |  |
| `cursor_summarize_git_diff` | PASS | 200 | `req_mock_ea44e65c3ce83` | charged | 0.000001 | true |  |
| `cursor_create_tmp_file` | PASS | 200 | `req_mock_709aaca5652dd` | charged | 0.000001 | true |  |
| `cursor_modify_tmp_file` | PASS | 200 | `req_mock_908b5d12b4132` | charged | 0.000001 | true |  |
| `cursor_tool_fail_retry` | PASS | 400 | `req_mock_faece986840d6` | not_billable | 0 | true |  |
| `cursor_forced_unsupported_tools` | PASS | 400 | `req_mock_4198bc6475776` | not_billable | 0 | true |  |
| `cursor_multi_turn` | PASS | 200 | `req_mock_f105ad7607b51` | charged | 0.000001 | true | 3-turn chat ok |
| `openai_sdk_node` | WARN | — | `—` | — | — | — | openai package not installed — SDK probe skipped |
| `concurrency_storm_summary` | PASS | — | `—` | — | 0.13512300000011446 | — | chat={"total":8,"success":8,"fail":0,"charged_total":0.000008,"not_billable_total":0,"latency":{"count":8,"p50":1,"p90":2,"p95":2,"p99":2}} stream={"total":4,"success":4,"fail":0,"latency":{"count":4,"p50":1,"p90":1,"p95":1,"p99":1}} tool={"total":3,"success":3,"fail":0,"charged_total":0,"not_billable_total":3} |

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
    "total": 8,
    "success": 8,
    "fail": 0,
    "charged_total": 0.000008,
    "not_billable_total": 0,
    "latency": {
      "count": 8,
      "p50": 1,
      "p90": 2,
      "p95": 2,
      "p99": 2
    }
  },
  "stream": {
    "total": 4,
    "success": 4,
    "fail": 0,
    "latency": {
      "count": 4,
      "p50": 1,
      "p90": 1,
      "p95": 1,
      "p99": 1
    }
  },
  "tool": {
    "total": 3,
    "success": 3,
    "fail": 0,
    "charged_total": 0,
    "not_billable_total": 3
  },
  "mixed": {
    "duration_ms": 12000,
    "success": 202626,
    "fail": 0,
    "latency": {
      "count": 31146,
      "p50": 1,
      "p90": 1,
      "p95": 1,
      "p99": 4
    },
    "spend_total": 0.13512300000011446
  }
}
```

## Re-run

```bash
node scripts/p986-brutal-engineering-harness.mjs
# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... DURATION_MS=180000 node scripts/p986-brutal-engineering-harness.mjs
```
