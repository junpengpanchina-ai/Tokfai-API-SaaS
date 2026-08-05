/**
 * P1031 / P1033 — Cursor Agent tool-protocol helpers.
 *
 * - Safe telemetry (never logs prompts / arguments / secrets)
 * - role=tool round-trip analysis
 * - P1033 resumeToolRound detection + full transcript validation
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

export const DUPLICATE_TOOL_RESULT_CODE = "duplicate_tool_result" as const;
export const MISSING_ASSISTANT_TOOL_CALLS_CODE =
  "missing_assistant_tool_calls" as const;
export const INVALID_TOOL_MESSAGE_ORDER_CODE =
  "invalid_tool_message_order" as const;
export const INVALID_TOOL_CALL_ID_CODE = "invalid_tool_call_id" as const;

export type ToolTranscriptRejectCode =
  | typeof DUPLICATE_TOOL_RESULT_CODE
  | typeof MISSING_ASSISTANT_TOOL_CALLS_CODE
  | typeof INVALID_TOOL_MESSAGE_ORDER_CODE
  | typeof INVALID_TOOL_CALL_ID_CODE;

export type ToolTranscriptValidation =
  | {
      ok: true;
      resumeToolRound: boolean;
      analysis: ToolRoundTripAnalysis;
      duplicateToolResultCount: number;
      orderViolationCount: number;
    }
  | {
      ok: false;
      resumeToolRound: false;
      code: ToolTranscriptRejectCode;
      message: string;
      analysis: ToolRoundTripAnalysis;
      duplicateToolResultCount: number;
      orderViolationCount: number;
    };

function safeIdOut(mapped: string): string {
  return isUpstreamSafeToolCallId(mapped)
    ? mapped
    : mapped.slice(0, UPSTREAM_TOOL_CALL_ID_MAX_LEN);
}

/**
 * Analyze role=tool round-trip against assistant.tool_calls ids present in the
 * same messages array. Single forward scan so results before their calls count
 * as unmatched (order-aware).
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
        const safeOut = safeIdOut(mapped);
        toolCallIds.push(safeOut);
        mappedToolCallIds.push(safeOut);
        // Order-aware: result before any matching assistant.tool_calls is unmatched.
        if (!known.has(id) && !known.has(mapped)) {
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

/**
 * P1033 — Full Cursor tool transcript validation + resumeToolRound detection.
 *
 * resumeToolRound=true when:
 * - at least one role=tool / function message
 * - every tool result matches a prior assistant.tool_calls id
 * - no unmatched / duplicate / order violations
 * - historical assistant.tool_calls exist
 *
 * Rejects (before provider fetch) on unmatched, duplicate, missing history,
 * or illegal assistant/tool order.
 */
export function validateCursorToolTranscript(
  messages: unknown
): ToolTranscriptValidation {
  const analysis = analyzeToolRoundTrip(messages);
  const normalize = createUpstreamToolCallIdNormalizer();
  const list = Array.isArray(messages) ? messages : [];

  // Pass 1 — all assistant tool_call ids in the transcript (history-wide).
  const allKnown = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role.trim() : "";
    if (role !== "assistant" || !Array.isArray(row.tool_calls)) continue;
    for (const tc of row.tool_calls) {
      if (!tc || typeof tc !== "object" || Array.isArray(tc)) continue;
      const id = (tc as Record<string, unknown>).id;
      if (typeof id !== "string" || id.length === 0) continue;
      allKnown.add(id);
      allKnown.add(normalize(id));
    }
  }

  // Pass 2 — order + duplicate checks (forward scan).
  let duplicateToolResultCount = 0;
  let orderViolationCount = 0;
  let unmatchedCount = 0;
  const seenSoFar = new Set<string>();
  const answered = new Set<string>();

  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role.trim() : "";

    if (role === "assistant" && Array.isArray(row.tool_calls)) {
      for (const tc of row.tool_calls) {
        if (!tc || typeof tc !== "object" || Array.isArray(tc)) continue;
        const id = (tc as Record<string, unknown>).id;
        if (typeof id !== "string" || id.length === 0) continue;
        seenSoFar.add(id);
        seenSoFar.add(normalize(id));
      }
    }

    if (role === "tool" || role === "function") {
      const id =
        typeof row.tool_call_id === "string" ? row.tool_call_id.trim() : "";
      if (!id) {
        unmatchedCount += 1;
        continue;
      }
      const mapped = normalize(id);
      if (!allKnown.has(id) && !allKnown.has(mapped)) {
        unmatchedCount += 1;
        continue;
      }
      if (!seenSoFar.has(id) && !seenSoFar.has(mapped)) {
        // Id exists in history but after this result → illegal order.
        orderViolationCount += 1;
        continue;
      }
      if (answered.has(id) || answered.has(mapped)) {
        duplicateToolResultCount += 1;
        continue;
      }
      answered.add(id);
      answered.add(mapped);
    }
  }

  if (analysis.toolMessageCount === 0) {
    return {
      ok: true,
      resumeToolRound: false,
      analysis,
      duplicateToolResultCount: 0,
      orderViolationCount: 0,
    };
  }

  // role=tool present but no historical assistant.tool_calls at all.
  if (allKnown.size === 0) {
    return {
      ok: false,
      resumeToolRound: false,
      code: MISSING_ASSISTANT_TOOL_CALLS_CODE,
      message:
        "tool messages require a prior assistant message with tool_calls in messages.",
      analysis,
      duplicateToolResultCount,
      orderViolationCount,
    };
  }

  if (duplicateToolResultCount > 0) {
    return {
      ok: false,
      resumeToolRound: false,
      code: DUPLICATE_TOOL_RESULT_CODE,
      message:
        "duplicate tool result for the same tool_call_id is not allowed.",
      analysis,
      duplicateToolResultCount,
      orderViolationCount,
    };
  }

  if (unmatchedCount > 0) {
    return {
      ok: false,
      resumeToolRound: false,
      code: INVALID_TOOL_CALL_ID_CODE,
      message:
        "tool message tool_call_id does not match any assistant tool_calls id in messages.",
      analysis,
      duplicateToolResultCount,
      orderViolationCount,
    };
  }

  if (orderViolationCount > 0) {
    return {
      ok: false,
      resumeToolRound: false,
      code: INVALID_TOOL_MESSAGE_ORDER_CODE,
      message:
        "tool message appears before its assistant tool_calls or in an illegal order.",
      analysis,
      duplicateToolResultCount,
      orderViolationCount,
    };
  }

  // Legal, fully matched tool transcript → resume round (not first-turn intent).
  return {
    ok: true,
    resumeToolRound: true,
    analysis,
    duplicateToolResultCount: 0,
    orderViolationCount: 0,
  };
}

/** True when messages contain a legal role=tool resume transcript. */
export function isResumeToolRound(messages: unknown): boolean {
  const v = validateCursorToolTranscript(messages);
  return v.ok && v.resumeToolRound;
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
