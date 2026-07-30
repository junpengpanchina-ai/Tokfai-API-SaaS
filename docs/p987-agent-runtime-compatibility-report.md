# P987 — Agent Runtime Compatibility Report

> Cursor / Hermes-like agent workflow acceptance. **Does not claim fully compatible.**

## Result: **HARNESS COMPLETE**

Marker: `TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS`

Mode: offline mock
Generated: 2026-07-30T13:56:31.647Z

## Verdict counts

| Verdict | Count | Meaning |
|---|---|---|
| PASS | 8 | Agent path acceptable |
| WARN | 0 | Usable with documented boundary (not PASS) |
| FAIL | 0 | Must fix |
| BLOCKER | 0 | Commercial blocker |

## BLOCKER list

- (none)

## FAIL list

- (none)

## WARN list

- (none)

## Matrices

### A. Cursor Read

| case | verdict | http | request_id | routing | billing | credits | tool/edit | mutation |
|---|---|---|---|---|---|---|---|---|
| `cursor_read_list_project_files` | PASS | 200 | `req_mock_2f20447075d4eb5` | true | charged | 0.000001 | true | false |
| `cursor_read_file` | PASS | 200 | `req_mock_710b04a82af9d7c` | true | charged | 0.000001 | true | false |
| `cursor_read_summarize_git_diff` | PASS | 200 | `req_mock_592bb68d24300f7` | true | charged | 0.000001 | true | false |

### B. Cursor Edit

| case | verdict | tool/edit | file mutation | request_id | credits |
|---|---|---|---|---|---|
| `cursor_edit_create_modify_diff` | PASS | true | true | `req_mock_a72f0223ece0bd6` | 0.000003 |

### C. Multi-turn

| case | verdict | context_kept | mutation | credits |
|---|---|---|---|---|
| `multi_turn_analyze_modify_explain` | PASS | true | true | 0.000003 |

### D. Billing

| case | verdict | http | billing | credits | reason |
|---|---|---|---|---|---|
| `billing_invalid_model_not_billable` | PASS | 400 | not_billable | 0 |  |
| `billing_tool_not_capable_not_billable` | PASS | 400 | not_billable | 0 | model_not_tool_capable |
| `billing_invariants_matrix` | PASS | — | — | — | success_cases=5 invariants_ok |

## Case table

| case | category | verdict | http | request_id | billing | credits | reason |
|---|---|---|---|---|---|---|---|
| `cursor_read_list_project_files` | cursor_read | PASS | 200 | `req_mock_2f20447075d4e` | charged | 0.000001 | tools=list_dir:tmp/p987-agent-sandbox |
| `cursor_read_file` | cursor_read | PASS | 200 | `req_mock_710b04a82af9d` | charged | 0.000001 | tools=read_file:tmp/p987-agent-sandbox/seed.ts |
| `cursor_read_summarize_git_diff` | cursor_read | PASS | 200 | `req_mock_592bb68d24300` | charged | 0.000001 |  |
| `cursor_edit_create_modify_diff` | cursor_edit | PASS | 200 | `req_mock_a72f0223ece0b` | charged | 0.000003 | create=write_file:tmp/p987-agent-sandbox/cursor-agent-test.ts modify=str_replace:tmp/p987-agent-sandbox/cursor-agent-test.ts diff_bytes=304 |
| `multi_turn_analyze_modify_explain` | multi_turn | PASS | 200 | `req_mock_ff35b483f2e81` | charged | 0.000003 | turns=7 analyze_bytes=52 file_has_hola=true |
| `billing_invalid_model_not_billable` | billing | PASS | 400 | `req_mock_7ad002f585edb` | not_billable | 0 |  |
| `billing_tool_not_capable_not_billable` | billing | PASS | 400 | `req_mock_5d3fd4c48ea23` | not_billable | 0 | model_not_tool_capable |
| `billing_invariants_matrix` | billing | PASS | — | `—` | — | — | success_cases=5 invariants_ok |

## Notes

- WARN is never treated as PASS in counts or commercial claims.
- File mutations are applied by this harness acting as the agent runtime after tool_calls (Cursor/Hermes pattern).
- Do **not** advertise fully Cursor Compatible.
