import { randomBytes } from "node:crypto";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow } from "../types.js";
import { hashSecret, safeEqualHex } from "./hash.js";

/**
 * sk-tokfai key format:
 *   sk-tokfai_<48 lowercase hex chars>
 *
 * `key_id` is derived from the first 12 random hex chars and remains indexed
 * for O(1) lookup. The full plaintext key is never stored; only
 * HMAC-SHA256(TOKEN_PEPPER, fullKey) hex lives in `api_keys.hash`.
 */

const PREFIX = "sk-tokfai_";
const RANDOM_BYTES = 24; // -> 48 lowercase hex chars
const KEY_ID_HEX_CHARS = 12; // 48 bits, matching the old lookup entropy
const DISPLAY_PREFIX_CHARS = 18;

const RANDOM_HEX_PATTERN = /^[0-9a-f]{48}$/;

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

interface ParsedKey {
  keyId: string;
  secret: string;
}

export function parseApiKey(raw: string): ParsedKey | null {
  if (!raw.startsWith(PREFIX)) return null;
  const randomHex = raw.slice(PREFIX.length);
  if (!RANDOM_HEX_PATTERN.test(randomHex)) return null;
  return {
    keyId: randomHex.slice(0, KEY_ID_HEX_CHARS),
    secret: raw,
  };
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
