/**
 * P1095 — Optional durable backend for Responses tool-call state.
 *
 * - Encrypts rebuild payload at rest (AES-256-GCM).
 * - Uses Supabase service_role when configured.
 * - Never throws into request path; callers treat failures as miss/fallback.
 * - Injectable mock backend for offline harnesses (no real DB required).
 */

import { isSupabaseAdminConfigured, supabaseAdmin } from "../supabase.js";
import {
  decryptResponsesToolStatePayload,
  encryptResponsesToolStatePayload,
  isResponsesStateEncryptionConfigured,
} from "./responsesToolStateCrypto.js";
import type { ResponsesToolStateRecord } from "./responsesToolStateTypes.js";

export const RESPONSES_TOOL_STATES_TABLE = "responses_tool_states";

/** Encrypted payload only — never Authorization / API keys / round2 outputs. */
type DurableStateBlob = {
  originalInput: unknown;
  toolCalls: ResponsesToolStateRecord["toolCalls"];
  tools: unknown;
  toolChoice: unknown;
  toolsSchemaHash: string;
  toolsCount: number;
  userIdHash: string;
};

export type DurableBackendErrorCode =
  | "encryption_not_configured"
  | "supabase_not_configured"
  | "table_missing"
  | "encrypt_failed"
  | "decrypt_failed"
  | "upsert_failed"
  | "select_failed"
  | "invalid_row"
  | "expired"
  | "unavailable";

export class DurableToolStateError extends Error {
  readonly code: DurableBackendErrorCode;
  constructor(code: DurableBackendErrorCode, message?: string) {
    super(message || code);
    this.name = "DurableToolStateError";
    this.code = code;
  }
}

export type ResponsesToolStateDurableBackend = {
  save(record: ResponsesToolStateRecord): Promise<void>;
  get(responseId: string): Promise<ResponsesToolStateRecord | null>;
  pruneExpired?(nowMs?: number): Promise<number>;
};

let mockBackend: ResponsesToolStateDurableBackend | null = null;
let durableUnavailableLatch = false;
let durableUnavailableCode: DurableBackendErrorCode | null = null;

export function setResponsesToolStateDurableBackendForTests(
  backend: ResponsesToolStateDurableBackend | null
): void {
  mockBackend = backend;
  durableUnavailableLatch = false;
  durableUnavailableCode = null;
}

export function resetResponsesToolStateDurableLatchForTests(): void {
  durableUnavailableLatch = false;
  durableUnavailableCode = null;
}

export function getDurableUnavailableCode(): DurableBackendErrorCode | null {
  return durableUnavailableCode;
}

function markUnavailable(code: DurableBackendErrorCode): void {
  // Table missing / permanent config issues: latch so we stop hammering DB.
  if (code === "table_missing" || code === "supabase_not_configured") {
    durableUnavailableLatch = true;
    durableUnavailableCode = code;
  }
}

function isTableMissingError(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : String(err || "");
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code || "")
      : "";
  // PostgREST / Postgres relation missing signals
  if (code === "PGRST205" || code === "42P01") return true;
  if (/does not exist|schema cache|Could not find the table/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Durable is "configured" when encryption key exists AND:
 * - a test mock backend is injected, OR
 * - Supabase service_role is present AND TOKFAI_RESPONSES_TOOL_STATE_DURABLE=1
 *
 * Missing key / flag / table → memory-only fallback (never throws).
 */
export function isResponsesToolStateDurableConfigured(): boolean {
  if (!isResponsesStateEncryptionConfigured()) return false;
  if (mockBackend) return true;
  if (!isSupabaseAdminConfigured()) return false;
  const flag = process.env.TOKFAI_RESPONSES_TOOL_STATE_DURABLE?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function isResponsesToolStateDurableActive(): boolean {
  return isResponsesToolStateDurableConfigured() && !durableUnavailableLatch;
}

function toBlob(record: ResponsesToolStateRecord): DurableStateBlob {
  return {
    originalInput: record.originalInput,
    toolCalls: record.toolCalls,
    tools: record.tools,
    toolChoice: record.toolChoice,
    toolsSchemaHash: record.toolsSchemaHash,
    toolsCount: record.toolsCount,
    userIdHash: record.userIdHash,
  };
}

function fromBlob(
  meta: {
    responseId: string;
    model: string;
    route: string;
    providerId: string;
    createdAt: number;
    expiresAt: number;
  },
  blob: DurableStateBlob
): ResponsesToolStateRecord {
  return {
    responseId: meta.responseId,
    userIdHash: blob.userIdHash,
    model: meta.model,
    route: meta.route,
    providerId: meta.providerId,
    originalInput: blob.originalInput,
    toolCalls: blob.toolCalls,
    tools: blob.tools,
    toolChoice: blob.toolChoice,
    toolsCount: blob.toolsCount,
    toolsSchemaHash: blob.toolsSchemaHash,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
  };
}

function encryptRecord(record: ResponsesToolStateRecord): {
  ciphertext: string;
  byteLength: number;
} {
  if (!isResponsesStateEncryptionConfigured()) {
    throw new DurableToolStateError("encryption_not_configured");
  }
  try {
    const plaintext = JSON.stringify(toBlob(record));
    const ciphertext = encryptResponsesToolStatePayload(plaintext);
    return {
      ciphertext,
      byteLength: Buffer.byteLength(ciphertext, "utf8"),
    };
  } catch (err) {
    if (err instanceof DurableToolStateError) throw err;
    throw new DurableToolStateError("encrypt_failed");
  }
}

function decryptRow(row: {
  response_id: string;
  model: string | null;
  route: string;
  provider_id: string | null;
  state_ciphertext: string;
  created_at: string;
  expires_at: string;
}): ResponsesToolStateRecord {
  try {
    const json = decryptResponsesToolStatePayload(row.state_ciphertext);
    const blob = JSON.parse(json) as DurableStateBlob;
    if (
      !blob ||
      typeof blob !== "object" ||
      !Array.isArray(blob.toolCalls) ||
      typeof blob.userIdHash !== "string"
    ) {
      throw new DurableToolStateError("invalid_row");
    }
    const createdAt = Date.parse(row.created_at);
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
      throw new DurableToolStateError("invalid_row");
    }
    if (expiresAt <= Date.now()) {
      throw new DurableToolStateError("expired");
    }
    return fromBlob(
      {
        responseId: row.response_id,
        model: row.model || "",
        route: row.route || "/v1/responses",
        providerId: row.provider_id || "unknown",
        createdAt,
        expiresAt,
      },
      blob
    );
  } catch (err) {
    if (err instanceof DurableToolStateError) throw err;
    throw new DurableToolStateError("decrypt_failed");
  }
}

const supabaseBackend: ResponsesToolStateDurableBackend = {
  async save(record) {
    if (!isSupabaseAdminConfigured()) {
      throw new DurableToolStateError("supabase_not_configured");
    }
    const { ciphertext } = encryptRecord(record);
    const { error } = await supabaseAdmin()
      .from(RESPONSES_TOOL_STATES_TABLE)
      .upsert(
        {
          response_id: record.responseId,
          user_id: null,
          provider_id: record.providerId || null,
          model: record.model || null,
          route: record.route || "/v1/responses",
          state_ciphertext: ciphertext,
          key_version: "v1",
          created_at: new Date(record.createdAt).toISOString(),
          expires_at: new Date(record.expiresAt).toISOString(),
        },
        { onConflict: "response_id" }
      );
    if (error) {
      if (isTableMissingError(error)) {
        markUnavailable("table_missing");
        throw new DurableToolStateError("table_missing", error.message);
      }
      throw new DurableToolStateError("upsert_failed", error.message);
    }
  },

  async get(responseId) {
    if (!isSupabaseAdminConfigured()) {
      throw new DurableToolStateError("supabase_not_configured");
    }
    const id = responseId.trim();
    if (!id) return null;
    const { data, error } = await supabaseAdmin()
      .from(RESPONSES_TOOL_STATES_TABLE)
      .select(
        "response_id, model, route, provider_id, state_ciphertext, created_at, expires_at"
      )
      .eq("response_id", id)
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error)) {
        markUnavailable("table_missing");
        throw new DurableToolStateError("table_missing", error.message);
      }
      throw new DurableToolStateError("select_failed", error.message);
    }
    if (!data) return null;
    try {
      return decryptRow(data as Parameters<typeof decryptRow>[0]);
    } catch (err) {
      if (err instanceof DurableToolStateError && err.code === "expired") {
        return null;
      }
      throw err;
    }
  },

  async pruneExpired(nowMs = Date.now()) {
    if (!isSupabaseAdminConfigured()) return 0;
    const { error, count } = await supabaseAdmin()
      .from(RESPONSES_TOOL_STATES_TABLE)
      .delete({ count: "exact" })
      .lte("expires_at", new Date(nowMs).toISOString());
    if (error) {
      if (isTableMissingError(error)) {
        markUnavailable("table_missing");
        throw new DurableToolStateError("table_missing", error.message);
      }
      throw new DurableToolStateError("upsert_failed", error.message);
    }
    return typeof count === "number" ? count : 0;
  },
};

function activeBackend(): ResponsesToolStateDurableBackend | null {
  if (!isResponsesStateEncryptionConfigured()) return null;
  if (mockBackend) return mockBackend;
  if (!isSupabaseAdminConfigured()) return null;
  if (durableUnavailableLatch) return null;
  return supabaseBackend;
}

export async function durableSaveResponsesToolState(
  record: ResponsesToolStateRecord
): Promise<{ byteLength: number }> {
  const backend = activeBackend();
  if (!backend) {
    throw new DurableToolStateError(
      durableUnavailableCode ||
        (!isResponsesStateEncryptionConfigured()
          ? "encryption_not_configured"
          : !isSupabaseAdminConfigured() && !mockBackend
            ? "supabase_not_configured"
            : "unavailable")
    );
  }
  const { byteLength } = encryptRecord(record);
  await backend.save(record);
  return { byteLength };
}

export async function durableGetResponsesToolState(
  responseId: string
): Promise<ResponsesToolStateRecord | null> {
  const backend = activeBackend();
  if (!backend) {
    throw new DurableToolStateError(
      durableUnavailableCode ||
        (!isResponsesStateEncryptionConfigured()
          ? "encryption_not_configured"
          : !isSupabaseAdminConfigured() && !mockBackend
            ? "supabase_not_configured"
            : "unavailable")
    );
  }
  return backend.get(responseId);
}

export async function durablePruneExpiredResponsesToolStates(
  nowMs = Date.now()
): Promise<number> {
  const backend = activeBackend();
  if (!backend?.pruneExpired) return 0;
  return backend.pruneExpired(nowMs);
}

/** In-memory mock durable map for harnesses (still requires encryption key). */
export function createMockDurableBackend(): ResponsesToolStateDurableBackend & {
  _map: Map<string, string>;
  _meta: Map<
    string,
    {
      model: string;
      route: string;
      providerId: string;
      createdAt: number;
      expiresAt: number;
    }
  >;
} {
  const _map = new Map<string, string>();
  const _meta = new Map<
    string,
    {
      model: string;
      route: string;
      providerId: string;
      createdAt: number;
      expiresAt: number;
    }
  >();
  return {
    _map,
    _meta,
    async save(record) {
      const { ciphertext } = encryptRecord(record);
      _map.set(record.responseId, ciphertext);
      _meta.set(record.responseId, {
        model: record.model,
        route: record.route,
        providerId: record.providerId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      });
    },
    async get(responseId) {
      const ciphertext = _map.get(responseId);
      const meta = _meta.get(responseId);
      if (!ciphertext || !meta) return null;
      if (meta.expiresAt <= Date.now()) {
        _map.delete(responseId);
        _meta.delete(responseId);
        return null;
      }
      return decryptRow({
        response_id: responseId,
        model: meta.model,
        route: meta.route,
        provider_id: meta.providerId,
        state_ciphertext: ciphertext,
        created_at: new Date(meta.createdAt).toISOString(),
        expires_at: new Date(meta.expiresAt).toISOString(),
      });
    },
    async pruneExpired(nowMs = Date.now()) {
      let n = 0;
      for (const [id, meta] of _meta) {
        if (meta.expiresAt <= nowMs) {
          _map.delete(id);
          _meta.delete(id);
          n += 1;
        }
      }
      return n;
    },
  };
}
