/**
 * Durable persistence for admin upstream channels (P1077R3).
 *
 * Production:
 *   DATABASE only — public.admin_upstream_channels via service_role.
 *   No process-memory source of truth.
 *   No silent local-file fallback when Supabase is misconfigured or DB fails.
 *
 * Dev / offline tests:
 *   DURABLE_FILE only when explicitly allowed
 *   (TOKFAI_ADMIN_CHANNELS_STORE set, or TOKFAI_ADMIN_CHANNELS_ALLOW_FILE_STORE=1,
 *    and never as a silent production fallback).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  decryptSecret,
  encryptSecret,
  isKeyEncryptionConfigured,
} from "../auth/keyEncryption.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { isSupabaseAdminConfigured, supabase } from "../supabase.js";

export type DurableChannelCapability = "audio_transcription" | "chat_image";

export type DurableChannelRow = {
  id: string;
  name: string;
  capability: DurableChannelCapability;
  provider: string;
  base_url: string;
  default_model: string | null;
  /** AES-GCM ciphertext only — never plaintext. */
  encrypted_api_key: string | null;
  api_key_last4: string | null;
  enabled: boolean;
  status: "active" | "disabled";
  priority: number;
  weight: number;
  timeout_ms: number | null;
  last_error: string | null;
  modalities: string[];
  created_at: string;
  updated_at: string;
};

export type AdminChannelStorageClass =
  | "DATABASE"
  | "DURABLE_FILE"
  | "UNAVAILABLE";

export class AdminChannelStoreError extends Error {
  readonly code: string;
  readonly sanitized: string;
  constructor(code: string, sanitized: string) {
    super(sanitized);
    this.name = "AdminChannelStoreError";
    this.code = code;
    this.sanitized = sanitized;
  }
}

type FileEnvelope = {
  version: 1;
  channels: DurableChannelRow[];
};

function defaultFilePath(): string {
  const fromEnv = process.env.TOKFAI_ADMIN_CHANNELS_STORE?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), ".tokfai-data", "admin-upstream-channels.json");
}

/**
 * Explicit opt-in for local/dev/offline harness file store.
 * Production NODE_ENV never allows silent file fallback.
 */
export function allowDurableFileFallback(): boolean {
  if (env.NODE_ENV === "production") return false;
  if (process.env.TOKFAI_ADMIN_CHANNELS_STORE?.trim()) return true;
  if (process.env.TOKFAI_ADMIN_CHANNELS_ALLOW_FILE_STORE === "1") return true;
  return false;
}

export function getAdminChannelStorageClass(): AdminChannelStorageClass {
  if (isSupabaseAdminConfigured()) return "DATABASE";
  if (allowDurableFileFallback()) return "DURABLE_FILE";
  return "UNAVAILABLE";
}

export function getAdminChannelStoragePathOrTable(): string {
  const cls = getAdminChannelStorageClass();
  if (cls === "DATABASE") return "public.admin_upstream_channels";
  if (cls === "DURABLE_FILE") return defaultFilePath();
  return "unavailable";
}

function requireEncryption(): void {
  if (!isKeyEncryptionConfigured()) {
    throw new AdminChannelStoreError(
      "missing_key_encryption_secret",
      "Key encryption is not configured for upstream channel secrets."
    );
  }
}

/** Encrypt plaintext for durable at-rest storage. */
export function encryptUpstreamSecretForStore(plaintext: string): {
  encrypted_api_key: string;
  api_key_last4: string;
} {
  requireEncryption();
  const trimmed = plaintext.trim();
  return {
    encrypted_api_key: encryptSecret(trimmed),
    api_key_last4: trimmed.slice(-4),
  };
}

/** Decrypt durable ciphertext for runtime use only — never log result. */
export function decryptUpstreamSecretFromStore(
  encrypted: string | null | undefined
): string | null {
  if (!encrypted?.trim()) return null;
  try {
    return decryptSecret(encrypted.trim());
  } catch {
    return null;
  }
}

function sanitizeDbError(err: unknown): AdminChannelStoreError {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : err instanceof Error
        ? err.message
        : "";
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const lower = `${code} ${message}`.toLowerCase();

  if (
    lower.includes("does not exist") ||
    lower.includes("undefined_table") ||
    code === "42P01" ||
    lower.includes("admin_upstream_channels")
  ) {
    return new AdminChannelStoreError(
      "admin_channels_table_missing",
      "Admin upstream channels table is not available. Apply migration 0040 before using STT channels."
    );
  }
  if (
    lower.includes("jwt") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    code === "401" ||
    code === "403" ||
    lower.includes("invalid api key")
  ) {
    return new AdminChannelStoreError(
      "admin_channels_db_auth_failed",
      "Admin upstream channels database authentication failed."
    );
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("timeout")
  ) {
    return new AdminChannelStoreError(
      "admin_channels_db_unreachable",
      "Admin upstream channels database is unreachable."
    );
  }
  return new AdminChannelStoreError(
    "admin_channels_db_error",
    "Admin upstream channels database operation failed."
  );
}

function readFileStore(): DurableChannelRow[] {
  const path = defaultFilePath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as FileEnvelope;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.channels)) {
      return [];
    }
    return parsed.channels.map(normalizeRow).filter(Boolean) as DurableChannelRow[];
  } catch (err) {
    log.warn("admin_channels_file_read_failed", {
      message: err instanceof Error ? err.message : "read_failed",
    });
    throw new AdminChannelStoreError(
      "admin_channels_file_read_failed",
      "Failed to read local admin channel store."
    );
  }
}

function writeFileStore(rows: DurableChannelRow[]): void {
  const path = defaultFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const envelope: FileEnvelope = { version: 1, channels: rows };
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(envelope, null, 2), "utf8");
  renameSync(tmp, path);
}

function normalizeRow(raw: unknown): DurableChannelRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim()) return null;
  if (typeof r.base_url !== "string" || !r.base_url.trim()) return null;
  const capability =
    r.capability === "chat_image" ? "chat_image" : "audio_transcription";
  return {
    id: r.id.trim(),
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "channel",
    capability,
    provider:
      typeof r.provider === "string" && r.provider.trim()
        ? r.provider.trim()
        : "openai_compatible",
    base_url: r.base_url.trim(),
    default_model:
      typeof r.default_model === "string" ? r.default_model : null,
    encrypted_api_key:
      typeof r.encrypted_api_key === "string" ? r.encrypted_api_key : null,
    api_key_last4:
      typeof r.api_key_last4 === "string" ? r.api_key_last4 : null,
    enabled: r.enabled !== false,
    status: r.status === "disabled" ? "disabled" : "active",
    priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 10,
    weight: Number.isFinite(Number(r.weight)) ? Number(r.weight) : 100,
    timeout_ms:
      r.timeout_ms == null
        ? null
        : Number.isFinite(Number(r.timeout_ms))
          ? Number(r.timeout_ms)
          : null,
    last_error: typeof r.last_error === "string" ? r.last_error : null,
    modalities: Array.isArray(r.modalities)
      ? r.modalities.map(String)
      : capability === "audio_transcription"
        ? ["audio_transcription"]
        : ["chat", "image"],
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date().toISOString(),
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : new Date().toISOString(),
  };
}

async function loadFromDatabase(): Promise<DurableChannelRow[]> {
  const { data, error } = await supabase()
    .from("admin_upstream_channels")
    .select(
      "id,name,capability,provider,base_url,default_model,encrypted_api_key,api_key_last4,enabled,status,priority,weight,timeout_ms,last_error,modalities,created_at,updated_at"
    )
    .order("priority", { ascending: true });

  if (error) {
    log.warn("admin_channels_db_load_failed", {
      code: error.code,
      // Never log row payloads / secrets — code + short message only.
      message: String(error.message || "db_error").slice(0, 160),
    });
    throw sanitizeDbError(error);
  }
  return (data ?? []).map(normalizeRow).filter(Boolean) as DurableChannelRow[];
}

async function upsertDatabase(row: DurableChannelRow): Promise<void> {
  const { error } = await supabase().from("admin_upstream_channels").upsert(
    {
      id: row.id,
      name: row.name,
      capability: row.capability,
      provider: row.provider,
      base_url: row.base_url,
      default_model: row.default_model,
      encrypted_api_key: row.encrypted_api_key,
      api_key_last4: row.api_key_last4,
      enabled: row.enabled,
      status: row.status,
      priority: row.priority,
      weight: row.weight,
      timeout_ms: row.timeout_ms,
      last_error: row.last_error,
      modalities: row.modalities,
      updated_at: row.updated_at,
      created_at: row.created_at,
    },
    { onConflict: "id" }
  );
  if (error) {
    log.warn("admin_channels_db_upsert_failed", {
      code: error.code,
      message: String(error.message || "db_error").slice(0, 160),
      channel_id: row.id,
    });
    throw sanitizeDbError(error);
  }
}

async function deleteDatabase(id: string): Promise<void> {
  const { error } = await supabase()
    .from("admin_upstream_channels")
    .delete()
    .eq("id", id);
  if (error) {
    log.warn("admin_channels_db_delete_failed", {
      code: error.code,
      message: String(error.message || "db_error").slice(0, 160),
      channel_id: id,
    });
    throw sanitizeDbError(error);
  }
}

/**
 * Load durable channels.
 * Production DATABASE path never falls back to local file or memory.
 */
export async function loadDurableChannels(): Promise<DurableChannelRow[]> {
  const cls = getAdminChannelStorageClass();
  if (cls === "DATABASE") {
    return loadFromDatabase();
  }
  if (cls === "DURABLE_FILE") {
    return readFileStore();
  }
  throw new AdminChannelStoreError(
    "admin_channels_store_unavailable",
    "Admin upstream channel store is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY for production."
  );
}

/** Persist one channel (write-through). No production file mirror. */
export async function persistDurableChannel(
  row: DurableChannelRow
): Promise<void> {
  if (
    row.encrypted_api_key &&
    !row.encrypted_api_key.startsWith("v1:") &&
    row.encrypted_api_key.length < 20
  ) {
    throw new AdminChannelStoreError(
      "invalid_encrypted_secret",
      "Refusing to persist a non-ciphertext upstream secret."
    );
  }

  const cls = getAdminChannelStorageClass();
  if (cls === "DATABASE") {
    await upsertDatabase(row);
    return;
  }
  if (cls === "DURABLE_FILE") {
    const all = readFileStore().filter((c) => c.id !== row.id);
    all.push(row);
    writeFileStore(all);
    return;
  }
  throw new AdminChannelStoreError(
    "admin_channels_store_unavailable",
    "Admin upstream channel store is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY for production."
  );
}

/** Delete one channel from durable store. */
export async function deleteDurableChannel(id: string): Promise<void> {
  const cls = getAdminChannelStorageClass();
  if (cls === "DATABASE") {
    await deleteDatabase(id);
    return;
  }
  if (cls === "DURABLE_FILE") {
    const all = readFileStore().filter((c) => c.id !== id);
    writeFileStore(all);
    return;
  }
  throw new AdminChannelStoreError(
    "admin_channels_store_unavailable",
    "Admin upstream channel store is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY for production."
  );
}

/** Assert a durable payload never contains a known plaintext secret. */
export function durablePayloadContainsPlaintext(
  rows: DurableChannelRow[],
  plaintext: string
): boolean {
  if (!plaintext || plaintext.length < 6) return false;
  return JSON.stringify(rows).includes(plaintext);
}

/** Test-only: wipe durable file store. */
export function __wipeDurableFileStoreForTests(): void {
  if (!allowDurableFileFallback()) return;
  try {
    writeFileStore([]);
  } catch {
    // ignore
  }
}
