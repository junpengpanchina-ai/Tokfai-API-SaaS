import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isKeyEncryptionConfigured } from "../auth/keyEncryption.js";
import { env } from "../env.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import {
  AdminChannelStoreError,
  decryptUpstreamSecretFromStore,
  deleteDurableChannel,
  encryptUpstreamSecretForStore,
  getAdminChannelStorageClass,
  getAdminChannelStoragePathOrTable,
  loadDurableChannels,
  persistDurableChannel,
  __wipeDurableFileStoreForTests,
  type DurableChannelRow,
} from "../lib/adminUpstreamChannelsStore.js";
import { log } from "../logger.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import {
  createOpenaiCompatSttAdapter,
  detectSttProviderBaseMismatch,
} from "../upstream/audio/openaiCompatSttAdapter.js";
import { createSelfHostedWhisperAdapter } from "../upstream/audio/selfHostedWhisperAdapter.js";
import {
  getSttProviderCapability,
  GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE,
} from "../upstream/audio/sttProviderCapability.js";
import type { AudioSttProviderId } from "../upstream/audio/types.js";

export {
  getSttProviderCapability,
  GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE,
  isGrsaiSttEndpointConfirmed,
} from "../upstream/audio/sttProviderCapability.js";

export {
  AdminChannelStoreError,
  getAdminChannelStorageClass,
  getAdminChannelStoragePathOrTable,
};

export type AdminChannelModality = "chat" | "image" | "audio_transcription";

export type AdminChannelCapability = "chat_image" | "audio_transcription";

export type AdminSttProvider =
  | "groq_whisper_compatible"
  | "grsai_whisper_compatible"
  | "openai_compatible"
  | "self_hosted_whisper";

export type AdminChannelRow = {
  id: string;
  provider_name: string;
  /** Always empty in list/get responses — use base_url_masked. */
  base_url: string;
  base_url_masked: string;
  status: "active" | "disabled";
  priority: number;
  weight: number;
  timeout_ms: number | null;
  success_rate: number | null;
  last_error: string | null;
  enabled: boolean;
  modalities: AdminChannelModality[];
  updated_at: string | null;
  /** Extended fields — STT channels set these; primary chat/image may omit. */
  capability?: AdminChannelCapability;
  provider?: AdminSttProvider | null;
  default_model?: string | null;
  /** True when an upstream API key is stored — never returns the secret. */
  api_key_set?: boolean;
  /** Masked hint only (e.g. gsk_…abcd). Never full secret. */
  api_key_masked?: string | null;
  /** P1107 — whether Whisper STT endpoint shape is known/confirmed for this provider. */
  stt_endpoint_known?: boolean | null;
  /** P1107 — experimental / unverified STT (e.g. GrsAI without confirmed endpoint). */
  stt_experimental?: boolean | null;
};

type AdminChannelWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
  requestId?: string;
  route?: string;
};

type ChannelOverlay = {
  enabled?: boolean;
  status?: "active" | "disabled";
  priority?: number;
  weight?: number;
  base_url_override?: string | null;
  updated_at: string;
};

type SttChannelSecret = {
  /** AES-GCM ciphertext when TOKFAI_KEY_ENCRYPTION_SECRET is configured. */
  encrypted: string | null;
  /** Process-memory fallback when encryption is not configured (tests/dev). */
  memory: string | null;
  last4: string;
};

type SttChannelRecord = {
  id: string;
  name: string;
  provider: AdminSttProvider;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number | null;
  secret: SttChannelSecret;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Process-local overlays for primary chat/image channel (operational tweaks).
 * STT upstream channels are durable (DB / encrypted file) — memory is cache only.
 */
const channelOverlays = new Map<string, ChannelOverlay>();

/** In-memory cache of durable STT channels. Never the source of truth. */
const sttChannels = new Map<string, SttChannelRecord>();
let sttCacheLoaded = false;
let sttCacheLoadPromise: Promise<void> | null = null;

const PRIMARY_CHANNEL_ID = "primary-channel";

const DEFAULT_GROQ_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "whisper-large-v3-turbo";
const DEFAULT_GRSAI_STT_BASE = "https://grsaiapi.com/v1";
const DEFAULT_GRSAI_STT_MODEL = "whisper-1";
const DEFAULT_SELF_HOSTED_MODEL = "whisper-1";

function emptySecret(): SttChannelSecret {
  return { encrypted: null, memory: null, last4: "" };
}

function defaultModelForProvider(provider: AdminSttProvider): string {
  if (provider === "groq_whisper_compatible") return DEFAULT_GROQ_MODEL;
  if (provider === "grsai_whisper_compatible") return DEFAULT_GRSAI_STT_MODEL;
  if (provider === "self_hosted_whisper") return DEFAULT_SELF_HOSTED_MODEL;
  return "whisper-1";
}

function defaultBaseForProvider(provider: AdminSttProvider): string | null {
  if (provider === "groq_whisper_compatible") return DEFAULT_GROQ_BASE;
  if (provider === "grsai_whisper_compatible") return DEFAULT_GRSAI_STT_BASE;
  return null;
}

function durableToRecord(row: DurableChannelRow): SttChannelRecord | null {
  if (row.capability !== "audio_transcription") return null;
  const provider =
    row.provider === "openai_compatible" ||
    row.provider === "groq_whisper_compatible" ||
    row.provider === "grsai_whisper_compatible" ||
    row.provider === "self_hosted_whisper"
      ? row.provider
      : null;
  if (!provider) return null;
  return {
    id: row.id,
    name: row.name,
    provider,
    baseUrl: row.base_url,
    defaultModel: row.default_model || defaultModelForProvider(provider),
    enabled: row.enabled,
    priority: row.priority,
    weight: row.weight,
    timeoutMs: row.timeout_ms,
    secret: {
      encrypted: row.encrypted_api_key,
      memory: null,
      last4: row.api_key_last4 || "",
    },
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordToDurable(rec: SttChannelRecord): DurableChannelRow {
  return {
    id: rec.id,
    name: rec.name,
    capability: "audio_transcription",
    provider: rec.provider,
    base_url: rec.baseUrl,
    default_model: rec.defaultModel,
    encrypted_api_key: rec.secret.encrypted,
    api_key_last4: rec.secret.last4,
    enabled: rec.enabled,
    status: rec.enabled ? "active" : "disabled",
    priority: rec.priority,
    weight: rec.weight,
    timeout_ms: rec.timeoutMs,
    last_error: rec.lastError,
    modalities: ["audio_transcription"],
    created_at: rec.createdAt,
    updated_at: rec.updatedAt,
  };
}

async function ensureSttCacheLoaded(): Promise<void> {
  if (sttCacheLoaded) return;
  if (sttCacheLoadPromise) {
    await sttCacheLoadPromise;
    return;
  }
  sttCacheLoadPromise = (async () => {
    const rows = await loadDurableChannels();
    sttChannels.clear();
    for (const row of rows) {
      const rec = durableToRecord(row);
      if (rec) sttChannels.set(rec.id, rec);
    }
    sttCacheLoaded = true;
  })();
  try {
    await sttCacheLoadPromise;
  } catch (err) {
    sttCacheLoaded = false;
    throw err instanceof AdminChannelStoreError
      ? err
      : new AdminChannelStoreError(
          "admin_channels_store_unavailable",
          "Admin upstream channel store is unavailable."
        );
  } finally {
    sttCacheLoadPromise = null;
  }
}

async function persistSttRecord(rec: SttChannelRecord): Promise<void> {
  // Cloud STT requires encrypted secret; self-hosted worker secret is optional.
  if (!rec.secret.encrypted && rec.provider !== "self_hosted_whisper") {
    throw new Error("refusing to persist STT channel without encrypted secret");
  }
  await persistDurableChannel(recordToDurable(rec));
  sttChannels.set(rec.id, rec);
  sttCacheLoaded = true;
}

function maskBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    if (host.length <= 6) return `${parsed.protocol}//***`;
    return `${parsed.protocol}//${host.slice(0, 3)}***${host.slice(-3)}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    if (url.length <= 8) return "***";
    return `${url.slice(0, 4)}***${url.slice(-4)}`;
  }
}

function storeSecret(plaintext: string): SttChannelSecret {
  if (!isKeyEncryptionConfigured()) {
    throw new Error(
      "TOKFAI_KEY_ENCRYPTION_SECRET is required to store upstream channel secrets"
    );
  }
  const sealed = encryptUpstreamSecretForStore(plaintext);
  return {
    encrypted: sealed.encrypted_api_key,
    memory: null,
    last4: sealed.api_key_last4,
  };
}

function readSecret(secret: SttChannelSecret): string | null {
  return decryptUpstreamSecretFromStore(secret.encrypted);
}

function baseChannel(): AdminChannelRow {
  const baseUrl = env.GRSAI_BASE_URL;
  return {
    // Public admin label only — never expose real supplier brand/id to the UI.
    id: PRIMARY_CHANNEL_ID,
    provider_name: "Tokfai private channel",
    base_url: baseUrl,
    base_url_masked: maskBaseUrl(baseUrl),
    status: "active",
    priority: 1,
    weight: 100,
    timeout_ms: env.IMAGE_REQUEST_TIMEOUT_MS ?? env.GRSAI_CHAT_TIMEOUT_MS ?? null,
    success_rate: null,
    last_error: null,
    enabled: true,
    modalities: ["chat", "image"],
    updated_at: null,
    capability: "chat_image",
    provider: null,
    default_model: null,
    api_key_set: Boolean(env.GRSAI_API_KEY?.trim()),
    api_key_masked: null,
  };
}

function applyOverlay(
  channel: AdminChannelRow,
  overlay: ChannelOverlay | undefined
): AdminChannelRow {
  if (!overlay) {
    return {
      ...channel,
      // Never ship the real upstream host to the Admin browser.
      base_url: "",
      base_url_masked: maskBaseUrl(channel.base_url),
      last_error: null,
    };
  }

  const enabled =
    overlay.enabled !== undefined
      ? overlay.enabled
      : overlay.status !== undefined
        ? overlay.status === "active"
        : channel.enabled;

  const status =
    overlay.status ??
    (overlay.enabled !== undefined
      ? overlay.enabled
        ? "active"
        : "disabled"
      : channel.status);

  const effectiveBase =
    overlay.base_url_override?.trim() || channel.base_url;

  return {
    ...channel,
    enabled,
    status,
    priority: overlay.priority ?? channel.priority,
    weight: overlay.weight ?? channel.weight,
    base_url: "",
    base_url_masked: maskBaseUrl(effectiveBase),
    last_error: null,
    updated_at: overlay.updated_at,
  };
}

function sttRecordToRow(rec: SttChannelRecord): AdminChannelRow {
  // Prefer last4 / ciphertext presence so list never decrypts for display.
  const secretPresent = Boolean(
    rec.secret.encrypted?.trim() || rec.secret.last4 || readSecret(rec.secret)
  );
  const cap = getSttProviderCapability(rec.provider, { baseUrl: rec.baseUrl });
  return {
    id: rec.id,
    provider_name: rec.name,
    base_url: "",
    base_url_masked: maskBaseUrl(rec.baseUrl),
    status: rec.enabled ? "active" : "disabled",
    priority: rec.priority,
    weight: rec.weight,
    timeout_ms: rec.timeoutMs,
    success_rate: null,
    last_error: rec.lastError,
    enabled: rec.enabled,
    modalities: ["audio_transcription"],
    updated_at: rec.updatedAt,
    capability: "audio_transcription",
    provider: rec.provider,
    default_model: rec.defaultModel,
    api_key_set: secretPresent,
    api_key_masked: secretPresent
      ? `****…${rec.secret.last4 || "****"} (set)`
      : null,
    stt_endpoint_known: cap.sttEndpointKnown,
    stt_experimental: cap.experimental,
  };
}

/** Read-only channel view: primary chat/image + durable STT channels. */
export async function listAdminChannels(): Promise<AdminChannelRow[]> {
  try {
    await ensureSttCacheLoaded();
  } catch (err) {
    // Admin list must not silently invent an empty STT inventory on DB failure.
    throw err instanceof AdminChannelStoreError
      ? err
      : new AdminChannelStoreError(
          "admin_channels_store_unavailable",
          "Admin upstream channel store is unavailable."
        );
  }
  const channel = baseChannel();
  const primary = applyOverlay(channel, channelOverlays.get(channel.id));
  const stt = [...sttChannels.values()]
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
    .map(sttRecordToRow);
  return [primary, ...stt];
}

export async function getAdminChannel(
  id: string
): Promise<AdminChannelRow | null> {
  const channel = (await listAdminChannels()).find((row) => row.id === id);
  return channel ?? null;
}

/**
 * Runtime STT channel selection (internal — never expose secrets).
 * Reloads from durable store so multi-process / restart see shared config.
 */
export async function resolveEnabledSttAdminChannel(): Promise<{
  id: string;
  providerId: AudioSttProviderId;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs: number;
} | null> {
  try {
    await ensureSttCacheLoaded();
  } catch (err) {
    // Designed consumer-safe degradation: durable store unavailable → ENV_FALLBACK.
    // Never invent process-memory channels. Never leak store/DB details or secrets.
    const code =
      err instanceof AdminChannelStoreError
        ? err.code
        : "admin_channels_store_unavailable";
    log.warn("admin_stt_channel_store_unavailable_env_fallback", {
      code,
      message: "Durable STT channel store unavailable; using env fallback.",
    });
    return null;
  }
  const candidates = [...sttChannels.values()]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

  for (const rec of candidates) {
    const baseUrl = rec.baseUrl.trim();
    if (!baseUrl) continue;
    const apiKey = readSecret(rec.secret) ?? "";
    if (rec.provider === "self_hosted_whisper") {
      return {
        id: rec.id,
        providerId: "self_hosted_whisper",
        baseUrl,
        apiKey,
        defaultModel:
          rec.defaultModel || defaultModelForProvider("self_hosted_whisper"),
        timeoutMs: rec.timeoutMs ?? env.TOKFAI_STT_TIMEOUT_MS ?? 60_000,
      };
    }
    if (!apiKey) continue;
    const providerId: AudioSttProviderId =
      rec.provider === "groq_whisper_compatible"
        ? "groq_whisper_compatible"
        : rec.provider === "grsai_whisper_compatible"
          ? "grsai_whisper_compatible"
          : "openai_compatible";
    return {
      id: rec.id,
      providerId,
      baseUrl,
      apiKey,
      defaultModel:
        rec.defaultModel || defaultModelForProvider(rec.provider),
      timeoutMs: rec.timeoutMs ?? env.TOKFAI_STT_TIMEOUT_MS ?? 60_000,
    };
  }
  return null;
}

async function auditChannelWrite(
  ctx: AdminChannelWriteContext,
  args: {
    action: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    error?: string | null;
    channel?: AdminChannelRow | null;
  }
): Promise<void> {
  // Never put api_key / secrets into audit payloads.
  const safeRequest = { ...args.requestPayload };
  delete safeRequest.api_key;
  delete safeRequest.apiKey;

  try {
    await recordAdminAuditLog({
      actorUserId: ctx.adminUser.userId,
      actorEmail: ctx.adminUser.email,
      action: args.action,
      resourceType: "channel",
      resourceId: args.resourceId,
      requestPayload: safeRequest,
      status: args.status,
      resultPayload: {
        ok: args.status === "succeeded",
        channel_id: args.resourceId,
        action: args.action,
        error: args.error ?? null,
        channel: args.channel
          ? {
              id: args.channel.id,
              enabled: args.channel.enabled,
              status: args.channel.status,
              priority: args.channel.priority,
              base_url_masked: args.channel.base_url_masked,
              capability: args.channel.capability ?? null,
              provider: args.channel.provider ?? null,
              default_model: args.channel.default_model ?? null,
              api_key_set: args.channel.api_key_set ?? false,
            }
          : null,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      idempotencyKey: ctx.idempotencyKey || undefined,
    });
  } catch {
    // Soft-fail: channel ops must work in offline tests without service_role.
    log.warn("admin_channel_audit_skipped", {
      action: args.action,
      resourceId: args.resourceId,
    });
  }
}

const ALLOWED_PRIMARY_PATCH = new Set([
  "enabled",
  "status",
  "priority",
  "weight",
  "base_url",
]);

const ALLOWED_STT_PATCH = new Set([
  "enabled",
  "status",
  "priority",
  "weight",
  "base_url",
  "api_key",
  "default_model",
  "provider",
  "provider_name",
  "name",
  "timeout_ms",
]);

function parseBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeSttProvider(raw: unknown): AdminSttProvider | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "groq_whisper_compatible" || v === "groq") {
    return "groq_whisper_compatible";
  }
  if (
    v === "grsai_whisper_compatible" ||
    v === "grsai" ||
    v === "grsai_whisper"
  ) {
    return "grsai_whisper_compatible";
  }
  if (
    v === "openai_compatible" ||
    v === "openai" ||
    v === "openai-compatible"
  ) {
    return "openai_compatible";
  }
  if (
    v === "self_hosted_whisper" ||
    v === "self_hosted" ||
    v === "self-hosted-whisper" ||
    v === "self-hosted"
  ) {
    return "self_hosted_whisper";
  }
  return null;
}

/**
 * Create an STT upstream channel (admin only).
 * Consumer API keys are never used as upstream credentials.
 */
export async function createAdminSttChannel(
  body: Record<string, unknown>,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; channel: AdminChannelRow }
  | { ok: false; status: 400; error: string; detail?: unknown }
> {
  const capability = String(body.capability ?? "audio_transcription").trim();
  if (capability !== "audio_transcription" && capability !== "stt") {
    await auditChannelWrite(ctx, {
      action: "channels.create",
      resourceId: "new",
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "invalid_capability",
    });
    return { ok: false, status: 400, error: "invalid_capability" };
  }

  const provider =
    normalizeSttProvider(body.provider) ?? "groq_whisper_compatible";
  const baseUrl =
    parseBaseUrl(body.base_url) ?? defaultBaseForProvider(provider);
  if (!baseUrl) {
    await auditChannelWrite(ctx, {
      action: "channels.create",
      resourceId: "new",
      requestPayload: { fields: Object.keys(body), provider },
      status: "failed",
      error: "invalid_base_url",
    });
    return { ok: false, status: 400, error: "invalid_base_url" };
  }

  const apiKeyRaw =
    typeof body.api_key === "string" ? body.api_key.trim() : "";
  // Self-hosted worker bearer is optional; cloud STT still requires a key.
  if (!apiKeyRaw && provider !== "self_hosted_whisper") {
    await auditChannelWrite(ctx, {
      action: "channels.create",
      resourceId: "new",
      requestPayload: { fields: Object.keys(body), provider },
      status: "failed",
      error: "missing_api_key",
    });
    return { ok: false, status: 400, error: "missing_api_key" };
  }

  // Never accept a consumer Tokfai key as upstream credential.
  if (apiKeyRaw.startsWith("sk-tokfai_")) {
    await auditChannelWrite(ctx, {
      action: "channels.create",
      resourceId: "new",
      requestPayload: { fields: Object.keys(body), provider },
      status: "failed",
      error: "consumer_key_not_allowed_as_upstream",
    });
    return {
      ok: false,
      status: 400,
      error: "consumer_key_not_allowed_as_upstream",
    };
  }

  const defaultModel =
    typeof body.default_model === "string" && body.default_model.trim()
      ? body.default_model.trim()
      : defaultModelForProvider(provider);

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : typeof body.provider_name === "string" && body.provider_name.trim()
        ? body.provider_name.trim().slice(0, 80)
        : provider === "self_hosted_whisper"
          ? "Self-hosted STT worker"
          : provider === "grsai_whisper_compatible"
            ? "GrsAI STT channel"
            : "STT channel";

  let priority = 10;
  if (body.priority !== undefined) {
    const n = Number(body.priority);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) {
      return { ok: false, status: 400, error: "invalid_priority" };
    }
    priority = n;
  }

  let weight = 100;
  if (body.weight !== undefined) {
    const n = Number(body.weight);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) {
      return { ok: false, status: 400, error: "invalid_weight" };
    }
    weight = n;
  }

  let timeoutMs = env.TOKFAI_STT_TIMEOUT_MS ?? 60_000;
  if (body.timeout_ms !== undefined) {
    const n = Number(body.timeout_ms);
    if (!Number.isInteger(n) || n < 1000 || n > 600_000) {
      return { ok: false, status: 400, error: "invalid_timeout_ms" };
    }
    timeoutMs = n;
  }

  const enabled =
    typeof body.enabled === "boolean"
      ? body.enabled
      : body.status === "disabled"
        ? false
        : true;

  if (apiKeyRaw && !isKeyEncryptionConfigured()) {
    return {
      ok: false,
      status: 400,
      error: "missing_key_encryption_secret",
    };
  }
  if (
    provider !== "self_hosted_whisper" &&
    !isKeyEncryptionConfigured()
  ) {
    return {
      ok: false,
      status: 400,
      error: "missing_key_encryption_secret",
    };
  }

  const now = new Date().toISOString();
  const id = `stt-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let rec: SttChannelRecord;
  try {
    rec = {
      id,
      name,
      provider,
      baseUrl,
      defaultModel,
      enabled,
      priority,
      weight,
      timeoutMs,
      secret: apiKeyRaw ? storeSecret(apiKeyRaw) : emptySecret(),
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await persistSttRecord(rec);
  } catch (err) {
    await auditChannelWrite(ctx, {
      action: "channels.create",
      resourceId: "new",
      requestPayload: { fields: Object.keys(body), provider },
      status: "failed",
      error: "persist_failed",
    });
    return {
      ok: false,
      status: 400,
      error: "persist_failed",
      detail: {
        message: err instanceof Error ? err.message : "persist_failed",
      },
    };
  }
  const channel = sttRecordToRow(rec);

  await auditChannelWrite(ctx, {
    action: "channels.create",
    resourceId: id,
    requestPayload: {
      fields: Object.keys(body).filter((k) => k !== "api_key"),
      provider,
      capability: "audio_transcription",
      base_url_masked: channel.base_url_masked,
      default_model: defaultModel,
      enabled,
      timeout_ms: timeoutMs,
      api_key_set: Boolean(apiKeyRaw),
    },
    status: "succeeded",
    channel,
  });

  log.info("admin_channel_create_ok", {
    requestId: ctx.requestId,
    route: ctx.route,
    code: "admin_channel_create_ok",
    message: "Admin STT channel created.",
    channel_id: id,
    provider,
    capability: "audio_transcription",
    adminUserId: ctx.adminUser.adminUserId ?? undefined,
  });

  return { ok: true, channel };
}

/**
 * Patch channel operational fields.
 * Primary chat/image: process-local overlay (existing).
 * STT channels: update record; empty api_key does not overwrite.
 */
export async function updateAdminChannel(
  id: string,
  body: Record<string, unknown>,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; channel: AdminChannelRow }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const channelId = id.trim();
  if (!channelId) {
    return { ok: false, status: 400, error: "missing_channel_id" };
  }

  await ensureSttCacheLoaded();
  const stt = sttChannels.get(channelId);
  if (stt) {
    return updateSttChannel(stt, body, ctx);
  }

  const base = baseChannel();
  if (channelId !== base.id) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: channelId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "channel_not_found",
    });
    return { ok: false, status: 404, error: "channel_not_found" };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_PRIMARY_PATCH.has(key)) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "unknown_field",
      });
      return {
        ok: false,
        status: 400,
        error: "unknown_field",
        detail: { field: key },
      };
    }
  }

  const patch: ChannelOverlay = {
    ...(channelOverlays.get(channelId) ?? {}),
    updated_at: new Date().toISOString(),
  };
  let changed = false;

  if (typeof body.enabled === "boolean") {
    patch.enabled = body.enabled;
    patch.status = body.enabled ? "active" : "disabled";
    changed = true;
  }

  if (body.status === "active" || body.status === "disabled") {
    patch.status = body.status;
    patch.enabled = body.status === "active";
    changed = true;
  }

  if (body.priority !== undefined) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_priority",
      });
      return { ok: false, status: 400, error: "invalid_priority" };
    }
    patch.priority = priority;
    changed = true;
  }

  if (body.weight !== undefined) {
    const weight = Number(body.weight);
    if (!Number.isInteger(weight) || weight < 0 || weight > 10_000) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_weight",
      });
      return { ok: false, status: 400, error: "invalid_weight" };
    }
    patch.weight = weight;
    changed = true;
  }

  if (body.base_url !== undefined) {
    if (body.base_url === null || body.base_url === "") {
      patch.base_url_override = null;
      changed = true;
    } else if (typeof body.base_url === "string") {
      const parsed = parseBaseUrl(body.base_url);
      if (!parsed) {
        await auditChannelWrite(ctx, {
          action: "channels.patch",
          resourceId: channelId,
          requestPayload: { fields: Object.keys(body) },
          status: "failed",
          error: "invalid_base_url",
        });
        return { ok: false, status: 400, error: "invalid_base_url" };
      }
      patch.base_url_override = parsed;
      changed = true;
    } else {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: channelId,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "invalid_base_url",
      });
      return { ok: false, status: 400, error: "invalid_base_url" };
    }
  }

  if (!changed) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: channelId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  channelOverlays.set(channelId, patch);
  const channel = applyOverlay(base, patch);

  await auditChannelWrite(ctx, {
    action: "channels.patch",
    resourceId: channelId,
    requestPayload: {
      fields: Object.keys(body),
      enabled: patch.enabled,
      status: patch.status,
      priority: patch.priority,
      weight: patch.weight,
      base_url_masked: channel.base_url_masked,
    },
    status: "succeeded",
    channel,
  });

  log.info("admin_channel_patch_ok", {
    requestId: ctx.requestId,
    route: ctx.route,
    code: "admin_channel_patch_ok",
    message: "Admin channel overlay updated.",
    adminUserId: ctx.adminUser.adminUserId ?? undefined,
  });

  return { ok: true, channel };
}

async function updateSttChannel(
  rec: SttChannelRecord,
  body: Record<string, unknown>,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; channel: AdminChannelRow }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_STT_PATCH.has(key)) {
      await auditChannelWrite(ctx, {
        action: "channels.patch",
        resourceId: rec.id,
        requestPayload: { fields: Object.keys(body) },
        status: "failed",
        error: "unknown_field",
      });
      return {
        ok: false,
        status: 400,
        error: "unknown_field",
        detail: { field: key },
      };
    }
  }

  let changed = false;
  const next: SttChannelRecord = { ...rec, secret: { ...rec.secret } };

  if (typeof body.enabled === "boolean") {
    next.enabled = body.enabled;
    changed = true;
  }
  if (body.status === "active" || body.status === "disabled") {
    next.enabled = body.status === "active";
    changed = true;
  }

  if (body.priority !== undefined) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) {
      return { ok: false, status: 400, error: "invalid_priority" };
    }
    next.priority = priority;
    changed = true;
  }

  if (body.weight !== undefined) {
    const weight = Number(body.weight);
    if (!Number.isInteger(weight) || weight < 0 || weight > 10_000) {
      return { ok: false, status: 400, error: "invalid_weight" };
    }
    next.weight = weight;
    changed = true;
  }

  if (body.base_url !== undefined) {
    const parsed = parseBaseUrl(body.base_url);
    if (!parsed) {
      return { ok: false, status: 400, error: "invalid_base_url" };
    }
    next.baseUrl = parsed;
    changed = true;
  }

  if (body.default_model !== undefined) {
    if (typeof body.default_model !== "string" || !body.default_model.trim()) {
      return { ok: false, status: 400, error: "invalid_default_model" };
    }
    next.defaultModel = body.default_model.trim();
    changed = true;
  }

  if (body.provider !== undefined) {
    const provider = normalizeSttProvider(body.provider);
    if (!provider) {
      return { ok: false, status: 400, error: "invalid_provider" };
    }
    next.provider = provider;
    changed = true;
  }

  if (body.name !== undefined || body.provider_name !== undefined) {
    const nameRaw = body.name ?? body.provider_name;
    if (typeof nameRaw !== "string" || !nameRaw.trim()) {
      return { ok: false, status: 400, error: "invalid_name" };
    }
    next.name = nameRaw.trim().slice(0, 80);
    changed = true;
  }

  if (body.timeout_ms !== undefined) {
    const n = Number(body.timeout_ms);
    if (!Number.isInteger(n) || n < 1000 || n > 600_000) {
      return { ok: false, status: 400, error: "invalid_timeout_ms" };
    }
    next.timeoutMs = n;
    changed = true;
  }

  // Empty / missing api_key on edit must NOT overwrite existing secret.
  if (body.api_key !== undefined) {
    if (typeof body.api_key === "string" && body.api_key.trim()) {
      const apiKeyRaw = body.api_key.trim();
      if (apiKeyRaw.startsWith("sk-tokfai_")) {
        return {
          ok: false,
          status: 400,
          error: "consumer_key_not_allowed_as_upstream",
        };
      }
      next.secret = storeSecret(apiKeyRaw);
      changed = true;
    }
    // else: empty string → leave secret unchanged (not an error)
  }

  if (!changed) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: rec.id,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  next.updatedAt = new Date().toISOString();
  try {
    await persistSttRecord(next);
  } catch (err) {
    await auditChannelWrite(ctx, {
      action: "channels.patch",
      resourceId: rec.id,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "persist_failed",
    });
    return {
      ok: false,
      status: 400,
      error: "persist_failed",
      detail: {
        message: err instanceof Error ? err.message : "persist_failed",
      },
    };
  }
  const channel = sttRecordToRow(next);

  await auditChannelWrite(ctx, {
    action: "channels.patch",
    resourceId: rec.id,
    requestPayload: {
      fields: Object.keys(body).filter((k) => k !== "api_key"),
      enabled: next.enabled,
      provider: next.provider,
      default_model: next.defaultModel,
      base_url_masked: channel.base_url_masked,
      api_key_set: channel.api_key_set,
      api_key_replaced: Boolean(
        typeof body.api_key === "string" && body.api_key.trim()
      ),
    },
    status: "succeeded",
    channel,
  });

  log.info("admin_channel_patch_ok", {
    requestId: ctx.requestId,
    route: ctx.route,
    code: "admin_channel_patch_ok",
    message: "Admin STT channel updated.",
    channel_id: rec.id,
    provider: next.provider,
    adminUserId: ctx.adminUser.adminUserId ?? undefined,
  });

  return { ok: true, channel };
}

/**
 * Delete an STT upstream channel from durable store.
 * Primary chat/image channel cannot be deleted.
 */
export async function deleteAdminChannel(
  id: string,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; deleted_id: string }
  | { ok: false; status: 400 | 404; error: string }
> {
  const channelId = id.trim();
  if (!channelId) {
    return { ok: false, status: 400, error: "missing_channel_id" };
  }
  if (channelId === PRIMARY_CHANNEL_ID) {
    return { ok: false, status: 400, error: "primary_channel_immutable" };
  }
  await ensureSttCacheLoaded();
  if (!sttChannels.has(channelId)) {
    await auditChannelWrite(ctx, {
      action: "channels.delete",
      resourceId: channelId,
      requestPayload: {},
      status: "failed",
      error: "channel_not_found",
    });
    return { ok: false, status: 404, error: "channel_not_found" };
  }
  await deleteDurableChannel(channelId);
  sttChannels.delete(channelId);
  await auditChannelWrite(ctx, {
    action: "channels.delete",
    resourceId: channelId,
    requestPayload: {},
    status: "succeeded",
  });
  log.info("admin_channel_delete_ok", {
    requestId: ctx.requestId,
    channel_id: channelId,
  });
  return { ok: true, deleted_id: channelId };
}

export type AdminSttChannelTestResult = {
  ok: boolean;
  channel_id: string;
  provider?: string;
  model?: string;
  /** Hostname only — never full base_url with query tokens. */
  base_host?: string | null;
  upstream_status: number | null;
  latency_ms: number | null;
  error_class: string | null;
  /** Alias of error_class for failure JSON contract. */
  code?: string | null;
  message: string;
  /** Transcript length only — never full upstream body dumps with secrets. */
  transcript_chars?: number;
  /** Short safe preview only (truncated); never audio / secrets. */
  textPreview?: string;
  /** CamelCase mirrors for Admin UI / smoke contracts. */
  upstreamStatus?: number | null;
  latencyMs?: number | null;
  baseHost?: string | null;
};

function safeBaseHost(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl ? "invalid" : null;
  }
}

/**
 * Minimal valid PCM WAV (8-bit mono 8 kHz, ~20 ms silence).
 * Used for admin STT connection probes — never requires on-disk fixtures.
 */
export function buildMinimalSilentWav(): Uint8Array {
  const sampleRate = 8000;
  const numSamples = 160; // 20 ms
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buffer);
  bytes.fill(0x80, 44); // mid-scale silence for unsigned 8-bit PCM
  return bytes;
}

function loadSilenceWavBytes(): Uint8Array {
  // Prefer in-process minimal WAV so production dist deploys never depend on
  // scripts/fixtures being present next to the API binary.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, "../../../../scripts/fixtures/p1074/stt-canary-silence.wav"),
      join(process.cwd(), "scripts/fixtures/p1074/stt-canary-silence.wav"),
      join(process.cwd(), "../scripts/fixtures/p1074/stt-canary-silence.wav"),
    ];
    for (const p of candidates) {
      try {
        return new Uint8Array(readFileSync(p));
      } catch {
        // try next / fall through to generated WAV
      }
    }
  } catch {
    // fall through
  }
  return buildMinimalSilentWav();
}

function withTestResultMirrors(
  result: AdminSttChannelTestResult
): AdminSttChannelTestResult {
  return {
    ...result,
    code: result.code ?? result.error_class,
    upstreamStatus: result.upstreamStatus ?? result.upstream_status,
    latencyMs: result.latencyMs ?? result.latency_ms,
    baseHost: result.baseHost ?? result.base_host ?? null,
  };
}

/**
 * Real HTTP STT probe against the channel upstream (silence WAV).
 * Never bills consumers. Never returns or logs upstream API keys.
 */
export async function testAdminSttChannel(
  id: string,
  ctx: AdminChannelWriteContext
): Promise<
  | { ok: true; result: AdminSttChannelTestResult }
  | { ok: false; status: 400 | 404; error: string; result?: AdminSttChannelTestResult }
> {
  await ensureSttCacheLoaded();
  const rec = sttChannels.get(id.trim());
  if (!rec) {
    return { ok: false, status: 404, error: "channel_not_found" };
  }

  const apiKey = readSecret(rec.secret) ?? "";
  const needsKey = rec.provider !== "self_hosted_whisper";
  const model =
    (rec.defaultModel || defaultModelForProvider(rec.provider)).trim();
  const baseUrl = (rec.baseUrl || "").trim();

  if (!baseUrl) {
    const result = withTestResultMirrors({
      ok: false,
      channel_id: rec.id,
      provider: rec.provider,
      model: model || undefined,
      base_host: null,
      upstream_status: null,
      latency_ms: null,
      error_class: "missing_base_url",
      code: "missing_base_url",
      message: "missing_base_url: STT channel has no base_url configured.",
    });
    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "failed",
      error: "missing_base_url",
      channel: sttRecordToRow(rec),
    });
    return { ok: false, status: 400, error: "missing_base_url", result };
  }

  if (needsKey && !apiKey) {
    const result = withTestResultMirrors({
      ok: false,
      channel_id: rec.id,
      provider: rec.provider,
      model: model || undefined,
      base_host: safeBaseHost(baseUrl),
      upstream_status: null,
      latency_ms: null,
      error_class: "missing_api_key",
      code: "missing_api_key",
      message: "missing_api_key: STT channel has no api_key configured.",
    });
    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "failed",
      error: "missing_api_key",
      channel: sttRecordToRow(rec),
    });
    return { ok: false, status: 400, error: "missing_api_key", result };
  }

  if (!model) {
    const result = withTestResultMirrors({
      ok: false,
      channel_id: rec.id,
      provider: rec.provider,
      base_host: safeBaseHost(baseUrl),
      upstream_status: null,
      latency_ms: null,
      error_class: "missing_model",
      code: "missing_model",
      message: "missing_model: STT channel has no default_model configured.",
    });
    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "failed",
      error: "missing_model",
      channel: sttRecordToRow(rec),
    });
    return { ok: false, status: 400, error: "missing_model", result };
  }

  // P1085R2 / P1104 — refuse to probe when provider/base pair is mismatched
  // (e.g. Groq provider + GRSai base, or GrsAI provider + Groq base).
  const mismatch = detectSttProviderBaseMismatch(rec.provider, baseUrl);
  if (mismatch.mismatch) {
    const result = withTestResultMirrors({
      ok: false,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      base_host: safeBaseHost(baseUrl),
      upstream_status: null,
      latency_ms: null,
      error_class: "provider_base_mismatch",
      code: "provider_base_mismatch",
      message:
        mismatch.hint ??
        "provider_base_mismatch: baseUrl does not match the selected STT provider.",
    });
    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "failed",
      error: "provider_base_mismatch",
      channel: sttRecordToRow(rec),
    });
    log.warn("admin_channel_stt_test_provider_base_mismatch", {
      requestId: ctx.requestId,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      // Host only — never log secrets or full URLs with query tokens.
      base_host: safeBaseHost(baseUrl),
    });
    return { ok: false, status: 400, error: "provider_base_mismatch", result };
  }

  // P1107 — GrsAI docs prove chat/image only; do not blind-probe STT paths
  // unless ops explicitly confirms a real STT base via env override.
  if (rec.provider === "grsai_whisper_compatible") {
    const cap = getSttProviderCapability(rec.provider, { baseUrl });
    if (!cap.sttEndpointKnown) {
      const result = withTestResultMirrors({
        ok: false,
        channel_id: rec.id,
        provider: rec.provider,
        model,
        base_host: safeBaseHost(baseUrl),
        upstream_status: null,
        latency_ms: null,
        error_class: "stt_endpoint_unknown",
        code: "stt_endpoint_unknown",
        message: GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE,
      });
      await auditChannelWrite(ctx, {
        action: "channels.test",
        resourceId: rec.id,
        requestPayload: { test: "stt_capability_gate" },
        status: "failed",
        error: "stt_endpoint_unknown",
        channel: sttRecordToRow(rec),
      });
      log.warn("admin_channel_stt_test_endpoint_unknown", {
        requestId: ctx.requestId,
        channel_id: rec.id,
        provider: rec.provider,
        model,
        base_host: safeBaseHost(baseUrl),
        stt_endpoint_known: false,
        experimental: true,
      });
      return { ok: false, status: 400, error: "stt_endpoint_unknown", result };
    }
  }

  const wavBytes = loadSilenceWavBytes();

  const adapter =
    rec.provider === "self_hosted_whisper"
      ? createSelfHostedWhisperAdapter({
          baseUrl,
          apiKey,
        })
      : createOpenaiCompatSttAdapter({
          providerId:
            rec.provider === "groq_whisper_compatible"
              ? "groq_whisper_compatible"
              : rec.provider === "grsai_whisper_compatible"
                ? "grsai_whisper_compatible"
                : "openai_compatible",
          baseUrl,
          apiKey,
        });

  const started = Date.now();
  try {
    const out = await adapter.transcribeAudio({
      requestId: ctx.requestId || `admin_stt_test_${rec.id}`,
      model,
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "stt-canary-silence.wav",
      timeoutMs: Math.min(rec.timeoutMs ?? 60_000, 60_000),
      // Silence probes routinely return empty text — connection still succeeded.
      allowEmptyTranscript: true,
    });
    const latencyMs = Date.now() - started;
    rec.lastError = null;
    rec.updatedAt = new Date().toISOString();
    await persistSttRecord(rec);

    const preview =
      typeof out.text === "string" && out.text.trim()
        ? out.text.trim().slice(0, 80)
        : undefined;

    const result = withTestResultMirrors({
      ok: true,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      base_host: safeBaseHost(baseUrl),
      upstream_status: out.upstreamStatus,
      latency_ms: latencyMs,
      error_class: null,
      code: null,
      message: "STT upstream connection succeeded.",
      transcript_chars: out.text.length,
      textPreview: preview,
    });

    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "succeeded",
      channel: sttRecordToRow(rec),
    });

    log.info("admin_channel_stt_test_ok", {
      requestId: ctx.requestId,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      base_host: safeBaseHost(baseUrl),
      upstream_status: out.upstreamStatus,
      latency_ms: latencyMs,
      transcript_chars: out.text.length,
    });

    return { ok: true, result };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const status =
      err && typeof err === "object" && "upstreamStatus" in err
        ? Number((err as { upstreamStatus?: number }).upstreamStatus) || null
        : err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status) || null
          : null;
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "upstream_error")
        : "upstream_error";
    const publicMessage =
      err && typeof err === "object" && "publicMessage" in err
        ? String((err as { publicMessage?: string }).publicMessage ?? "")
        : "STT upstream connection failed.";

    // Never include err.message if it might echo secrets — use public class only.
    rec.lastError = `${code}${status != null ? ` status=${status}` : ""}`.slice(
      0,
      200
    );
    rec.updatedAt = new Date().toISOString();
    await persistSttRecord(rec);

    const result = withTestResultMirrors({
      ok: false,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      base_host: safeBaseHost(baseUrl),
      upstream_status: status,
      latency_ms: latencyMs,
      error_class: code,
      code,
      message: publicMessage || "STT upstream connection failed.",
    });

    await auditChannelWrite(ctx, {
      action: "channels.test",
      resourceId: rec.id,
      requestPayload: { test: "stt_silence_wav" },
      status: "failed",
      error: code,
      channel: sttRecordToRow(rec),
    });

    log.warn("admin_channel_stt_test_failed", {
      requestId: ctx.requestId,
      channel_id: rec.id,
      provider: rec.provider,
      model,
      base_host: safeBaseHost(baseUrl),
      upstream_status: status,
      latency_ms: latencyMs,
      error_class: code,
      errorCode: code,
      errorMessage: (publicMessage || "STT upstream connection failed.").slice(
        0,
        200
      ),
    });

    return { ok: false, status: 400, error: "stt_test_failed", result };
  }
}

/** Test helper — clear memory cache only (durable store untouched). */
export function __resetAdminChannelOverlaysForTests(): void {
  channelOverlays.clear();
  sttChannels.clear();
  sttCacheLoaded = false;
  sttCacheLoadPromise = null;
}

/**
 * Test helper — wipe durable file store + memory (isolation between smoke runs).
 * Does not drop production DB rows unless the active backend is DURABLE_FILE.
 */
export async function __wipeAllSttChannelsForTests(): Promise<void> {
  const cls = getAdminChannelStorageClass();
  if (cls === "DURABLE_FILE") {
    __wipeDurableFileStoreForTests();
  } else if (cls === "DATABASE") {
    const rows = await loadDurableChannels();
    for (const row of rows) {
      if (row.capability === "audio_transcription") {
        await deleteDurableChannel(row.id);
      }
    }
  }
  channelOverlays.clear();
  sttChannels.clear();
  sttCacheLoaded = false;
  sttCacheLoadPromise = null;
}

/**
 * Simulate process restart: drop all in-memory channel state, then reload
 * from durable store. Must not rely on uncleared Maps.
 */
export async function __simulateProcessRestartForTests(): Promise<{
  storageClass: ReturnType<typeof getAdminChannelStorageClass>;
  storagePathOrTable: string;
  loadedCount: number;
}> {
  channelOverlays.clear();
  sttChannels.clear();
  sttCacheLoaded = false;
  sttCacheLoadPromise = null;
  await ensureSttCacheLoaded();
  return {
    storageClass: getAdminChannelStorageClass(),
    storagePathOrTable: getAdminChannelStoragePathOrTable(),
    loadedCount: sttChannels.size,
  };
}

/** Test helper — insert STT channel into durable store (no admin JWT). */
export async function __upsertSttChannelForTests(args: {
  id?: string;
  name?: string;
  provider?: AdminSttProvider;
  baseUrl: string;
  /** Optional for self_hosted_whisper; required for cloud STT providers. */
  apiKey?: string;
  defaultModel?: string;
  enabled?: boolean;
  priority?: number;
  timeoutMs?: number;
  /** P1103 — allow empty base/key to exercise missing_* admin test paths. */
  allowMissingCredentials?: boolean;
}): Promise<AdminChannelRow> {
  await ensureSttCacheLoaded();
  const now = new Date().toISOString();
  const id = args.id ?? `stt-test-${randomUUID().slice(0, 8)}`;
  const provider = args.provider ?? "groq_whisper_compatible";
  const apiKey = (args.apiKey ?? "").trim();
  if (
    !apiKey &&
    provider !== "self_hosted_whisper" &&
    !args.allowMissingCredentials
  ) {
    throw new Error("apiKey required for non-self-hosted STT test channels");
  }
  const rec: SttChannelRecord = {
    id,
    name: args.name ?? "STT test channel",
    provider,
    baseUrl: (args.baseUrl || "").replace(/\/+$/, ""),
    defaultModel:
      args.defaultModel !== undefined
        ? String(args.defaultModel).trim()
        : defaultModelForProvider(provider),
    enabled: args.enabled !== false,
    priority: args.priority ?? 10,
    weight: 100,
    timeoutMs: args.timeoutMs ?? 30_000,
    secret: apiKey ? storeSecret(apiKey) : emptySecret(),
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await persistSttRecord(rec);
  return sttRecordToRow(rec);
}

/** Test helper — clear in-memory secret only (for missing_api_key probe tests). */
export function __clearSttChannelSecretForTests(id: string): void {
  const rec = sttChannels.get(id.trim());
  if (!rec) throw new Error("channel_not_found");
  rec.secret = emptySecret();
}

/** Test helper — hard-delete from durable store + cache. */
export async function __deleteSttChannelForTests(id: string): Promise<void> {
  await deleteDurableChannel(id);
  sttChannels.delete(id);
}

/** @internal — assert a public row never contains plaintext secret. */
export function __assertChannelRowSecretSafe(
  row: AdminChannelRow,
  plaintext?: string
): boolean {
  const blob = JSON.stringify(row);
  if (plaintext && plaintext.length >= 8 && blob.includes(plaintext)) {
    return false;
  }
  if (/"api_key"\s*:/.test(blob) && !/"api_key_set"/.test(blob)) {
    return false;
  }
  return true;
}
