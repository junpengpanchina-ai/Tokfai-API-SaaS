import test from "node:test";
import assert from "node:assert/strict";

import { reconcileRoundTrip } from "../src/roundTrip.mjs";
import { aggregateUsage } from "../src/usage.mjs";
import { remainingBudget } from "../src/budget.mjs";
import { normalizeAssistantMessage } from "../src/assistantMessage.mjs";

test("round trip follows original tool-call order", () => {
  const calls = [{ id: "call_b" }, { id: "call_a" }];
  const messages = [
    { role: "tool", tool_call_id: "call_a", content: "A" },
    { role: "tool", tool_call_id: "call_b", content: "B" }
  ];

  assert.deepEqual(
    reconcileRoundTrip(calls, messages).map((item) => item.content),
    ["B", "A"]
  );
});

test("duplicate tool results are rejected", () => {
  assert.throws(
    () =>
      reconcileRoundTrip(
        [{ id: "call_1" }],
        [
          { tool_call_id: "call_1", content: "first" },
          { tool_call_id: "call_1", content: "duplicate" }
        ]
      ),
    /duplicate/i
  );
});

test("unmatched tool results are rejected", () => {
  assert.throws(
    () =>
      reconcileRoundTrip(
        [{ id: "call_1" }],
        [{ tool_call_id: "call_unknown", content: "bad" }]
      ),
    /unmatched/i
  );
});

test("missing tool results are rejected", () => {
  assert.throws(
    () =>
      reconcileRoundTrip(
        [{ id: "call_1" }, { id: "call_2" }],
        [{ tool_call_id: "call_1", content: "ok" }]
      ),
    /missing/i
  );
});

test("usage from every successful upstream component is aggregated", () => {
  const parts = [
    { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }
  ];
  const snapshot = structuredClone(parts);

  assert.deepEqual(aggregateUsage(parts), {
    prompt_tokens: 15,
    completion_tokens: 9,
    total_tokens: 24
  });

  assert.deepEqual(parts, snapshot);
});

test("expired timeout budget remains zero", () => {
  assert.equal(remainingBudget(1000, 0, 1500), 0);
});

test("tool-call assistant message uses OpenAI-compatible shape", () => {
  const normalized = normalizeAssistantMessage({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "read_file",
          arguments: { path: "source.txt" }
        }
      }
    ]
  });

  assert.equal(normalized.content, null);
  assert.equal(typeof normalized.tool_calls[0].function.arguments, "string");
  assert.deepEqual(
    JSON.parse(normalized.tool_calls[0].function.arguments),
    { path: "source.txt" }
  );
});

test("ordinary assistant text remains ordinary text", () => {
  assert.deepEqual(
    normalizeAssistantMessage({
      role: "assistant",
      content: "done"
    }),
    {
      role: "assistant",
      content: "done"
    }
  );
});
