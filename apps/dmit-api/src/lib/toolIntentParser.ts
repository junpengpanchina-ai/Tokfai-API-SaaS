/**
 * P1017 — Parse emulated tool intent JSON from upstream assistant content
 * into OpenAI-compatible message.tool_calls (or plain assistant text).
 */

import { randomBytes } from "node:crypto";

import {
  extractClientToolFunctions,
} from "./toolIntentCompiler.js";
import {
  MAX_ARGUMENTS_JSON_BYTES,
  MAX_TOOL_CALLS,
  utf8ByteLength,
  validateAgainstJsonSchema,
} from "./toolIntentSchema.js";
import {
  REQUIRED_TOOL_CALL_MISSING_CODE,
  TOOL_ARGUMENTS_INVALID_CODE,
  TOOL_INTENT_INVALID_JSON_CODE,
  TOOL_INTENT_NOT_GENERATED_CODE,
  TOOL_INTENT_TOO_LARGE_CODE,
  TOOL_NAME_NOT_ALLOWED_CODE,
  toolIntentApiError,
  type ToolIntentErrorCode,
} from "./toolIntentErrors.js";
import { ApiError } from "../errors.js";

export type ParsedToolIntent =
  | {
      kind: "tool_call";
      toolCalls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      kind: "assistant_text";
      content: string;
    };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function exactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const got = Object.keys(obj);
  if (got.length !== keys.length) return false;
  const set = new Set(keys);
  return got.every((k) => set.has(k));
}

function newToolCallId(): string {
  return `call_${randomBytes(12).toString("hex")}`;
}

function flattenContent(content: unknown): string | null {
  if (content === null || content === undefined) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") parts.push(item);
      else if (isPlainObject(item) && typeof item.text === "string") {
        parts.push(item.text);
      }
    }
    return parts.join("");
  }
  if (isPlainObject(content)) {
    if (typeof content.text === "string") return content.text;
    // Already an envelope object — stringify for unified parse path? No:
    // handle object content separately in parseToolIntentFromContent.
    return null;
  }
  return null;
}

function hasMarkdownFence(s: string): boolean {
  return s.includes("```");
}

function forcedFunctionName(toolChoice: unknown): string | null {
  if (!toolChoice || typeof toolChoice !== "object" || Array.isArray(toolChoice)) {
    return null;
  }
  const row = toolChoice as Record<string, unknown>;
  const fn =
    row.function && typeof row.function === "object"
      ? (row.function as Record<string, unknown>)
      : row;
  return typeof fn.name === "string" && fn.name.trim() ? fn.name.trim() : null;
}

function fail(code: ToolIntentErrorCode, message?: string): never {
  throw toolIntentApiError(code, message ? { message } : undefined);
}

/**
 * Parse upstream message content into a validated tool intent.
 * Strict: whole trimmed string must be JSON (no fence strip for success).
 */
export function parseToolIntentFromContent(args: {
  content: unknown;
  clientTools: unknown;
  toolChoice?: unknown;
  parallelToolCalls?: unknown;
}): ParsedToolIntent {
  const tools = extractClientToolFunctions(args.clientTools);
  const allowed = new Set(tools.map((t) => t.name));
  const paramsByName = new Map(
    tools.map((t) => [t.name, t.parameters] as const)
  );
  const forced = forcedFunctionName(args.toolChoice);
  const choice = args.toolChoice;
  const required =
    choice === "required" || forced !== null;
  const none = choice === "none";
  const parallelFalse = args.parallelToolCalls === false;

  // Object content already an envelope
  let envelope: unknown;
  if (isPlainObject(args.content) && typeof args.content.type === "string") {
    envelope = args.content;
  } else {
    const raw = flattenContent(args.content);
    if (raw === null || !raw.trim()) {
      fail(TOOL_INTENT_NOT_GENERATED_CODE);
    }
    const trimmed = raw.trim();
    if (hasMarkdownFence(trimmed)) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "Markdown fences are not allowed");
    }
    // Outside text: must parse as whole JSON
    try {
      envelope = JSON.parse(trimmed);
    } catch {
      // Detect wrapped JSON for classification message only — still invalid
      fail(TOOL_INTENT_INVALID_JSON_CODE);
    }
  }

  if (!isPlainObject(envelope)) {
    fail(TOOL_INTENT_INVALID_JSON_CODE);
  }

  // assistant_text
  if (envelope.type === "assistant_text" || "content" in envelope) {
    if (!exactKeys(envelope, ["type", "content"])) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "Invalid assistant_text envelope keys");
    }
    if (envelope.type !== "assistant_text") {
      fail(TOOL_INTENT_INVALID_JSON_CODE);
    }
    if (typeof envelope.content !== "string" || !envelope.content.trim()) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "assistant_text content must be non-empty string");
    }
    if (required) {
      fail(REQUIRED_TOOL_CALL_MISSING_CODE);
    }
    return { kind: "assistant_text", content: envelope.content };
  }

  // tool_call
  if (!exactKeys(envelope, ["type", "tool_calls"])) {
    fail(TOOL_INTENT_INVALID_JSON_CODE, "Invalid tool_call envelope keys");
  }
  if (envelope.type !== "tool_call") {
    fail(TOOL_INTENT_INVALID_JSON_CODE);
  }
  if (none) {
    fail(TOOL_NAME_NOT_ALLOWED_CODE, "tool_choice=none forbids tool calls");
  }

  const tcs = envelope.tool_calls;
  if (!Array.isArray(tcs) || tcs.length === 0) {
    if (required) fail(REQUIRED_TOOL_CALL_MISSING_CODE);
    fail(TOOL_INTENT_NOT_GENERATED_CODE);
  }
  if (tcs.length > MAX_TOOL_CALLS) {
    fail(TOOL_INTENT_TOO_LARGE_CODE, `At most ${MAX_TOOL_CALLS} tool_calls allowed`);
  }
  if (parallelFalse && tcs.length > 1) {
    fail(TOOL_INTENT_INVALID_JSON_CODE, "parallel_tool_calls=false allows only one tool call");
  }

  const mapped: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const tc of tcs) {
    if (!isPlainObject(tc) || !exactKeys(tc, ["name", "arguments"])) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "Each tool_calls item must be {name, arguments}");
    }
    const name = tc.name;
    if (typeof name !== "string" || !name.trim()) {
      fail(TOOL_NAME_NOT_ALLOWED_CODE);
    }
    if (!allowed.has(name)) {
      fail(TOOL_NAME_NOT_ALLOWED_CODE);
    }
    if (forced && name !== forced) {
      fail(TOOL_NAME_NOT_ALLOWED_CODE);
    }
    const argumentsObj = tc.arguments;
    if (!isPlainObject(argumentsObj)) {
      fail(TOOL_ARGUMENTS_INVALID_CODE, "arguments must be a JSON object");
    }
    const schema = paramsByName.get(name);
    if (schema !== undefined) {
      const checked = validateAgainstJsonSchema(argumentsObj, schema);
      if (!checked.ok) {
        fail(TOOL_ARGUMENTS_INVALID_CODE, checked.message);
      }
    }
    let argsJson: string;
    try {
      argsJson = JSON.stringify(argumentsObj);
    } catch {
      fail(TOOL_ARGUMENTS_INVALID_CODE);
    }
    if (utf8ByteLength(argsJson) > MAX_ARGUMENTS_JSON_BYTES) {
      fail(TOOL_INTENT_TOO_LARGE_CODE);
    }
    mapped.push({
      id: newToolCallId(),
      type: "function",
      function: { name, arguments: argsJson },
    });
  }

  return { kind: "tool_call", toolCalls: mapped };
}

/** Apply parsed intent onto an OpenAI chat.completion-shaped response. */
export function applyToolIntentToChatCompletion(
  data: Record<string, unknown>,
  intent: ParsedToolIntent
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? [...data.choices] : [];
  const firstRaw =
    choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : {};
  const first: Record<string, unknown> = { ...firstRaw, index: firstRaw.index ?? 0 };

  if (intent.kind === "assistant_text") {
    first.message = {
      role: "assistant",
      content: intent.content,
    };
    first.finish_reason = "stop";
    choices[0] = first;
    return { ...data, choices };
  }

  first.message = {
    role: "assistant",
    content: null,
    tool_calls: intent.toolCalls,
  };
  first.finish_reason = "tool_calls";
  choices[0] = first;
  return { ...data, choices };
}

export function extractAssistantContentFromCompletion(
  data: unknown
): unknown {
  if (!data || typeof data !== "object") return null;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;
  return (message as Record<string, unknown>).content;
}

export function isToolIntentApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    typeof err.code === "string" &&
    (err.code.startsWith("tool_intent_") ||
      err.code === REQUIRED_TOOL_CALL_MISSING_CODE ||
      err.code === TOOL_NAME_NOT_ALLOWED_CODE ||
      err.code === TOOL_ARGUMENTS_INVALID_CODE)
  );
}
