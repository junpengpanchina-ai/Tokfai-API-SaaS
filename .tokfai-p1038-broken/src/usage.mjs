export function aggregateUsage(parts) {
  return parts.reduce(
    (total, part) => ({
      prompt_tokens: total.prompt_tokens + (part.prompt_tokens ?? 0),
      completion_tokens: total.completion_tokens + (part.completion_tokens ?? 0),
      total_tokens: total.total_tokens + (part.total_tokens ?? 0)
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  );
}
