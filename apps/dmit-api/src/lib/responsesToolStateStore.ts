/**
 * P1093 — Lightweight in-memory Responses tool-call state store.
 *
 * Protocol state bridge only: remembers round1 function_call metadata so
 * round2 `previous_response_id` + `function_call_output` can rebuild the
 * full-input transcript. Does NOT execute tools, read files, or invent outputs.
 */

import { createHash } from "node:crypto";

export const RESPONSES_TOOL_STATE_TTL_MS = 45 * 60 * 1000;
const MAX_ENTRIES = 5_000;

export type ResponsesToolCallState = {
  callId: string;
  name: string;
  arguments: string;
};

export type ResponsesToolStateRecord = {
  responseId: string;
  userIdHash: string;
  model: string;
  route: string;
  providerId: string;
  /** Normalized Responses input items from round1 (enough to rebuild). */
  originalInput: unknown;
  toolCalls: ResponsesToolCallState[];
  tools: unknown;
  toolChoice: unknown;
  toolsCount: number;
  toolsSchemaHash: string;
  createdAt: number;
  expiresAt: number;
};

const store = new Map<string, ResponsesToolStateRecord>();

export function hashForResponsesLog(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function hashUserIdForStore(userId: string): string {
  return hashForResponsesLog(`uid:${userId}`);
}

export function hashToolsSchema(tools: unknown): string {
  try {
    const json = JSON.stringify(tools ?? null);
    return createHash("sha256")
      .update(json || "null", "utf8")
      .digest("hex")
      .slice(0, 16);
  } catch {
    return "unhashable";
  }
}

function purgeExpired(nowMs = Date.now()): void {
  for (const [key, row] of store) {
    if (row.expiresAt <= nowMs) store.delete(key);
  }
  if (store.size <= MAX_ENTRIES) return;
  // Drop oldest first when over capacity.
  const entries = [...store.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );
  const overflow = store.size - MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    const key = entries[i]?.[0];
    if (key) store.delete(key);
  }
}

export function saveResponsesToolState(
  record: Omit<ResponsesToolStateRecord, "createdAt" | "expiresAt"> & {
    ttlMs?: number;
  }
): ResponsesToolStateRecord {
  const now = Date.now();
  const ttlMs =
    typeof record.ttlMs === "number" &&
    Number.isFinite(record.ttlMs) &&
    record.ttlMs > 0
      ? Math.trunc(record.ttlMs)
      : RESPONSES_TOOL_STATE_TTL_MS;
  const { ttlMs: _ttl, ...rest } = record;
  const saved: ResponsesToolStateRecord = {
    ...rest,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  purgeExpired(now);
  store.set(saved.responseId, saved);
  return saved;
}

export function getResponsesToolState(
  responseId: string
): ResponsesToolStateRecord | null {
  const id = typeof responseId === "string" ? responseId.trim() : "";
  if (!id) return null;
  purgeExpired();
  const row = store.get(id);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    store.delete(id);
    return null;
  }
  return row;
}

export function deleteResponsesToolState(responseId: string): boolean {
  return store.delete(responseId);
}

/** Test / harness only. */
export function clearResponsesToolStateStoreForTests(): void {
  store.clear();
}

export function responsesToolStateStoreSizeForTests(): number {
  purgeExpired();
  return store.size;
}
