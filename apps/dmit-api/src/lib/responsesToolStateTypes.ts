/**
 * P1093/P1095 — Shared Responses tool-state record types.
 */

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

export type ResponsesToolStateStoreKind = "memory" | "durable" | "hybrid";

export type ResponsesToolStateStoreCapabilities = {
  MEMORY_ONLY_SINGLE_PROCESS: "YES" | "NO";
  DURABLE_STORE_CONFIGURED: "YES" | "NO";
  DURABLE_STORE_ACTIVE: "YES" | "NO";
  PM2_RESTART_STATE_SURVIVES: "YES" | "NO";
  MULTI_INSTANCE_STATE_SHARED: "YES" | "NO";
};

/**
 * Abstract store surface (P1095).
 * Memory implementation stays sync; hybrid/durable use async.
 */
export interface ResponsesToolStateStore {
  saveToolState(
    state: Omit<ResponsesToolStateRecord, "createdAt" | "expiresAt"> & {
      ttlMs?: number;
    }
  ): ResponsesToolStateRecord | Promise<ResponsesToolStateRecord>;
  getToolState(
    responseId: string
  ): ResponsesToolStateRecord | null | Promise<ResponsesToolStateRecord | null>;
  pruneExpiredStates?(nowMs?: number): number | Promise<number>;
  getStoreKind(): ResponsesToolStateStoreKind;
}
