/**
 * P1097 — Canonical client-visible Responses response.id
 *
 * OpenAI/Codex/Cursor round2 `previous_response_id` must equal the public
 * `response.id` from Round1 (SSE response.created / JSON body).
 * Persist + lookup keys must use that same id — never a one-off Date.now()
 * early-frame id, and never a private upstream id as the primary key.
 */

import { createHash } from "node:crypto";

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function canonicalResponsesPublicId(requestId: string): string {
  const rid = typeof requestId === "string" ? requestId.trim() : "";
  if (!rid) return `resp_${Date.now()}`;
  return rid.startsWith("resp_") ? rid : `resp_${rid}`;
}

/**
 * Force `response.id` to the canonical public id derived from Tokfai requestId.
 * Returns previous id when it differed (optional legacy alias target).
 */
export function applyCanonicalResponsesPublicId(
  response: Record<string, unknown>,
  requestId: string
): {
  publicResponseId: string;
  previousResponseId: string | null;
  changed: boolean;
} {
  const publicResponseId = canonicalResponsesPublicId(requestId);
  const previous =
    typeof response.id === "string" && response.id.trim()
      ? response.id.trim()
      : null;
  const changed = previous !== publicResponseId;
  response.id = publicResponseId;
  // Keep request_id aligned for clients that read either field.
  if (
    typeof response.request_id !== "string" ||
    !String(response.request_id).trim()
  ) {
    const bare = publicResponseId.startsWith("resp_")
      ? publicResponseId.slice("resp_".length)
      : publicResponseId;
    response.request_id = bare || requestId;
  }
  return {
    publicResponseId,
    previousResponseId: previous,
    changed,
  };
}

export function responsesPublicIdHashes(args: {
  publicResponseId: string;
  savedResponseId?: string | null;
  lookupResponseId?: string | null;
}): {
  publicResponseIdHash: string;
  savedResponseIdHash?: string;
  lookupResponseIdHash?: string;
} {
  const out: {
    publicResponseIdHash: string;
    savedResponseIdHash?: string;
    lookupResponseIdHash?: string;
  } = {
    publicResponseIdHash: shortHash(args.publicResponseId),
  };
  if (args.savedResponseId) {
    out.savedResponseIdHash = shortHash(args.savedResponseId);
  }
  if (args.lookupResponseId) {
    out.lookupResponseIdHash = shortHash(args.lookupResponseId);
  }
  return out;
}
