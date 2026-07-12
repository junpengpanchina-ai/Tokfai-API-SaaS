/**
 * Resolve the consumer's default API key for Playground without exposing key UI.
 * Still uses the user's own sk-tokfai_… key so billing / usage stay unchanged.
 */

import {
  createApiKey,
  revealMeApiKey,
  type MeApiKeyMetadata,
} from "./api-keys-client";
import { setDashboardApiKeySecret } from "./api-key-session";
import { isFullTokfaiApiKey } from "./constants";

export const DEFAULT_PLAYGROUND_KEY_NAME = "Default Playground Key";

export type PlaygroundKeyOption = {
  id: string;
  name: string;
  prefix: string;
  can_reveal: boolean;
};

export type EnsurePlaygroundKeyResult = {
  secret: string;
  keyId: string;
  key: PlaygroundKeyOption;
  created: boolean;
};

export class PlaygroundKeyError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlaygroundKeyError";
    this.code = code;
  }
}

function toOption(meta: MeApiKeyMetadata | PlaygroundKeyOption): PlaygroundKeyOption {
  return {
    id: meta.id,
    name: meta.name,
    prefix: meta.prefix,
    can_reveal: meta.can_reveal,
  };
}

function datedKeyName(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${DEFAULT_PLAYGROUND_KEY_NAME} ${stamp}`;
}

async function revealWithTimeout(
  keyId: string,
  accessToken: string,
  timeoutMs = 30_000
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      revealMeApiKey(keyId, { accessToken }),
      new Promise<string>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new PlaygroundKeyError("API key reveal timed out.", "key_reveal_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Pick the first active key, reveal (or use session secret), or create a default key.
 */
export async function ensurePlaygroundApiKey(options: {
  accessToken: string;
  activeKeys: PlaygroundKeyOption[];
  sessionSecrets?: Record<string, string>;
  preferredKeyId?: string | null;
}): Promise<EnsurePlaygroundKeyResult> {
  const { accessToken, activeKeys, sessionSecrets = {}, preferredKeyId } = options;

  if (!accessToken) {
    throw new PlaygroundKeyError("Missing access token.", "missing_access_token");
  }

  const ordered = [...activeKeys];
  if (preferredKeyId) {
    const preferred = ordered.find((k) => k.id === preferredKeyId);
    if (preferred) {
      ordered.splice(ordered.indexOf(preferred), 1);
      ordered.unshift(preferred);
    }
  }

  for (const key of ordered) {
    const cached = sessionSecrets[key.id];
    if (cached && isFullTokfaiApiKey(cached)) {
      return { secret: cached, keyId: key.id, key, created: false };
    }

    if (key.can_reveal === false) {
      continue;
    }

    try {
      const secret = await revealWithTimeout(key.id, accessToken);
      if (isFullTokfaiApiKey(secret)) {
        setDashboardApiKeySecret(secret, key.id);
        return { secret, keyId: key.id, key, created: false };
      }
    } catch {
      continue;
    }
  }

  // No usable key — create a default playground key.
  let created;
  try {
    created = await createApiKey(
      { name: DEFAULT_PLAYGROUND_KEY_NAME },
      { accessToken }
    );
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    if (status === 409) {
      created = await createApiKey({ name: datedKeyName() }, { accessToken });
    } else {
      throw err;
    }
  }

  const key = toOption(created.api_key);
  setDashboardApiKeySecret(created.secret, created.api_key.id);
  return {
    secret: created.secret,
    keyId: key.id,
    key,
    created: true,
  };
}
