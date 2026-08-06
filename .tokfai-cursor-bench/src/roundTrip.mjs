export function reconcileRoundTrip(toolCalls, toolMessages) {
  const expectedIds = new Set(toolCalls.map((call) => call.id));
  const seen = new Set();
  const byId = new Map();

  for (const message of toolMessages) {
    const id = message.tool_call_id;

    if (!expectedIds.has(id)) {
      throw new Error(`unmatched tool result: ${id}`);
    }

    if (seen.has(id)) {
      throw new Error(`duplicate tool result: ${id}`);
    }

    seen.add(id);
    byId.set(id, message);
  }

  for (const call of toolCalls) {
    if (!byId.has(call.id)) {
      throw new Error(`missing tool result: ${call.id}`);
    }
  }

  return toolCalls.map((call) => byId.get(call.id));
}
