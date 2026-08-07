/**
 * P1050 — Pure tool-call normalization into CanonicalToolCall.
 *
 * Additive seam only. Not imported by executeChatCompletion / GPT Golden Path.
 * Does not mutate arguments content or reorder tool calls.
 */

import { createHash } from "node:crypto";

import type { CanonicalToolCall } from "./canonicalAgentTypes.js";

export type ToolCallNormalizationOk = {
  ok: true;
  toolCall: CanonicalToolCall;
};

export type ToolCallNormalizationErr = {
  ok: false;
  reason:
    | "invalid_shape"
    | "missing_name"
    | "invalid_arguments_json"
    | "invalid_arguments_type";
  index?: number;
};

export type ToolCallNormalizationResult =
  | ToolCallNormalizationOk
  | ToolCallNormalizationErr;

export type ToolCallsNormalizationResult =
  | { ok: true; toolCalls: CanonicalToolCall[] }
  | { ok: false; reason: ToolCallNormalizationErr["reason"]; index: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse tool arguments without inventing objects.
 * - object → keep as-is (shallow copy of keys)
 * - valid JSON string → parsed object (must be object, not array/primitive)
 * - invalid JSON string → failure
 */
export function parseToolCallArguments(
  raw: unknown
):
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; reason: "invalid_arguments_json" | "invalid_arguments_type" } {
  if (isPlainObject(raw)) {
    return { ok: true, arguments: { ...raw } };
  }
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_arguments_type" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    // Empty string is not a valid JSON object — do not invent {}.
    return { ok: false, reason: "invalid_arguments_json" };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      return { ok: false, reason: "invalid_arguments_type" };
    }
    return { ok: true, arguments: parsed };
  } catch {
    return { ok: false, reason: "invalid_arguments_json" };
  }
}

/**
 * Request-scoped deterministic id when the provider omitted one (e.g. Gemini).
 * Same (requestScope, index, name) → same id; does not use Math.random.
 */
export function deterministicToolCallId(args: {
  requestScope: string;
  index: number;
  name: string;
}): string {
  const scope =
    typeof args.requestScope === "string" && args.requestScope.trim()
      ? args.requestScope.trim()
      : "compat";
  const name =
    typeof args.name === "string" && args.name.trim() ? args.name.trim() : "tool";
  const digest = createHash("sha256")
    .update(`${scope}\0${args.index}\0${name}`, "utf8")
    .digest("hex");
  return `call_${digest.slice(0, 24)}`;
}

/**
 * OpenAI-style tool call:
 * { id?, type?: "function", function: { name, arguments } }
 */
export function normalizeOpenAiStyleToolCall(
  raw: unknown,
  opts?: { index?: number; requestScope?: string }
): ToolCallNormalizationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "invalid_shape", index: opts?.index };
  }

  const fn = isPlainObject(raw.function) ? raw.function : null;
  const nameRaw =
    typeof fn?.name === "string"
      ? fn.name
      : typeof raw.name === "string"
        ? raw.name
        : "";
  const name = nameRaw.trim();
  if (!name) {
    return { ok: false, reason: "missing_name", index: opts?.index };
  }

  const argsRaw = fn ? fn.arguments : raw.arguments;
  const parsed = parseToolCallArguments(argsRaw ?? {});
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, index: opts?.index };
  }

  const existingId = typeof raw.id === "string" ? raw.id.trim() : "";
  const id =
    existingId ||
    deterministicToolCallId({
      requestScope: opts?.requestScope ?? "openai",
      index: opts?.index ?? 0,
      name,
    });

  return {
    ok: true,
    toolCall: { id, name, arguments: parsed.arguments },
  };
}

/**
 * Gemini-style conceptual functionCall:
 * { name, args }  (args may be object; id usually absent)
 */
export function normalizeGeminiStyleToolCall(
  raw: unknown,
  opts?: { index?: number; requestScope?: string }
): ToolCallNormalizationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "invalid_shape", index: opts?.index };
  }

  // Accept nested functionCall wrapper or flat { name, args }.
  const body = isPlainObject(raw.functionCall) ? raw.functionCall : raw;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return { ok: false, reason: "missing_name", index: opts?.index };
  }

  const argsRaw =
    body.args !== undefined
      ? body.args
      : body.arguments !== undefined
        ? body.arguments
        : {};
  const parsed = parseToolCallArguments(argsRaw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, index: opts?.index };
  }

  const existingId =
    typeof raw.id === "string"
      ? raw.id.trim()
      : typeof body.id === "string"
        ? body.id.trim()
        : "";
  const id =
    existingId ||
    deterministicToolCallId({
      requestScope: opts?.requestScope ?? "gemini",
      index: opts?.index ?? 0,
      name,
    });

  return {
    ok: true,
    toolCall: { id, name, arguments: parsed.arguments },
  };
}

/** Normalize an ordered list; stop on first failure; preserve order on success. */
export function normalizeOpenAiStyleToolCalls(
  raw: unknown,
  opts?: { requestScope?: string }
): ToolCallsNormalizationResult {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "invalid_shape", index: 0 };
  }
  const out: CanonicalToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const one = normalizeOpenAiStyleToolCall(raw[i], {
      index: i,
      requestScope: opts?.requestScope,
    });
    if (!one.ok) {
      return { ok: false, reason: one.reason, index: i };
    }
    out.push(one.toolCall);
  }
  return { ok: true, toolCalls: out };
}

export function normalizeGeminiStyleToolCalls(
  raw: unknown,
  opts?: { requestScope?: string }
): ToolCallsNormalizationResult {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "invalid_shape", index: 0 };
  }
  const out: CanonicalToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const one = normalizeGeminiStyleToolCall(raw[i], {
      index: i,
      requestScope: opts?.requestScope,
    });
    if (!one.ok) {
      return { ok: false, reason: one.reason, index: i };
    }
    out.push(one.toolCall);
  }
  return { ok: true, toolCalls: out };
}

/**
 * Build a CanonicalAssistantResult from OpenAI-shaped choice fields.
 * Pure helper for tests / future adapters — not used by Golden Path.
 */
export function canonicalAssistantFromOpenAiChoice(args: {
  content?: unknown;
  tool_calls?: unknown;
  usage?: import("./canonicalAgentTypes.js").CanonicalUsage | null;
  finishReasonCanonical: import("./canonicalAgentTypes.js").CanonicalFinishReason;
}): import("./canonicalAgentTypes.js").CanonicalAssistantResult {
  const text =
    typeof args.content === "string"
      ? args.content
      : args.content == null
        ? null
        : String(args.content);
  const tools = normalizeOpenAiStyleToolCalls(args.tool_calls ?? []);
  return {
    text,
    toolCalls: tools.ok ? tools.toolCalls : [],
    finishReason: args.finishReasonCanonical,
    usage: args.usage ?? null,
  };
}
