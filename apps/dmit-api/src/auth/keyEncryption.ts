import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const MIN_SECRET_CHARS = 32;

export function isKeyEncryptionConfigured(): boolean {
  const secret = env.TOKFAI_KEY_ENCRYPTION_SECRET;
  return Boolean(secret && secret.length >= MIN_SECRET_CHARS);
}

function encryptionKey(): Buffer {
  if (!isKeyEncryptionConfigured()) {
    log.error("key_encryption_config_error", {
      status: 500,
      code: "key_encryption_config_error",
      message: "Key encryption is not configured.",
    });
    throw ApiError.internal(
      "TOKFAI_KEY_ENCRYPTION_SECRET is missing or too short.",
      "missing_key_encryption_secret"
    );
  }
  return createHash("sha256")
    .update(env.TOKFAI_KEY_ENCRYPTION_SECRET!)
    .digest();
}

/** Returns null when encryption is not configured — key auth still works via hash. */
export function encryptSecretIfConfigured(secret: string): string | null {
  if (!isKeyEncryptionConfigured()) return null;
  return encryptSecret(secret);
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
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

export function decryptSecret(encrypted: string): string {
  const [version, ivHex, tagHex, ciphertextHex] = encrypted.split(":");
  if (version !== VERSION || !ivHex || !tagHex || !ciphertextHex) {
    throw ApiError.internal("Invalid encrypted key format.", "key_decrypt_failed");
  }

  try {
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
  } catch {
    throw ApiError.internal("Failed to decrypt API key.", "key_decrypt_failed");
  }
}
