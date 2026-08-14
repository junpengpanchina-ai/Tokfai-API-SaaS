/**
 * P1095 — AES-256-GCM for Responses tool-state durable blobs.
 *
 * Uses RESPONSES_STATE_ENCRYPTION_KEY only (not API-key encryption secret).
 * Missing/short key → durable disabled; callers must fall back to memory.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const MIN_SECRET_CHARS = 32;

export function getResponsesStateEncryptionKeyRaw(): string | null {
  const fromEnv = process.env.RESPONSES_STATE_ENCRYPTION_KEY?.trim();
  if (fromEnv && fromEnv.length >= MIN_SECRET_CHARS) return fromEnv;
  return null;
}

export function isResponsesStateEncryptionConfigured(): boolean {
  return getResponsesStateEncryptionKeyRaw() != null;
}

function encryptionKey(): Buffer {
  const raw = getResponsesStateEncryptionKeyRaw();
  if (!raw) {
    throw new Error("responses_state_encryption_not_configured");
  }
  return createHash("sha256").update(raw).digest();
}

/** Envelope: v1:ivHex:tagHex:ciphertextHex */
export function encryptResponsesToolStatePayload(plaintextUtf8: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextUtf8, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("hex"),
    tag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

export function decryptResponsesToolStatePayload(envelope: string): string {
  const [version, ivHex, tagHex, ciphertextHex] = envelope.split(":");
  if (version !== VERSION || !ivHex || !tagHex || !ciphertextHex) {
    throw new Error("responses_state_decrypt_invalid_format");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
