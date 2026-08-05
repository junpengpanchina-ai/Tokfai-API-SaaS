export function aggregateUsage(parts) {
  const last = parts.at(-1) ?? {};

  return {
    prompt_tokens: last.prompt_tokens ?? 0,
    completion_tokens: last.completion_tokens ?? 0,
    total_tokens: last.total_tokens ?? 0
  };
}
