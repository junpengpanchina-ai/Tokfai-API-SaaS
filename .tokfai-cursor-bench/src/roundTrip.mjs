export function reconcileRoundTrip(toolCalls, toolMessages) {
  const byId = new Map(
    toolMessages.map((message) => [message.tool_call_id, message])
  );

  return toolCalls
    .map((call) => byId.get(call.id))
    .filter(Boolean);
}
