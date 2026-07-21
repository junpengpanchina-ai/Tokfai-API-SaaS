/**
 * Redacted diagnostics for /v1/chat/completions 400s.
 * Logs field shapes only — never API keys or full user content.
 */

import type { ZodError } from "zod";

import { sanitizePublicErrorMessage } from "../errors.js";
import { log } from "../logger.js";

export type ChatCompletion400Diagnostic = {
  requestId?: string;
  route?: string;
  body: unknown;
  rejectedReason: string;
  zodErrors?: string[];
  validationErrors?: string[];
};

/** Top-level body keys only (sorted). */
export function chatBodyKeys(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body as Record<string, unknown>).sort();
}

/**
 * Compact content shape per message, e.g. "string|array[text]|null".
 * Never includes actual text.
 */
export function chatContentShape(messages: unknown): string {
  if (!Array.isArray(messages)) return "not_array";
  if (messages.length === 0) return "empty";

  return messages
    .map((raw) => {
      if (!raw || typeof raw !== "object") return "invalid_message";
      const row = raw as Record<string, unknown>;
      const content = row.content;
      if (typeof content === "string") return "string";
      if (content === null) return "null";
      if (content === undefined) return "missing";
      if (Array.isArray(content)) {
        const partTypes = content.map((part) => {
          if (typeof part === "string") return "string";
          if (!part || typeof part !== "object") return typeof part;
          const p = part as Record<string, unknown>;
          return typeof p.type === "string" && p.type.trim()
            ? p.type.trim()
            : typeof p.text === "string"
              ? "text"
              : "object";
        });
        return `array[${partTypes.join(",")}]`;
      }
      return typeof content;
    })
    .join("|");
}

export function formatZodIssues(error: ZodError, limit = 8): string[] {
  return error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Prefer a concrete client-facing reason; never empty / "undefined".
 */
export function safeInvalidRequestMessage(
  reason: string | undefined | null,
  fallback = "Invalid chat completion request."
): string {
  return sanitizePublicErrorMessage(reason, fallback);
}

export function logChatCompletionInvalidRequest(
  diag: ChatCompletion400Diagnostic
): void {
  const body = diag.body;
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;

  const modelRaw = record?.model;
  const model =
    typeof modelRaw === "string" && modelRaw.trim()
      ? modelRaw.trim()
      : modelRaw === null
        ? "null"
        : modelRaw === undefined
          ? "missing"
          : typeof modelRaw;

  const streamRaw = record?.stream;
  const stream =
    streamRaw === true || streamRaw === false
      ? streamRaw
      : streamRaw === null
        ? "null"
        : streamRaw === undefined
          ? "missing"
          : typeof streamRaw;

  const messages = record?.messages;
  const messagesCount = Array.isArray(messages) ? messages.length : -1;

  log.warn("chat_completion_invalid_request", {
    requestId: diag.requestId,
    route: diag.route ?? "/v1/chat/completions",
    model,
    stream,
    bodyKeys: chatBodyKeys(body).join(","),
    messagesCount,
    contentShape: chatContentShape(messages),
    rejectedReason: safeInvalidRequestMessage(diag.rejectedReason),
    ...(diag.zodErrors?.length
      ? { zodErrors: diag.zodErrors.join(" | ") }
      : {}),
    ...(diag.validationErrors?.length
      ? { validationErrors: diag.validationErrors.join(" | ") }
      : {}),
  });
}
