function normalizeToolCall(toolCall) {
  const args = toolCall.function?.arguments;
  const argumentsString = typeof args === "string" ? args : JSON.stringify(args ?? {});

  return {
    id: toolCall.id,
    type: toolCall.type,
    function: {
      name: toolCall.function?.name,
      arguments: argumentsString
    }
  };
}

export function normalizeAssistantMessage(message) {
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return {
      role: "assistant",
      content: null,
      tool_calls: message.tool_calls.map(normalizeToolCall)
    };
  }

  return {
    role: "assistant",
    content: String(message.content ?? "")
  };
}
