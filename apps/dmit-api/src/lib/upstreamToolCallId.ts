/**
 * P1027 — Normalize tool call IDs on the upstream request copy only.
 *
 * Some clients (Cursor long sessions) emit tool_call / call_id strings longer
 * than provider limits (e.g. OpenAI-compatible max 64). Map them to stable,
 * ASCII-safe short IDs so assistant.tool_calls[].id and tool.tool_call_id stay
 * consistent within a single upstream request. Never mutates the client body.
 */

import { createHash } from "node:crypto";

export const UPSTREAM_TOOL_CALL_ID_MAX_LEN = 64;

/** Upstream-safe id charset (ASCII). */
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** True when an id may be forwarded unchanged. */
export function isUpstreamSafeToolCallId(id: string): boolean {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= UPSTREAM_TOOL_CALL_ID_MAX_LEN &&
    SAFE_ID_RE.test(id)
  );
}

/**
 * Per-request normalizer: same raw id → same short id; distinct raw ids do not
 * collide (stable numeric/hash suffix on conflict). Does not log raw ids.
 */
export function createUpstreamToolCallIdNormalizer(): (raw: string) => string {
  const mapped = new Map<string, string>();
  const used = new Set<string>();

  return (raw: string): string => {
    if (typeof raw !== "string") return raw;
    if (raw.length === 0) return raw;

    const cached = mapped.get(raw);
    if (cached) return cached;

    if (isUpstreamSafeToolCallId(raw)) {
      used.add(raw);
      mapped.set(raw, raw);
      return raw;
    }

    // tc_ + 28 hex = 31 chars; leave room for collision suffixes.
    const digest = sha256Hex(raw);
    let candidate = `tc_${digest.slice(0, 28)}`;
    let n = 0;
    while (used.has(candidate)) {
      n += 1;
      const bump = sha256Hex(`${digest}:${n}`).slice(0, 8);
      candidate = `tc_${digest.slice(0, 20)}_${bump}`;
      if (candidate.length > UPSTREAM_TOOL_CALL_ID_MAX_LEN) {
        candidate = candidate.slice(0, UPSTREAM_TOOL_CALL_ID_MAX_LEN);
      }
    }

    used.add(candidate);
    mapped.set(raw, candidate);
    return candidate;
  };
}

type MutableMessage = {
  tool_call_id?: string;
  tool_calls?: unknown;
  [key: string]: unknown;
};

/**
 * Rewrite tool_calls[].id and role=tool tool_call_id on a messages copy.
 * Preserves name / arguments / content / order. Returns a new array.
 */
export function normalizeToolCallIdsInUpstreamMessages<T extends MutableMessage>(
  messages: T[]
): T[] {
  const normalize = createUpstreamToolCallIdNormalizer();

  return messages.map((msg) => {
    const next: MutableMessage = { ...msg };

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      next.tool_calls = msg.tool_calls.map((tc) => {
        if (!tc || typeof tc !== "object" || Array.isArray(tc)) return tc;
        const row = { ...(tc as Record<string, unknown>) };
        if (typeof row.id === "string") {
          row.id = normalize(row.id);
        }
        return row;
      });
    }

    if (typeof msg.tool_call_id === "string" && msg.tool_call_id.length > 0) {
      next.tool_call_id = normalize(msg.tool_call_id);
    }

    return next as T;
  });
}
