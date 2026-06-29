import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/dashboard-safe/constants";

const API_ROOT = "https://api.tokfai.com/v1";
const MODEL = "auto-fast";
const PROMPT = "Say ok only.";

export function playgroundChatCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: PROMPT }],
    stream: false,
  }).replace(/'/g, "'\\''");
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}
