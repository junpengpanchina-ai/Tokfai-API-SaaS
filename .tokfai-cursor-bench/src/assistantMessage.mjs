export function normalizeAssistantMessage(message) {
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls
    };
  }

  return {
    role: "assistant",
    content: String(message.content ?? "")
  };
}
