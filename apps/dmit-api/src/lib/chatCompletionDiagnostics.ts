/**
 * Redacted diagnostics for /v1/chat/completions 400s and empty-messages noop.
 * Logs field shapes only — never API keys or full user content.
 */

/** Cherry Studio compat: empty / missing messages → HTTP 200 noop (no upstream). */
export const EMPTY_MESSAGES_NOOP_CONTENT = "请求内容为空，请重新输入。";

import type { ZodError } from "zod";

import { sanitizePublicErrorMessage } from "../errors.js";
import { log } from "../logger.js";
import { resolveChatModel } from "../upstream/modelAliases.js";

export type ChatCompletion400Diagnostic = {
  requestId?: string;
  route?: string;
  body: unknown;
  rejectedReason: string;
  zodErrors?: string[];
  validationErrors?: string[];
  /** Optional overrides when caller already resolved the model. */
  requestedModel?: string;
  resolvedModel?: string;
  normalized?: boolean;
  noop?: boolean;
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

function resolveModelDiagFields(
  body: unknown,
  overrides?: { requestedModel?: string; resolvedModel?: string }
): {
  model: string;
  requestedModel?: string;
  resolvedModel?: string;
  stream: boolean | string;
  messages: unknown;
  messagesCount: number;
} {
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

  let requestedModel =
    typeof overrides?.requestedModel === "string" &&
    overrides.requestedModel.trim()
      ? overrides.requestedModel.trim()
      : typeof model === "string" && model !== "null" && model !== "missing"
        ? model
        : undefined;
  let resolvedModel =
    typeof overrides?.resolvedModel === "string" &&
    overrides.resolvedModel.trim()
      ? overrides.resolvedModel.trim()
      : undefined;
  if (requestedModel && !resolvedModel) {
    try {
      resolvedModel = resolveChatModel(requestedModel).canonicalId;
    } catch {
      resolvedModel = requestedModel;
    }
  }

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

  return { model, requestedModel, resolvedModel, stream, messages, messagesCount };
}

export function logChatCompletionInvalidRequest(
  diag: ChatCompletion400Diagnostic
): void {
  const body = diag.body;
  const {
    model,
    requestedModel,
    resolvedModel,
    stream,
    messages,
    messagesCount,
  } = resolveModelDiagFields(body, {
    requestedModel: diag.requestedModel,
    resolvedModel: diag.resolvedModel,
  });

  log.warn("chat_completion_invalid_request", {
    requestId: diag.requestId,
    route: diag.route ?? "/v1/chat/completions",
    model,
    ...(requestedModel ? { requestedModel } : {}),
    ...(resolvedModel ? { resolvedModel } : {}),
    stream,
    bodyKeys: chatBodyKeys(body).join(","),
    messagesCount,
    contentShape: chatContentShape(messages),
    rejectedReason: safeInvalidRequestMessage(diag.rejectedReason),
    normalized: diag.normalized === true,
    noop: diag.noop === true,
    ...(diag.zodErrors?.length
      ? { zodErrors: diag.zodErrors.join(" | ") }
      : {}),
    ...(diag.validationErrors?.length
      ? { validationErrors: diag.validationErrors.join(" | ") }
      : {}),
  });
}

/**
 * Cherry Studio occasionally POSTs messages=[] / missing / non-array /
 * all-empty content. Treat as empty for a not-billable HTTP 200 noop.
 */
export function isEmptyChatMessagesBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const messages = (body as Record<string, unknown>).messages;
  if (messages === undefined || messages === null) return true;
  if (!Array.isArray(messages)) return true;
  return messages.length === 0;
}

export function logChatCompletionEmptyMessagesNoop(args: {
  requestId: string;
  route?: string;
  body: unknown;
  /** Original client body (pre-normalize) for contentShape / bodyKeys. */
  originalBody?: unknown;
  normalized?: boolean;
  rejectedReason?: string;
}): void {
  const bodyForShape = args.originalBody ?? args.body;
  const {
    model,
    requestedModel,
    resolvedModel,
    stream,
    messages,
    messagesCount,
  } = resolveModelDiagFields(bodyForShape);

  const shapeMessages =
    bodyForShape &&
    typeof bodyForShape === "object" &&
    !Array.isArray(bodyForShape)
      ? (bodyForShape as Record<string, unknown>).messages
      : messages;

  log.warn("chat_completion_empty_messages_noop", {
    requestId: args.requestId,
    route: args.route ?? "/v1/chat/completions",
    model,
    ...(requestedModel ? { requestedModel } : {}),
    ...(resolvedModel ? { resolvedModel } : {}),
    stream,
    bodyKeys: chatBodyKeys(bodyForShape).join(","),
    messagesCount: Array.isArray(shapeMessages) ? shapeMessages.length : 0,
    contentShape: chatContentShape(shapeMessages),
    rejectedReason: args.rejectedReason ?? "empty_messages",
    normalized: args.normalized !== false,
    noop: true,
  });
}

/** OpenAI-compatible chat.completion body for empty-messages noop (not billable). */
export function buildEmptyMessagesNoopChatCompletion(args: {
  requestId: string;
  body: unknown;
}): Record<string, unknown> {
  const record =
    args.body && typeof args.body === "object" && !Array.isArray(args.body)
      ? (args.body as Record<string, unknown>)
      : null;
  const modelRaw = record?.model;
  const model =
    typeof modelRaw === "string" && modelRaw.trim()
      ? modelRaw.trim()
      : "unknown";

  return {
    id: `chatcmpl_${args.requestId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: EMPTY_MESSAGES_NOOP_CONTENT,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    credits_charged: 0,
    request_id: args.requestId,
    tokfai: {
      credits_charged: 0,
      request_id: args.requestId,
      requested_model: model,
      resolved_model: model,
      billing_status: "not_billable",
      rejectedReason: "empty_messages",
    },
  };
}

/**
 * Redacted log when a client body was sanitized before schema (not a noop).
 */
export function logChatCompletionClientNormalized(args: {
  requestId: string;
  route?: string;
  body: unknown;
  originalBody?: unknown;
}): void {
  const bodyForShape = args.originalBody ?? args.body;
  const {
    model,
    requestedModel,
    resolvedModel,
    stream,
    messages,
    messagesCount,
  } = resolveModelDiagFields(bodyForShape);

  log.info("chat_completion_client_normalized", {
    requestId: args.requestId,
    route: args.route ?? "/v1/chat/completions",
    model,
    ...(requestedModel ? { requestedModel } : {}),
    ...(resolvedModel ? { resolvedModel } : {}),
    stream,
    bodyKeys: chatBodyKeys(bodyForShape).join(","),
    messagesCount,
    contentShape: chatContentShape(messages),
    normalized: true,
    noop: false,
  });
}
