import {
  buildImageApiCurlMultiline,
  buildImageApiCurlOneLine,
} from "@/lib/customer-image-api-chapter";
import {
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

const API_ROOT = "https://api.tokfai.com/v1";
const CHAT_SMOKE_MODEL = "auto-fast";
const CHAT_SMOKE_PROMPT = "Say ok only.";

/** Escape a string for use inside single-quoted shell arguments. */
function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

export function chatCurlOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = shellSingleQuotedJson({
    model: CHAT_SMOKE_MODEL,
    messages: [{ role: "user", content: CHAT_SMOKE_PROMPT }],
    stream: false,
  });
  return `curl -sS ${API_ROOT}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function modelsCurlOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `curl -sS ${API_ROOT}/models -H "Authorization: Bearer ${apiKey}"`;
}

export function imageCurlOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return buildImageApiCurlOneLine(apiKey);
}

export function batchCreateCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = CHAT_SMOKE_MODEL
): string {
  const body = shellSingleQuotedJson({
    model,
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
      { messages: [{ role: "user", content: "Say hi only." }] },
    ],
  });
  return `curl -sS ${API_ROOT}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function batchPollCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return `curl -sS ${API_ROOT}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

/** Readable multi-line chat curl (display only — copy one-line helper for terminal). */
export function chatCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = CHAT_SMOKE_MODEL
): string {
  return `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "user", "content": "${CHAT_SMOKE_PROMPT}" }
    ],
    "stream": false
  }'`;
}

export function modelsCurlMultiline(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer ${apiKey}"`;
}

export function imageCurlMultiline(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return buildImageApiCurlMultiline(apiKey);
}

export function batchCreateCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return `curl https://api.tokfai.com/v1/batches/chat \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "items": [
      { "messages": [{ "role": "user", "content": "Say ok only." }] },
      { "messages": [{ "role": "user", "content": "Say hello only." }] },
      { "messages": [{ "role": "user", "content": "Say hi only." }] }
    ]
  }'`;
}

export function batchPollCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return `curl https://api.tokfai.com/v1/batches/${batchId} \\
  -H "Authorization: Bearer ${apiKey}"`;
}
