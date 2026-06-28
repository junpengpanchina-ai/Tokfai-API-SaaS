import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

const API_ROOT = "https://api.tokfai.com/v1";
const CHAT_MODEL = "auto-fast";
const CHAT_PROMPT = "Say ok only.";

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

function chatBody(model = CHAT_MODEL) {
  return {
    model,
    messages: [{ role: "user", content: CHAT_PROMPT }],
    stream: false,
  };
}

export function chatCurlOneLineSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = CHAT_MODEL
): string {
  const body = shellSingleQuotedJson(chatBody(model));
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function chatCurlPowerShellOneLineSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = CHAT_MODEL
): string {
  const body = powershellJsonBody(chatBody(model));
  return `curl.exe -sS "${API_ROOT}/chat/completions" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${body}"`;
}

export function modelsCurlOneLineSafe(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `curl -sS ${API_ROOT}/models -H "Authorization: Bearer ${apiKey}"`;
}

export function imageCurlOneLineSafe(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = shellSingleQuotedJson({
    model: "gpt-image-2",
    prompt: "Create a clean product-style image of a futuristic API dashboard.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
  return `curl -sS ${API_ROOT}/images/generations -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}
