import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "../env.js";

/**
 * HMAC-SHA256(TOKEN_PEPPER, secret) -> lowercase hex.
 *
 * Used to hash the secret half of sk-tokfai-{key_id}.{secret} before storing
 * it in `api_keys.hash`. The raw secret is never persisted.
 */
export function hashSecret(secret: string): string {
  return createHmac("sha256", env.TOKEN_PEPPER).update(secret).digest("hex");
}

/**
 * Constant-time comparison of two hex strings of the same length.
 * Returns false (without throwing) for length mismatch.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Random URL-safe base64 string of the given byte length. */
export function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}
