# P987 — Agent Runtime Compatibility Report

> Text-agent Cursor/Hermes workflow acceptance. **Does not claim fully compatible or real FS tools.**

## Result: **HARNESS COMPLETE**

Marker: `TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS`

Mode: offline mock
Generated: 2026-08-01T04:50:27.113Z

## Verdict counts

| Verdict | Count |
|---|---|
| PASS | 9 |
| WARN | 0 |
| FAIL | 0 |
| BLOCKER | 0 |

## BLOCKER list

- (none)

## FAIL list

- (none)

## WARN list

- (none)

## Case table

| case | category | kind | verdict | http | request_id | billing | credits | usage | routing | reason |
|---|---|---|---|---|---|---|---|---|---|---|
| `cursor_read_list_project_files` | cursor_read | 200_content_success | PASS | 200 | `req_mock_cd29febb35313` | charged | 0.000001 | true | true |  |
| `cursor_read_file` | cursor_read | 200_content_success | PASS | 200 | `req_mock_9e3fbe56cbfbc` | charged | 0.000001 | true | true |  |
| `cursor_read_summarize_git_diff` | cursor_read | 200_content_success | PASS | 200 | `req_mock_405751f9265f4` | charged | 0.000001 | true | true | stable_ok primary=gemini-2.5-flash diff_chars=65 |
| `cursor_edit_create_modify_diff` | cursor_edit | 200_content_success | PASS | 200 | `req_mock_5c8b9d63463d2` | charged | 0.000003 | true | true | text_agent_plan + local_apply diff_bytes=304 |
| `multi_turn_analyze_modify_explain` | multi_turn | 200_content_success | PASS | 200 | `req_mock_e04cf7b146f23` | charged | 0.000003 | true | true | turns=5 context_kept=true |
| `billing_invalid_model_not_billable` | billing | true_400_reject | PASS | 400 | `req_mock_d96827eba92fa` | not_billable | 0 | — | true |  |
| `billing_tool_required_not_capable` | billing | true_400_reject | PASS | 400 | `req_mock_eca64adcf3bdc` | not_billable | 0 | — | true | model_not_tool_capable |
| `tools_auto_degrade_to_chat` | tools_policy | 200_content_success | PASS | 200 | `req_mock_fa2970e3fe645` | charged | 0.000001 | true | true | auto on non-whitelist → ordinary chat (not fully tools compatible) |
| `billing_invariants_matrix` | billing | invariants | PASS | — | `—` | — | — | — | — | success_cases=6 |

## Notes

- WARN is never counted as PASS.
- File mutations are applied by this harness as the agent runtime after a text plan.
- Do **not** advertise fully Cursor Compatible / real tools.
