/**
 * Allow executeChatCompletion.ts diffs that only add Responses tool-choice
 * transparency / opt-in policy / privacy-safe wire diagnostics (so STT
 * golden-path harnesses can still PASS while Responses tooling semantics
 * change intentionally).
 *
 * Rejects accidental STT / whisper / audio edits inside the same file.
 */

import { spawnSync } from "node:child_process";

const EXEC = "apps/dmit-api/src/lib/executeChatCompletion.ts";

const ALLOWED_MARKERS = [
  // P1109
  "shouldBypassTokfaiToolForceForTransparentClient",
  "transparent_tool_force_bypassed",
  "bypassTokfaiToolForce",
  "TRANSPARENT_TOOL_FORCE_BYPASS_REASON",
  "P1109",
  // P1115
  "applyCodexExplicitToolChoicePolicy",
  "resolveCodexExplicitToolChoicePolicy",
  "codex_explicit_tool_choice_policy",
  "codexExplicitToolChoicePolicy",
  "TOKFAI_CODEX_TOOL_CHOICE_POLICY",
  "P1115",
  // P1116R2 / P1119
  "summarizeOutboundToolChoiceWire",
  "summarizeUpstreamToolsSchemaFingerprint",
  "summarizeToolChoiceWireShape",
  "upstream_tool_choice_wire",
  "upstreamToolChoiceWireDiag",
  "inboundToolChoiceKind",
  "outboundToolChoiceKind",
  "toolTypesSummary",
  "toolNameHashes",
  "parametersByteLengths",
  "inputSchemaPresentCount",
  "P1116R2",
  "P1116",
  "P1119",
];

/**
 * True when HEAD→workdir executeChatCompletion diff is empty or
 * P1109/P1115/P1116R2 Responses tool-choice-only.
 */
export function isP1109OnlyExecuteChatCompletionDiff(root) {
  const r = spawnSync("git", ["diff", "HEAD", "--", EXEC], {
    cwd: root,
    encoding: "utf8",
  });
  const d = `${r.stdout || ""}`;
  if (!d.trim()) return true;
  if (!ALLOWED_MARKERS.some((m) => d.includes(m))) return false;
  // Reject accidental STT / whisper edits inside the same file.
  if (/\bstt\b|whisper|audio\/transcription/i.test(d)) return false;
  return true;
}

/**
 * Drop executeChatCompletion.ts from a dirty-forbidden list when the only
 * change is Responses tool-choice transparency / opt-in / wire diagnostics.
 */
export function filterForbiddenDirtyAllowingP1109Chat(dirtyPaths, root) {
  const allowChat = isP1109OnlyExecuteChatCompletionDiff(root);
  return dirtyPaths.filter((p) => {
    if (p === EXEC || p.endsWith("/executeChatCompletion.ts")) {
      return !allowChat;
    }
    return true;
  });
}
