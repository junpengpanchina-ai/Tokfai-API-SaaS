/**
 * P1109 — allow executeChatCompletion.ts diffs that only add the transparent
 * Codex/Cursor no-tool-force gate (so STT golden-path harnesses can still PASS
 * while Responses tooling semantics change intentionally).
 */

import { spawnSync } from "node:child_process";

const EXEC =
  "apps/dmit-api/src/lib/executeChatCompletion.ts";

const P1109_MARKERS = [
  "shouldBypassTokfaiToolForceForTransparentClient",
  "transparent_tool_force_bypassed",
  "bypassTokfaiToolForce",
  "TRANSPARENT_TOOL_FORCE_BYPASS_REASON",
  "P1109",
];

/**
 * True when HEAD→workdir executeChatCompletion diff is empty or P1109-only.
 */
export function isP1109OnlyExecuteChatCompletionDiff(root) {
  const r = spawnSync("git", ["diff", "HEAD", "--", EXEC], {
    cwd: root,
    encoding: "utf8",
  });
  const d = `${r.stdout || ""}`;
  if (!d.trim()) return true;
  if (!P1109_MARKERS.some((m) => d.includes(m))) return false;
  // Reject accidental STT / whisper edits inside the same file.
  if (/\bstt\b|whisper|audio\/transcription/i.test(d)) return false;
  return true;
}

/**
 * Drop executeChatCompletion.ts from a dirty-forbidden list when the only
 * change is the P1109 transparent no-tool-force gate.
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
