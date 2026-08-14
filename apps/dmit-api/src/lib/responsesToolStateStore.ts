/**
 * P1093/P1095 — Responses tool-call state store.
 *
 * Protocol state bridge only: remembers round1 function_call metadata so
 * round2 `previous_response_id` + `function_call_output` can rebuild the
 * full-input transcript. Does NOT execute tools, read files, or invent outputs.
 *
 * P1095: optional durable backend + always-on in-memory fallback (hybrid).
 * Missing encryption key / table / supabase → memory-only, never throws.
 */

import { createHash } from "node:crypto";

import { log } from "../logger.js";
import {
  DurableToolStateError,
  durableGetResponsesToolState,
  durablePruneExpiredResponsesToolStates,
  durableSaveResponsesToolState,
  isResponsesToolStateDurableActive,
  isResponsesToolStateDurableConfigured,
} from "./responsesToolStateDurable.js";
import type {
  ResponsesToolStateRecord,
  ResponsesToolStateStore,
  ResponsesToolStateStoreCapabilities,
  ResponsesToolStateStoreKind,
} from "./responsesToolStateTypes.js";

export type {
  ResponsesToolCallState,
  ResponsesToolStateRecord,
  ResponsesToolStateStore,
  ResponsesToolStateStoreCapabilities,
  ResponsesToolStateStoreKind,
} from "./responsesToolStateTypes.js";

export const RESPONSES_TOOL_STATE_TTL_MS = 45 * 60 * 1000;
const MAX_ENTRIES = 5_000;

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

export function getStoreKind(): ResponsesToolStateStoreKind {
  return isResponsesToolStateDurableConfigured() ? "hybrid" : "memory";
}

export function getResponsesToolStateStoreCapabilities(): ResponsesToolStateStoreCapabilities {
  const configured = isResponsesToolStateDurableConfigured();
  const active = isResponsesToolStateDurableActive();
  return {
    MEMORY_ONLY_SINGLE_PROCESS: configured ? "NO" : "YES",
    DURABLE_STORE_CONFIGURED: configured ? "YES" : "NO",
    DURABLE_STORE_ACTIVE: active ? "YES" : "NO",
    PM2_RESTART_STATE_SURVIVES: active ? "YES" : "NO",
    MULTI_INSTANCE_STATE_SHARED: active ? "YES" : "NO",
  };
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

export function pruneExpiredResponsesToolStates(nowMs = Date.now()): number {
  const before = store.size;
  purgeExpired(nowMs);
  return Math.max(0, before - store.size);
}

/** Restore a durable hit into the process memory map (preserves TTL). */
export function restoreResponsesToolStateToMemory(
  record: ResponsesToolStateRecord
): ResponsesToolStateRecord {
  purgeExpired();
  store.set(record.responseId, record);
  return record;
}

/**
 * Hybrid save: memory always; durable best-effort when configured.
 * Durable failures never throw — memory path remains authoritative for this process.
 */
export async function saveResponsesToolStateHybrid(
  record: Omit<ResponsesToolStateRecord, "createdAt" | "expiresAt"> & {
    ttlMs?: number;
  },
  opts?: { awaitDurable?: boolean }
): Promise<ResponsesToolStateRecord> {
  const saved = saveResponsesToolState(record);
  const ttlMs = saved.expiresAt - saved.createdAt;
  const storeKind = getStoreKind();
  const first = saved.toolCalls[0];

  log.info("responses_tool_state_saved", {
    route: saved.route,
    model: saved.model,
    providerId: saved.providerId,
    responseIdHash: hashForResponsesLog(saved.responseId),
    callIdHash: first ? hashForResponsesLog(first.callId) : undefined,
    toolsCount: saved.toolsCount,
    ttlMs,
    storeKind,
  });

  if (!isResponsesToolStateDurableActive()) {
    if (isResponsesToolStateDurableConfigured()) {
      log.warn("responses_tool_state_durable_unavailable", {
        route: saved.route,
        model: saved.model,
        providerId: saved.providerId,
        responseIdHash: hashForResponsesLog(saved.responseId),
        toolsCount: saved.toolsCount,
        storeKind,
        errorCode: "unavailable",
      });
    }
    return saved;
  }

  const runDurable = async () => {
    try {
      const { byteLength } = await durableSaveResponsesToolState(saved);
      log.info("responses_tool_state_durable_saved", {
        route: saved.route,
        model: saved.model,
        providerId: saved.providerId,
        responseIdHash: hashForResponsesLog(saved.responseId),
        callIdHash: first ? hashForResponsesLog(first.callId) : undefined,
        toolsCount: saved.toolsCount,
        byteLength,
        ttlMs,
        storeKind: "hybrid",
      });
    } catch (err) {
      const errorCode =
        err instanceof DurableToolStateError ? err.code : "upsert_failed";
      log.warn("responses_tool_state_durable_save_failed", {
        route: saved.route,
        model: saved.model,
        providerId: saved.providerId,
        responseIdHash: hashForResponsesLog(saved.responseId),
        toolsCount: saved.toolsCount,
        storeKind: "hybrid",
        errorCode,
      });
    }
  };

  if (opts?.awaitDurable === false) {
    void runDurable();
  } else {
    await runDurable();
  }
  return saved;
}

/**
 * Hybrid get: memory first, then durable. Durable hit restores memory.
 * Durable errors → safe log + null (caller maps to previous_response_not_found).
 */
export async function getResponsesToolStateHybrid(
  responseId: string
): Promise<ResponsesToolStateRecord | null> {
  const id = typeof responseId === "string" ? responseId.trim() : "";
  if (!id) return null;

  const mem = getResponsesToolState(id);
  if (mem) {
    log.info("responses_tool_state_memory_hit", {
      route: mem.route,
      model: mem.model,
      providerId: mem.providerId,
      responseIdHash: hashForResponsesLog(id),
      callIdHash: mem.toolCalls[0]
        ? hashForResponsesLog(mem.toolCalls[0].callId)
        : undefined,
      toolsCount: mem.toolsCount,
      storeKind: getStoreKind(),
    });
    return mem;
  }

  if (!isResponsesToolStateDurableConfigured()) {
    return null;
  }

  if (!isResponsesToolStateDurableActive()) {
    log.warn("responses_tool_state_durable_unavailable", {
      route: "/v1/responses",
      responseIdHash: hashForResponsesLog(id),
      toolsCount: 0,
      storeKind: "hybrid",
      errorCode: "unavailable",
    });
    return null;
  }

  try {
    const durable = await durableGetResponsesToolState(id);
    if (!durable) {
      log.info("responses_tool_state_durable_miss", {
        route: "/v1/responses",
        responseIdHash: hashForResponsesLog(id),
        toolsCount: 0,
        storeKind: "hybrid",
      });
      return null;
    }
    restoreResponsesToolStateToMemory(durable);
    log.info("responses_tool_state_durable_hit", {
      route: durable.route,
      model: durable.model,
      providerId: durable.providerId,
      responseIdHash: hashForResponsesLog(id),
      callIdHash: durable.toolCalls[0]
        ? hashForResponsesLog(durable.toolCalls[0].callId)
        : undefined,
      toolsCount: durable.toolsCount,
      storeKind: "hybrid",
    });
    return durable;
  } catch (err) {
    const errorCode =
      err instanceof DurableToolStateError ? err.code : "unavailable";
    log.warn("responses_tool_state_durable_unavailable", {
      route: "/v1/responses",
      responseIdHash: hashForResponsesLog(id),
      toolsCount: 0,
      storeKind: "hybrid",
      errorCode,
    });
    return null;
  }
}

export async function pruneExpiredStatesHybrid(
  nowMs = Date.now()
): Promise<number> {
  const mem = pruneExpiredResponsesToolStates(nowMs);
  if (!isResponsesToolStateDurableActive()) return mem;
  try {
    const durable = await durablePruneExpiredResponsesToolStates(nowMs);
    return mem + durable;
  } catch {
    return mem;
  }
}

/** Default store facade used by the bridge. */
export const responsesToolStateStore: ResponsesToolStateStore = {
  saveToolState: (state) => saveResponsesToolStateHybrid(state),
  getToolState: (responseId) => getResponsesToolStateHybrid(responseId),
  pruneExpiredStates: (nowMs) => pruneExpiredStatesHybrid(nowMs),
  getStoreKind,
};

/** Test / harness only. */
export function clearResponsesToolStateStoreForTests(): void {
  store.clear();
}

export function responsesToolStateStoreSizeForTests(): number {
  purgeExpired();
  return store.size;
}
