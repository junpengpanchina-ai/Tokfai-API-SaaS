import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

const API_ROOT = "https://api.tokfai.com/v1";
export const BATCH_API_DEFAULT_MODEL = "auto-fast";
export const BATCH_POLL_PLACEHOLDER_ID = "batch_xxx";

const BATCH_EXAMPLE_ITEMS = [
  { messages: [{ role: "user", content: "Say ok only." }] },
  { messages: [{ role: "user", content: "Say hello only." }] },
  { messages: [{ role: "user", content: "Say hi only." }] },
] as const;

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function batchCreateBody(model = BATCH_API_DEFAULT_MODEL) {
  return {
    model,
    items: BATCH_EXAMPLE_ITEMS.map((item) => ({
      messages: item.messages.map((m) => ({ ...m })),
    })),
  };
}

/** One-line curl for POST /v1/batches/chat. */
export function buildBatchCreateCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = BATCH_API_DEFAULT_MODEL
): string {
  const body = shellSingleQuotedJson(batchCreateBody(model));
  return `curl -sS ${API_ROOT}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

/** One-line curl for GET /v1/batches/{id}. */
export function buildBatchPollCurlOneLine(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = BATCH_POLL_PLACEHOLDER_ID
): string {
  return `curl -sS ${API_ROOT}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

/** Readable multiline create curl (display only). */
export function buildBatchCreateCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = BATCH_API_DEFAULT_MODEL
): string {
  const body = JSON.stringify(batchCreateBody(model), null, 2);
  return `curl https://api.tokfai.com/v1/batches/chat \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

/** Readable multiline poll curl (display only). */
export function buildBatchPollCurlMultiline(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = BATCH_POLL_PLACEHOLDER_ID
): string {
  return `curl https://api.tokfai.com/v1/batches/${batchId} \\
  -H "Authorization: Bearer ${apiKey}"`;
}
