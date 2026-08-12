/**
 * P1087 — Codex /v1/responses auto-tool no-call compatibility retry.
 *
 * When Responses clients send tools + tool_choice=auto (or missing) and the
 * upstream Chat Completions provider returns plain text (finish_reason=stop,
 * no tool_calls), perform at most one same-provider retry with
 * tool_choice="required".
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
}): boolean {
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
