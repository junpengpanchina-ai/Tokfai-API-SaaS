export function aggregateUsage(parts) {
  return parts.reduce(
    (acc, part) => ({
      prompt_tokens: acc.prompt_tokens + (part.prompt_tokens ?? 0),
      completion_tokens: acc.completion_tokens + (part.completion_tokens ?? 0),
      total_tokens: acc.total_tokens + (part.total_tokens ?? 0)
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  );
}
