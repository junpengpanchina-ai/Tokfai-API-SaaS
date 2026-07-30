# P987R — Agent Runtime Compatibility Repair Report

> Fixes LIVE blockers: text-agent workflow, routing/usage envelopes, log key scrubbing. No fully-compatible claim.

## Result: **REPAIR PASS**

Marker: `TOKFAI_P987R_AGENT_RUNTIME_REPAIR_PASS`

## Fixes

- P987 cases A/B/C use ordinary chat text-agent prompts (no forced tools).
- Success checks distinguish missing usage / missing routing / dirty success without billing.
- Logs scrub sensitive body key *names* (database_url, postgres, secret, …).
- Chat validation 400s attach tokfai routing + request_id; success always includes usage object.

## BLOCKERs

- (none)

## Case kinds

| case | kind | verdict |
|---|---|---|
| `cursor_read_list_project_files` | 200_content_success | PASS |
| `cursor_read_file` | 200_content_success | PASS |
| `cursor_read_summarize_git_diff` | 200_content_success | PASS |
| `cursor_edit_create_modify_diff` | 200_content_success | PASS |
| `multi_turn_analyze_modify_explain` | 200_content_success | PASS |
| `billing_invalid_model_not_billable` | true_400_reject | PASS |
| `billing_tool_required_not_capable` | true_400_reject | PASS |
| `tools_auto_degrade_to_chat` | 200_content_success | PASS |
| `billing_invariants_matrix` | invariants | PASS |
