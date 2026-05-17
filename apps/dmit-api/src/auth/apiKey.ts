import { randomBytes } from "node:crypto";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow } from "../types.js";
import { hashSecret, safeEqualHex } from "./hash.js";

/**
 * sk-tokfai key format:
 *   sk-tokfai_<48 lowercase hex chars>
 *
 * The full plaintext key is never stored; only HMAC-SHA256(TOKEN_PEPPER,
 * fullKey) hex lives in `api_keys.hash`. `key_id` remains an internal field
 * for DB compatibility and is not used for authentication.
 */

const PREFIX = "sk-tokfai_";
const RANDOM_BYTES = 24; // -> 48 lowercase hex chars
const KEY_ID_HEX_CHARS = 12; // 48 bits, matching the old lookup entropy
const DISPLAY_PREFIX_CHARS = 22;

const RANDOM_HEX_PATTERN = /^[0-9a-f]{48}$/;

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

export interface VerifiedApiKey {
  apiKeyId: string;
  userId: string;
  name: string;
  keyId: string;
  prefix: string;
}

/**
 * Look up the api_keys row by HMAC hash of the full bearer token,
 * and mark `last_used_at` (fire-and-forget — we never block the call on
 * the update).
 *
 * Throws ApiError 401 on auth failures. Revoked keys get a distinct stable
 * code so dashboard and API clients can explain why the token stopped working.
 */
export async function verifyApiKeyToken(
  rawToken: string
): Promise<VerifiedApiKey> {
  if (!isValidApiKeyFormat(rawToken)) {
    throw ApiError.unauthorized(
      "Invalid API key format. Use sk-tokfai_<48 hex>; legacy sk-tokfai-xxx.xxx keys are deprecated and must be regenerated.",
      "invalid_token"
    );
  }

  const candidate = hashSecret(rawToken);
  const sb = supabase();
  const { data, error } = await sb
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
  if (!data) {
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }

  if (!safeEqualHex(candidate, data.hash)) {
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }

  if (data.revoked_at) {
    throw ApiError.unauthorized("API key has been revoked.", "key_revoked");
  }

  // Touch last_used_at without blocking the request.
  void sb
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {
      /* swallow — logged at the route level if needed */
    });

  return {
    apiKeyId: data.id,
    userId: data.user_id,
    name: data.name,
    keyId: data.key_id,
    prefix: data.prefix,
  };
}
