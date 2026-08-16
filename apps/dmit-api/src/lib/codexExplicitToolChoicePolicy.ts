/**
 * P1115 — Explicit opt-in Codex /v1/responses tool_choice policy.
 *
 * Default (`preserve_auto`): never rewrite client tool_choice.
 * Opt-in (`required_when_tools_present`): for transparent Codex-like
 * /v1/responses requests with toolsCount>0 and tool_choice auto|missing|null,
 * rewrite outbound tool_choice to "required" on the **first** provider fetch.
 *
 * Does NOT:
 * - inspect prompts / paths / filenames / filesystem
 * - execute tools
 * - open a second provider fetch (no codex_auto_tool_retry / grsai compat)
 * - rewrite client required / named / none
 * - change /v1/chat/completions
 *
 * Pure helpers: no DB / network / billing side effects.
 */

import { toolChoiceKind } from "./cursorToolProtocol.js";

export type CodexExplicitToolChoicePolicyName =
  | "preserve_auto"
  | "required_when_tools_present";

export type CodexExplicitToolChoicePolicyReason =
  | "policy_preserve_auto"
  | "route_not_responses"
  | "not_transparent_client"
  | "no_tools"
  | "client_required_preserved"
  | "client_named_preserved"
  | "client_none_preserved"
  | "client_choice_preserved"
  | "required_when_tools_present";

export type CodexExplicitToolChoicePolicyResult = {
  toolChoice: unknown;
  applied: boolean;
  reason: CodexExplicitToolChoicePolicyReason;
  beforeKind: string;
  afterKind: string;
  policy: CodexExplicitToolChoicePolicyName;
};

/**
 * Resolve env string → policy enum. Unknown / empty → preserve_auto.
 */
export function resolveCodexExplicitToolChoicePolicy(
  raw: string | undefined | null
): CodexExplicitToolChoicePolicyName {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "required_when_tools_present") return v;
  return "preserve_auto";
}

/**
 * Pure policy applicator. Callers pass the resolved policy name.
 */
export function applyCodexExplicitToolChoicePolicy(input: {
  route: string;
  /** Explicit gpt/gemini transparent gateway and/or auto-pro carrier. */
  transparentGateway: boolean;
  toolsCount: number;
  toolChoice: unknown;
  policy: CodexExplicitToolChoicePolicyName;
}): CodexExplicitToolChoicePolicyResult {
  const beforeKind = toolChoiceKind(input.toolChoice);

  const passthrough = (
    reason: CodexExplicitToolChoicePolicyReason
  ): CodexExplicitToolChoicePolicyResult => ({
    toolChoice: input.toolChoice,
    applied: false,
    reason,
    beforeKind,
    afterKind: beforeKind,
    policy: input.policy,
  });

  if (input.policy !== "required_when_tools_present") {
    return passthrough("policy_preserve_auto");
  }
  if (input.route !== "/v1/responses") {
    return passthrough("route_not_responses");
  }
  if (!input.transparentGateway) {
    return passthrough("not_transparent_client");
  }
  if (!(input.toolsCount > 0)) {
    return passthrough("no_tools");
  }
  if (beforeKind === "required") {
    return passthrough("client_required_preserved");
  }
  if (beforeKind === "object") {
    return passthrough("client_named_preserved");
  }
  if (beforeKind === "none") {
    return passthrough("client_none_preserved");
  }
  if (
    beforeKind !== "auto" &&
    beforeKind !== "missing" &&
    beforeKind !== "null"
  ) {
    return passthrough("client_choice_preserved");
  }

  return {
    toolChoice: "required",
    applied: true,
    reason: "required_when_tools_present",
    beforeKind,
    afterKind: "required",
    policy: input.policy,
  };
}
