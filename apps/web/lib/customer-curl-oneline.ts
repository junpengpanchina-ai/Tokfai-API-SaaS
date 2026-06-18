import {
  buildBatchCreateCurlMultiline,
  buildBatchCreateCurlOneLine,
  buildBatchItemsCurlOneLine,
  buildBatchPollCurlMultiline,
  buildBatchPollCurlOneLine,
} from "@/lib/customer-batch-api-chapter";
import {
  buildImageApiCurlMultiline,
  buildImageApiCurlOneLine,
} from "@/lib/customer-image-api-chapter";
import {
  TOKFAI_API_KEY_PLACEHOLDER,
} from "@/lib/tokfai-api";

const API_ROOT = "https://api.tokfai.com/v1";
const CHAT_SMOKE_MODEL = "auto-fast";
const CHAT_SMOKE_PROMPT = "Say ok only.";

/** Escape a string for use inside single-quoted shell arguments. */
function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function chatCompletionBody(model = CHAT_SMOKE_MODEL) {
  return {
    model,
    messages: [{ role: "user", content: CHAT_SMOKE_PROMPT }],
    stream: false,
  };
}

/** PowerShell curl.exe — double-quoted JSON for one-paste on Windows. */
function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

export function chatCurlPowerShellOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = powershellJsonBody(chatCompletionBody());
  return `curl.exe -sS "${API_ROOT}/chat/completions" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${body}"`;
}

export function modelsCurlPowerShellOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `curl.exe -sS "${API_ROOT}/models" -H "Authorization: Bearer ${apiKey}"`;
}

function responsesBody(model = CHAT_SMOKE_MODEL) {
  return { model, input: CHAT_SMOKE_PROMPT };
}

export function responsesCurlPowerShellOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = powershellJsonBody(responsesBody());
  return `curl.exe -sS "${API_ROOT}/responses" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${body}"`;
}

export function responsesCurlOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = shellSingleQuotedJson(responsesBody());
  return `curl -sS ${API_ROOT}/responses -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

export function chatCurlOneLine(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = shellSingleQuotedJson(chatCompletionBody());
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
  return buildBatchCreateCurlOneLine(apiKey, model);
}

export function batchPollCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return buildBatchPollCurlOneLine(apiKey, batchId);
}

export function batchItemsCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return buildBatchItemsCurlOneLine(apiKey, batchId);
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
  model = CHAT_SMOKE_MODEL
): string {
  return buildBatchCreateCurlMultiline(apiKey, model);
}

export function batchPollCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return buildBatchPollCurlMultiline(apiKey, batchId);
}
