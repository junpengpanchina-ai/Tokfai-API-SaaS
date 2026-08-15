/**
 * P1109 — Transparent Codex/Cursor: do not force tools.
 *
 * When /v1/responses runs on the transparent gateway (explicit gpt-/gemini-
 * models or auto-pro carrier) with client tool_choice=auto|missing, Tokfai
 * must not:
 * - flip tool_choice to required via codex_auto_tool_retry
 * - run grsai_tool_compat_fallback text→tool_calls parsing
 *
 * Client required / named tool_choice is never bypassed (returns false).
 * Provider-native tool_calls are unaffected (retry/fallback never start).
 *
 * Pure predicate: no request-body content or filesystem I/O.
 */

import { toolChoiceKind } from "./cursorToolProtocol.js";

/** Safe log reason enum for transparent_tool_force_bypassed. */
export const TRANSPARENT_TOOL_FORCE_BYPASS_REASON =
  "codex_cursor_transparent_auto_tool_choice" as const;

/**
 * True when Tokfai must skip auto→required retry and GrsAI tool-compat force.
 */
export function shouldBypassTokfaiToolForceForTransparentClient(args: {
  route: string;
  /** Explicit gpt/gemini transparent gateway and/or auto-pro carrier. */
  transparentGateway: boolean;
  toolChoice: unknown;
}): boolean {
  if (args.route !== "/v1/responses") return false;
  if (!args.transparentGateway) return false;
  const kind = toolChoiceKind(args.toolChoice);
  // Only gate forcing for auto / missing / null.
  // required / named object / none must keep existing provider semantics.
  return kind === "auto" || kind === "missing" || kind === "null";
}
