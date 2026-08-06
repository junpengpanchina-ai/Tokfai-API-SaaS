# P1034 Cursor Blind Benchmark — Solution Report

## Root causes

1. **Tool result transcript validation** (`roundTrip.mjs`): Built a Map from messages without detecting duplicate / unmatched / missing `tool_call_id`s, then filtered away gaps by length alone.
2. **Usage aggregation** (`usage.mjs`): Returned only the last component’s usage instead of summing all successful parts.
3. **Timeout budget** (`budget.mjs`): Applied `Math.max(5000, remaining)`, which revived expired budgets to 5000ms.
4. **Assistant tool-call message** (`assistantMessage.mjs`): Kept empty-string `content` and left object `arguments` unstringified.

## Files modified

- `.tokfai-cursor-bench/src/roundTrip.mjs`
- `.tokfai-cursor-bench/src/usage.mjs`
- `.tokfai-cursor-bench/src/budget.mjs`
- `.tokfai-cursor-bench/src/assistantMessage.mjs`
- `.tokfai-cursor-bench/result.txt` (created)
- `.tokfai-cursor-bench/solution-report.md` (created)

## Fixes per issue

### A. Tool result transcript validation
- Track seen ids; throw on duplicate (`duplicate` in message).
- Reject results whose `tool_call_id` is not in the call set (`unmatched`).
- Require every call id to have exactly one result (`missing`).
- Return results in original tool-call order via one-to-one `tool_call_id` map lookup.

### B. Usage aggregation
- Sum `prompt_tokens`, `completion_tokens`, and `total_tokens` across all parts (15 / 9 / 24 for the fixture).
- Do not mutate the input array.

### C. Timeout budget
- `remaining = max(0, totalTimeoutMs - (nowMs - startedAtMs))`.
- Expired budgets return `0`; no 5000ms floor.

### D. OpenAI-compatible assistant tool-call message
- `role` stays `assistant`.
- When `tool_calls` are present, `content` is `null`.
- Preserve `id`, `type`, `function.name`; stringify object `function.arguments`.

## Final test count

- Ran: `node --test --test-concurrency=1 .tokfai-cursor-bench/test/benchmark.test.mjs`
- Result: **8 passed, 0 failed**

## Compliance

| Check | Result |
|---|---|
| Modified test files | No |
| Modified production code (`apps/**`, `scripts/**`) | No |
| Installed dependencies | No |
| Commit / push / deploy | No |
| Network access | No |
