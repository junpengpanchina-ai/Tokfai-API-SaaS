/**
 * P1024 — GRSAI native object tool_choice adapter.
 *
 * GRSAI GPT rejects OpenAI object tool_choice
 * `{ type:"function", function:{ name } }` with HTTP 400, but accepts
 * string `"required"`. Preserve client OpenAI semantics by:
 *   1. recording forcedToolName
 *   2. filtering outbound tools to that function only
 *   3. setting outbound tool_choice = "required"
 *   4. validating upstream tool_calls still match forcedToolName
 *
 * Scope: providerId === "grsai-primary" AND ToolCallingMode === "native"
 * AND client tool_choice is a function object. Never mutates client body.
 */

import { ApiError } from "../errors.js";
import { extractClientToolFunctions } from "./toolIntentCompiler.js";
import {
  TOOL_NAME_NOT_ALLOWED_CODE,
  toolIntentApiError,
} from "./toolIntentErrors.js";

export const GRSAI_NATIVE_TOOL_CHOICE_ADAPTER_PROVIDER = "grsai-primary" as const;

export type ForcedToolChoiceParse =
  | { kind: "none" }
  | { kind: "forced"; name: string }
  | { kind: "invalid"; reason: "empty_name" | "malformed" | "unknown_name" };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Parse OpenAI object tool_choice. String / null / missing → none.
 * Malformed object → invalid (caller returns 400 before provider).
 */
export function parseForcedToolChoice(toolChoice: unknown): ForcedToolChoiceParse {
  if (toolChoice == null) return { kind: "none" };
  if (typeof toolChoice === "string") return { kind: "none" };
  if (!isPlainObject(toolChoice)) return { kind: "invalid", reason: "malformed" };

  if (toolChoice.type !== "function") {
    return { kind: "invalid", reason: "malformed" };
  }
  if (!isPlainObject(toolChoice.function)) {
    return { kind: "invalid", reason: "malformed" };
  }
  const name = toolChoice.function.name;
  if (typeof name !== "string" || !name.trim()) {
    return { kind: "invalid", reason: "empty_name" };
  }
  return { kind: "forced", name: name.trim() };
}

/** Resolve forced name against client tools; unknown name → invalid. */
export function resolveForcedToolChoice(args: {
  toolChoice: unknown;
  tools: unknown;
}): ForcedToolChoiceParse {
  const parsed = parseForcedToolChoice(args.toolChoice);
  if (parsed.kind !== "forced") return parsed;
  const allowed = new Set(
    extractClientToolFunctions(args.tools).map((t) => t.name)
  );
  if (!allowed.has(parsed.name)) {
    return { kind: "invalid", reason: "unknown_name" };
  }
  return parsed;
}

/** Client-side forced tool_choice errors — HTTP 400, not_billable, no provider. */
export function forcedToolChoiceClientError(
  reason: "empty_name" | "malformed" | "unknown_name"
): ApiError {
  const messages: Record<typeof reason, string> = {
    empty_name: "tool_choice.function.name must be a non-empty string.",
    malformed:
      'tool_choice object must be { "type":"function", "function":{ "name":"..." } }.',
    unknown_name:
      "tool_choice.function.name must match a function name in tools.",
  };
  return ApiError.badRequest(messages[reason], TOOL_NAME_NOT_ALLOWED_CODE);
}

export function shouldAdaptGrsaiNativeObjectToolChoice(args: {
  providerId: string;
  toolCallingMode: string;
  forcedToolName: string | null;
}): boolean {
  return (
    args.providerId === GRSAI_NATIVE_TOOL_CHOICE_ADAPTER_PROVIDER &&
    args.toolCallingMode === "native" &&
    typeof args.forcedToolName === "string" &&
    args.forcedToolName.length > 0
  );
}

/**
 * Adapt a *copy* of the upstream body for GRSAI native.
 * Does not mutate the input object or the original client body.
 */
export function adaptGrsaiNativeForcedToolChoiceBody(
  upstreamBody: Record<string, unknown>,
  forcedToolName: string
): {
  body: Record<string, unknown>;
  toolChoiceObjectAdapted: true;
  forcedToolName: string;
  outboundToolCount: number;
} {
  const tools = Array.isArray(upstreamBody.tools) ? upstreamBody.tools : [];
  const filtered = tools.filter((row) => {
    if (!isPlainObject(row)) return false;
    const fn =
      isPlainObject(row.function) ? row.function : row;
    return typeof fn.name === "string" && fn.name.trim() === forcedToolName;
  });

  const next: Record<string, unknown> = { ...upstreamBody };
  next.tools = filtered;
  next.tool_choice = "required";

  return {
    body: next,
    toolChoiceObjectAdapted: true,
    forcedToolName,
    outboundToolCount: filtered.length,
  };
}

function extractToolCallNames(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return [];
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return [];
  }
  const toolCalls = (message as Record<string, unknown>).tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  const names: string[] = [];
  for (const tc of toolCalls) {
    if (!isPlainObject(tc)) {
      names.push("");
      continue;
    }
    const fn = isPlainObject(tc.function) ? tc.function : null;
    const name = fn && typeof fn.name === "string" ? fn.name.trim() : "";
    names.push(name);
  }
  return names;
}

/**
 * After native upstream success with forcedToolName: every tool_call name
 * must equal forcedToolName. Parallel=false still max-one via caller policy.
 */
export function assertNativeForcedToolCallsMatch(args: {
  data: unknown;
  forcedToolName: string;
  parallelToolCalls?: unknown;
}): void {
  const names = extractToolCallNames(args.data);
  if (names.length === 0) {
    throw toolIntentApiError(TOOL_NAME_NOT_ALLOWED_CODE, {
      message: `Required tool "${args.forcedToolName}" was not returned.`,
    });
  }
  if (args.parallelToolCalls === false && names.length > 1) {
    throw toolIntentApiError(TOOL_NAME_NOT_ALLOWED_CODE, {
      message: "parallel_tool_calls=false allows only one tool call.",
    });
  }
  for (const name of names) {
    if (!name || name !== args.forcedToolName) {
      throw toolIntentApiError(TOOL_NAME_NOT_ALLOWED_CODE, {
        message: `Upstream tool_call name must be "${args.forcedToolName}".`,
      });
    }
  }
}
