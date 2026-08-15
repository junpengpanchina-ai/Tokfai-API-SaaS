/**
 * P1087 / P1088 — Codex /v1/responses auto-tool no-call compatibility retry.
 *
 * When Responses clients send tools + tool_choice=auto (or missing) and the
 * upstream Chat Completions provider returns plain text (finish_reason=stop,
 * no tool_calls), perform at most one same-provider retry with
 * tool_choice="required" (or provider-native required object when applicable).
 *
 * P1088 — effectiveness:
 * - Retry must actually re-fetch with the flipped tool_choice.
 * - If retry returns tool_calls, that result must be selected for the wire.
 * - If retry still has no tool_calls and the accepted body would be blank,
 *   do not return a fake empty success — caller raises a clear error.
 * - Meaningful assistant text after a failed retry remains a legal auto path.
 *
 * This is a protocol bridge only:
 * - Does NOT execute tools
 * - Does NOT invent tool_calls
 * - Does NOT add system/developer prompts
 * - Does NOT mutate tools schema or messages
 * - Does NOT change /v1/chat/completions non-tool paths
 * - Does NOT change required/named success paths
 * - Does NOT open Round-2 when incoming tool results are present
 *
 * Pure helpers: no env / DB / network / billing side effects.
 */

import { toolChoiceKind } from "./cursorToolProtocol.js";

function isStopLikeFinish(finishReason: string | null | undefined): boolean {
  if (finishReason == null || finishReason === "") return true;
  const r = finishReason.trim().toLowerCase();
  return r === "stop" || r === "end_turn" || r === "stop_sequence";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Enum-only tool_choice label for production logs (never dumps objects).
 */
export function summarizeCodexRetryToolChoice(toolChoice: unknown): string {
  return toolChoiceKind(toolChoice);
}

/**
 * Client tool_choice is auto / missing / null — not required, named, or none.
 */
export function isCodexAutoOrMissingToolChoice(toolChoice: unknown): boolean {
  const kind = toolChoiceKind(toolChoice);
  return kind === "auto" || kind === "missing" || kind === "null";
}

/**
 * Gate for one-shot Responses auto → required compatibility retry.
 */
export function shouldAttemptCodexAutoToolNoCallRetry(args: {
  route: string;
  hasTools: boolean;
  toolsCount: number;
  toolChoice: unknown;
  incomingToolMessageCount: number;
  upstreamHttpOk: boolean;
  upstreamReturnedToolCalls: boolean;
  finishReason: string | null | undefined;
  alreadyAttempted: boolean;
  freshRemainingTotalMs: number;
  /** Only native Chat Completions tool path (not emulated_json). */
  activeToolMode?: string;
  /**
   * P1109 — transparent Codex/Cursor auto path: never force a second fetch.
   * Legacy non-transparent callers omit this (or pass false).
   */
  bypassTokfaiToolForce?: boolean;
}): boolean {
  if (args.bypassTokfaiToolForce === true) return false;
  if (args.route !== "/v1/responses") return false;
  if (!args.hasTools) return false;
  if (!(args.toolsCount > 0)) return false;
  if (!isCodexAutoOrMissingToolChoice(args.toolChoice)) return false;
  if (args.incomingToolMessageCount > 0) return false;
  if (!args.upstreamHttpOk) return false;
  if (args.upstreamReturnedToolCalls) return false;
  if (!isStopLikeFinish(args.finishReason)) return false;
  if (args.alreadyAttempted) return false;
  if (!(args.freshRemainingTotalMs > 0)) return false;
  if (args.activeToolMode != null && args.activeToolMode !== "native") {
    return false;
  }
  return true;
}

/**
 * Request-scoped clone: force Chat Completions tool_choice to "required".
 * Preserves tools, messages, model, and all other fields.
 *
 * GRSai / OpenAI chat upstreams accept the string "required". Named object
 * forms belong to the P1083 / P1024 adapters, not this auto→required bridge.
 */
export function applyCodexAutoToolRetryRequiredChoice(
  upstreamBody: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...upstreamBody,
    tool_choice: "required",
  };
}

export function countToolsSafe(tools: unknown): number {
  return Array.isArray(tools) ? tools.length : 0;
}

/**
 * True when the completion has non-whitespace assistant text (not tool_calls).
 * Used to distinguish legal auto text from blank fake-success.
 */
export function codexAutoRetryHasMeaningfulAssistantText(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) return false;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = asRecord(choices[0]);
  if (!first) return false;
  const message = asRecord(first.message);
  if (!message) return false;
  const content = message.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) {
    for (const part of content) {
      const row = asRecord(part);
      if (!row) continue;
      if (typeof row.text === "string" && row.text.trim().length > 0) {
        return true;
      }
      if (typeof row.content === "string" && row.content.trim().length > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * After a failed compatibility retry (still no tool_calls), reject blank
 * wire payloads that would look like a successful empty Responses message.
 * Meaningful assistant text remains allowed (auto semantics).
 */
export function shouldRejectCodexAutoToolRetryBlankSuccess(args: {
  upstreamReturnedToolCalls: boolean;
  responseData: Record<string, unknown> | null | undefined;
}): boolean {
  if (args.upstreamReturnedToolCalls) return false;
  return !codexAutoRetryHasMeaningfulAssistantText(args.responseData);
}
