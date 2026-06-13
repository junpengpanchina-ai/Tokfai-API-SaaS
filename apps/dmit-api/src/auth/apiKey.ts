import { randomBytes } from "node:crypto";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow } from "../types.js";
import { hashSecret, safeEqualHex } from "./hash.js";

/**
 * sk-tokfai key format:
 *   sk-tokfai_<48 lowercase hex chars>
 *
 * The full plaintext key is never stored; only HMAC-SHA256(TOKEN_PEPPER,
 * fullKey) hex lives in `api_keys.hash`. `key_id` remains an internal field
 * for DB compatibility and legacy fallback lookup.
 */

const PREFIX = "sk-tokfai_";
const LEGACY_PREFIX = "sk-tokfai-";
const LEGACY_SEPARATOR = ".";
const RANDOM_BYTES = 24; // -> 48 lowercase hex chars
const KEY_ID_HEX_CHARS = 12; // 48 bits, matching the old lookup entropy
const DISPLAY_PREFIX_CHARS = 22;

const RANDOM_HEX_PATTERN = /^[0-9a-f]{48}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApiKeyAuthRow = Omit<ApiKeyRow, "encrypted_secret">;

export interface NewApiKeyMaterial {
  /** Full secret shown to the user once. */
  fullKey: string;
  /** Public lookup id derived from the random key material. */
  keyId: string;
  /** Display prefix, e.g. "sk-tokfai_6b7f1e7a...". */
  prefix: string;
  /** HMAC hex, suitable for inserting into api_keys.hash. */
  hash: string;
}

export function generateApiKey(): NewApiKeyMaterial {
  const secret = `${PREFIX}${randomBytes(RANDOM_BYTES).toString("hex")}`;
  const keyId = secret.slice(PREFIX.length, PREFIX.length + KEY_ID_HEX_CHARS);
  const prefix = `${secret.slice(0, DISPLAY_PREFIX_CHARS)}...`;
  return {
    fullKey: secret,
    keyId,
    prefix,
    hash: hashSecret(secret),
  };
}

export function isValidApiKeyFormat(raw: string): boolean {
  if (!raw.startsWith(PREFIX)) return false;
  const randomHex = raw.slice(PREFIX.length);
  return RANDOM_HEX_PATTERN.test(randomHex);
}

export function maskTokenPrefix(rawToken: string): string {
  if (!rawToken) return "(empty)";
  if (rawToken.length <= 14) return `${rawToken.slice(0, 6)}…`;
  return `${rawToken.slice(0, 14)}…`;
}

export function maskApiKeyId(id: string): string {
  if (!id) return "(empty)";
  if (UUID_RE.test(id)) return `${id.slice(0, 8)}…`;
  if (id.length <= 8) return `${id.slice(0, 4)}…`;
  return `${id.slice(0, 6)}…`;
}

interface LegacyParsedKey {
  keyId: string;
  secret: string;
}

function parseLegacyApiKey(raw: string): LegacyParsedKey | null {
  if (!raw.startsWith(LEGACY_PREFIX)) return null;
  const rest = raw.slice(LEGACY_PREFIX.length);
  const sepIdx = rest.indexOf(LEGACY_SEPARATOR);
  if (sepIdx <= 0 || sepIdx === rest.length - 1) return null;
  const keyId = rest.slice(0, sepIdx);
  const secret = rest.slice(sepIdx + 1);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

function deriveKeyIdFromModernToken(rawToken: string): string | null {
  if (!isValidApiKeyFormat(rawToken)) return null;
  return rawToken.slice(PREFIX.length, PREFIX.length + KEY_ID_HEX_CHARS);
}

async function fetchActiveKeyByHash(
  candidate: string
): Promise<ApiKeyAuthRow | null> {
  const { data, error } = await supabase()
    .from("api_keys")
    .select<string, ApiKeyAuthRow>(
      "id, user_id, name, key_id, prefix, hash, created_at, last_used_at, revoked_at"
    )
    .eq("hash", candidate)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Key lookup failed: ${error.message}`,
      "key_lookup_failed"
    );
  }
  return data;
}

async function fetchActiveKeyByKeyId(
  keyId: string
): Promise<ApiKeyAuthRow | null> {
  const { data, error } = await supabase()
    .from("api_keys")
    .select<string, ApiKeyAuthRow>(
      "id, user_id, name, key_id, prefix, hash, created_at, last_used_at, revoked_at"
    )
    .eq("key_id", keyId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Key lookup failed: ${error.message}`,
      "key_lookup_failed"
    );
  }
  return data;
}

function logInvalidToken(rawToken: string, lookup: "hash" | "key_id" | "legacy") {
  log.warn("invalid_token", {
    code: "invalid_token",
    tokenPrefix: maskTokenPrefix(rawToken),
    message: `API key ${lookup} lookup miss.`,
  });
}

function touchLastUsedAt(rowId: string): void {
  void supabase()
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", rowId)
    .then(() => {
      /* swallow */
    });
}

function toVerifiedApiKey(data: ApiKeyAuthRow): VerifiedApiKey {
  return {
    apiKeyId: data.id,
    userId: data.user_id,
    name: data.name,
    keyId: data.key_id,
    prefix: data.prefix,
  };
}

export interface VerifiedApiKey {
  apiKeyId: string;
  userId: string;
  name: string;
  keyId: string;
  prefix: string;
}

async function verifyModernApiKey(rawToken: string): Promise<VerifiedApiKey> {
  const candidate = hashSecret(rawToken);
  let data = await fetchActiveKeyByHash(candidate);

  if (!data) {
    const keyId = deriveKeyIdFromModernToken(rawToken);
    if (keyId) {
      const byKeyId = await fetchActiveKeyByKeyId(keyId);
      if (byKeyId && safeEqualHex(candidate, byKeyId.hash)) {
        data = byKeyId;
      }
    }
  }

  if (!data) {
    logInvalidToken(rawToken, "hash");
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }

  if (!safeEqualHex(candidate, data.hash)) {
    logInvalidToken(rawToken, "hash");
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }

  if (data.revoked_at) {
    throw ApiError.unauthorized("API key has been revoked.", "key_revoked");
  }

  touchLastUsedAt(data.id);
  return toVerifiedApiKey(data);
}

async function verifyLegacyApiKey(rawToken: string): Promise<VerifiedApiKey> {
  const parsed = parseLegacyApiKey(rawToken);
  if (!parsed) {
    throw ApiError.unauthorized(
      "Invalid API key format. Use sk-tokfai_<48 hex>; legacy sk-tokfai-xxx.xxx keys are deprecated and must be regenerated.",
      "invalid_token"
    );
  }

  const data = await fetchActiveKeyByKeyId(parsed.keyId);
  const candidate = hashSecret(parsed.secret);

  if (!data || !safeEqualHex(candidate, data.hash)) {
    logInvalidToken(rawToken, "legacy");
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }

  if (data.revoked_at) {
    throw ApiError.unauthorized("API key has been revoked.", "key_revoked");
  }

  touchLastUsedAt(data.id);
  return toVerifiedApiKey(data);
}

/**
 * Look up the api_keys row by HMAC hash of the full bearer token (with
 * key_id / legacy fallbacks), and mark `last_used_at` (fire-and-forget).
 */
export async function verifyApiKeyToken(
  rawToken: string
): Promise<VerifiedApiKey> {
  if (isValidApiKeyFormat(rawToken)) {
    return verifyModernApiKey(rawToken);
  }

  if (rawToken.startsWith(LEGACY_PREFIX)) {
    return verifyLegacyApiKey(rawToken);
  }

  throw ApiError.unauthorized(
    "Invalid API key format. Use sk-tokfai_<48 hex>; legacy sk-tokfai-xxx.xxx keys are deprecated and must be regenerated.",
    "invalid_token"
  );
}
