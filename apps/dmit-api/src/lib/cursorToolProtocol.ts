/**
 * P1031 — Cursor Agent tool-protocol helpers (safe telemetry + round-trip checks).
 *
 * Never logs prompts, messages bodies, arguments contents, or secrets.
 */

import {
  createUpstreamToolCallIdNormalizer,
  isUpstreamSafeToolCallId,
  UPSTREAM_TOOL_CALL_ID_MAX_LEN,
} from "./upstreamToolCallId.js";

export type ToolChoiceKind =
  | "missing"
  | "null"
  | "auto"
  | "none"
  | "required"
  | "object"
  | "other";

export function toolChoiceKind(choice: unknown): ToolChoiceKind {
  if (choice === undefined) return "missing";
  if (choice === null) return "null";
  if (choice === "auto") return "auto";
  if (choice === "none") return "none";
  if (choice === "required") return "required";
  if (choice && typeof choice === "object" && !Array.isArray(choice)) {
    return "object";
  }
  if (typeof choice === "string") return "other";
  return "other";
}

export function countTools(tools: unknown): number {
  return Array.isArray(tools) ? tools.length : 0;
}

export function summarizeRoleCounts(
  messages: unknown
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(messages)) return counts;
  for (const m of messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const role = (m as Record<string, unknown>).role;
    const key = typeof role === "string" && role.trim() ? role.trim() : "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export type ToolRoundTripAnalysis = {
  messageCount: number;
  toolMessageCount: number;
  knownAssistantToolCallIdCount: number;
  /** Safe outbound ids only (already short / ASCII). */
  toolCallIds: string[];
  mappedToolCallIds: string[];
  unmatchedToolCallIds: string[];
  unmatchedToolCallIdCount: number;
  incomingToolCallIdMaxLength: number;
};

/**
 * Analyze role=tool round-trip against assistant.tool_calls ids present in the
 * same messages array. Does not invent associations across truncated history:
 * unmatched rejection is only meaningful when knownAssistantToolCallIdCount > 0.
 */
export function analyzeToolRoundTrip(messages: unknown): ToolRoundTripAnalysis {
  const known = new Set<string>();
  const toolCallIds: string[] = [];
  const mappedToolCallIds: string[] = [];
  const unmatchedToolCallIds: string[] = [];
  let toolMessageCount = 0;
  let incomingToolCallIdMaxLength = 0;
  const normalize = createUpstreamToolCallIdNormalizer();
  const list = Array.isArray(messages) ? messages : [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role.trim() : "";

    if (role === "assistant" && Array.isArray(row.tool_calls)) {
      for (const tc of row.tool_calls) {
        if (!tc || typeof tc !== "object" || Array.isArray(tc)) continue;
        const id = (tc as Record<string, unknown>).id;
        if (typeof id === "string" && id.length > 0) {
          known.add(id);
          known.add(normalize(id));
        }
      }
    }

    if (role === "tool" || role === "function") {
      toolMessageCount += 1;
      const id =
        typeof row.tool_call_id === "string" ? row.tool_call_id.trim() : "";
      if (id.length > 0) {
        incomingToolCallIdMaxLength = Math.max(
          incomingToolCallIdMaxLength,
          id.length
        );
        const mapped = normalize(id);
        // Only expose safe ids in logs / analysis (never arbitrary long raw).
        const safeOut = isUpstreamSafeToolCallId(mapped)
          ? mapped
          : mapped.slice(0, UPSTREAM_TOOL_CALL_ID_MAX_LEN);
        toolCallIds.push(safeOut);
        mappedToolCallIds.push(safeOut);
        if (known.size > 0 && !known.has(id) && !known.has(mapped)) {
          unmatchedToolCallIds.push(safeOut);
        }
      } else {
        unmatchedToolCallIds.push("");
      }
    }
  }

  return {
    messageCount: list.length,
    toolMessageCount,
    knownAssistantToolCallIdCount: known.size,
    toolCallIds,
    mappedToolCallIds,
    unmatchedToolCallIds,
    unmatchedToolCallIdCount: unmatchedToolCallIds.length,
    incomingToolCallIdMaxLength,
  };
}

/** Force client-visible tool_call ids to ASCII <=64 (response path). */
export function ensureClientSafeToolCallIdsOnCompletion(
  data: Record<string, unknown>
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? data.choices : null;
  if (!choices || choices.length === 0) return data;

  const normalize = createUpstreamToolCallIdNormalizer();
  let changed = false;

  const nextChoices = choices.map((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const row = { ...(choice as Record<string, unknown>) };
    const message =
      row.message &&
      typeof row.message === "object" &&
      !Array.isArray(row.message)
        ? { ...(row.message as Record<string, unknown>) }
        : null;
    if (!message || !Array.isArray(message.tool_calls)) return row;

    const nextTcs = message.tool_calls.map((tc) => {
      if (!tc || typeof tc !== "object" || Array.isArray(tc)) return tc;
      const t = { ...(tc as Record<string, unknown>) };
      if (typeof t.id === "string" && t.id.length > 0) {
        const next = normalize(t.id);
        if (next !== t.id) changed = true;
        t.id = next;
      }
      return t;
    });
    message.tool_calls = nextTcs;
    row.message = message;
    return row;
  });

  return changed ? { ...data, choices: nextChoices } : data;
}

export function extractResponseToolCallMeta(
  data: Record<string, unknown>
): {
  toolCallCount: number;
  toolNames: string[];
  toolCallIdLengths: number[];
  argumentsLengths: number[];
  contentIsNull: boolean;
  finishReason: string | null;
} {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first =
    choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    first?.message &&
    typeof first.message === "object" &&
    !Array.isArray(first.message)
      ? (first.message as Record<string, unknown>)
      : null;
  const toolCalls = Array.isArray(message?.tool_calls)
    ? (message!.tool_calls as unknown[])
    : [];
  const toolNames: string[] = [];
  const toolCallIdLengths: number[] = [];
  const argumentsLengths: number[] = [];

  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object" || Array.isArray(tc)) continue;
    const row = tc as Record<string, unknown>;
    if (typeof row.id === "string") toolCallIdLengths.push(row.id.length);
    const fn =
      row.function && typeof row.function === "object" && !Array.isArray(row.function)
        ? (row.function as Record<string, unknown>)
        : null;
    if (typeof fn?.name === "string") toolNames.push(fn.name);
    if (typeof fn?.arguments === "string") {
      argumentsLengths.push(fn.arguments.length);
    } else if (fn?.arguments != null) {
      argumentsLengths.push(-1);
    }
  }

  const finish =
    typeof first?.finish_reason === "string" ? first.finish_reason : null;

  return {
    toolCallCount: toolCalls.length,
    toolNames,
    toolCallIdLengths,
    argumentsLengths,
    contentIsNull: message ? message.content === null : true,
    finishReason: finish,
  };
}
