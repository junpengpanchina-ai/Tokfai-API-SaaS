/**
 * Display labels for GET /v1/models consumed by Cherry Studio / Chatbox / etc.
 *
 * Real model `id` stays unchanged for API compatibility. Clients that read
 * `display_name` / `name` / `title` show a Tokfai-prefixed label so users do
 * not confuse Tokfai models with native OpenAI / Gemini provider entries.
 */

/** Known ids → preferred UI label (without the leading "Tokfai "). */
const KNOWN_LABELS: Record<string, string> = {
  "auto-fast": "Auto Fast",
  "auto-pro": "Auto Pro",
  "auto-cheap": "Auto Cheap",
  "gpt-5": "GPT-5",
  "gpt-5-chat": "GPT-5 Chat",
  "gpt-5-pro": "GPT-5 Pro",
  "gpt-5.1": "GPT-5.1",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.5": "GPT-5.5",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
};

function humanizeModelId(modelId: string): string {
  const known = KNOWN_LABELS[modelId];
  if (known) return known;

  return modelId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      if (/^gpt$/i.test(part)) return "GPT";
      if (/^gemini$/i.test(part)) return "Gemini";
      if (/^auto$/i.test(part)) return "Auto";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bGpt\b/g, "GPT")
    .replace(/GPT (\d)/g, "GPT-$1");
}

/**
 * Build Cherry-friendly display name. Always prefixes Tokfai.
 * Prefer known catalog labels so clients see "Tokfai GPT-5.5" consistently.
 */
export function tokfaiClientDisplayName(
  modelId: string,
  dbDisplayName?: string | null
): string {
  const known = KNOWN_LABELS[modelId];
  if (known) return `Tokfai ${known}`;

  const raw =
    typeof dbDisplayName === "string" && dbDisplayName.trim().length > 0
      ? dbDisplayName.trim()
      : humanizeModelId(modelId);
  const withoutPrefix =
    raw.replace(/^Tokfai\s+/i, "").trim() || humanizeModelId(modelId);
  return `Tokfai ${withoutPrefix}`;
}
