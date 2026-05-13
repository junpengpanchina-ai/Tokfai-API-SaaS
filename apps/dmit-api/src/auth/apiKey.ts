import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow } from "../types.js";
import { hashSecret, randomBase64Url, safeEqualHex } from "./hash.js";

/**
 * sk-tokfai key format:
 *   sk-tokfai-{key_id}.{secret}
 *
 * - `key_id` is 8 chars (6 random bytes, base64url). Stored in plaintext;
 *   indexed for O(1) lookup.
 * - `secret` is 32 chars (24 random bytes, base64url). Never stored — only
 *   HMAC-SHA256(TOKEN_PEPPER, secret) hex lives in `api_keys.hash`.
 *
 * Separator is `.` so we can split unambiguously (base64url uses `_` and
 * `-` internally, never `.`).
 */

const PREFIX = "sk-tokfai-";
const SEPARATOR = ".";
const KEY_ID_BYTES = 6; // -> 8 chars base64url
const SECRET_BYTES = 24; // -> 32 chars base64url

export interface NewApiKeyMaterial {
  /** Full secret shown to the user once. */
  fullKey: string;
  /** Public lookup id, e.g. "Abc123Xy". */
  keyId: string;
  /** Display prefix, e.g. "sk-tokfai-Abc123Xy". */
  prefix: string;
  /** HMAC hex, suitable for inserting into api_keys.hash. */
  hash: string;
}

export function generateApiKey(): NewApiKeyMaterial {
  const keyId = randomBase64Url(KEY_ID_BYTES);
  const secret = randomBase64Url(SECRET_BYTES);
  const prefix = `${PREFIX}${keyId}`;
  return {
    fullKey: `${prefix}${SEPARATOR}${secret}`,
    keyId,
    prefix,
    hash: hashSecret(secret),
  };
}

interface ParsedKey {
  keyId: string;
  secret: string;
}

export function parseApiKey(raw: string): ParsedKey | null {
  if (!raw.startsWith(PREFIX)) return null;
  const rest = raw.slice(PREFIX.length);
  const sepIdx = rest.indexOf(SEPARATOR);
  if (sepIdx <= 0 || sepIdx === rest.length - 1) return null;
  const keyId = rest.slice(0, sepIdx);
  const secret = rest.slice(sepIdx + 1);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

export interface VerifiedApiKey {
  apiKeyId: string;
  userId: string;
  name: string;
  keyId: string;
}

/**
 * Look up the api_keys row by key_id, verify the secret in constant time,
 * and mark `last_used_at` (fire-and-forget — we never block the call on
 * the update).
 *
 * Throws ApiError 401 on any failure (no leak of whether key_id existed).
 */
export async function verifyApiKeyToken(
  rawToken: string
): Promise<VerifiedApiKey> {
  const parsed = parseApiKey(rawToken);
  if (!parsed) {
    throw ApiError.unauthorized("Invalid API key format.", "invalid_api_key");
  }

  const sb = supabase();
  const { data, error } = await sb
    .from("api_keys")
    .select<string, ApiKeyRow>(
      "id, user_id, name, key_id, prefix, hash, created_at, last_used_at, revoked_at"
    )
    .eq("key_id", parsed.keyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Key lookup failed: ${error.message}`,
      "key_lookup_failed"
    );
  }
  if (!data) {
    throw ApiError.unauthorized("API key not recognised.", "invalid_api_key");
  }

  const candidate = hashSecret(parsed.secret);
  if (!safeEqualHex(candidate, data.hash)) {
    throw ApiError.unauthorized("API key not recognised.", "invalid_api_key");
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
  };
}
