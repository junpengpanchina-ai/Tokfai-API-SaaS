import {
  isFullTokfaiApiKey,
  TOKFAI_API_KEY_PLACEHOLDER,
} from "./constants";

import { readDashboardApiKeySecret } from "./api-key-session";

export function resolveApiKeyPlaceholderSafe(explicit?: string | null): string {
  if (explicit && isFullTokfaiApiKey(explicit)) return explicit;
  const fromSession = readDashboardApiKeySecret();
  if (fromSession && isFullTokfaiApiKey(fromSession)) return fromSession;
  return TOKFAI_API_KEY_PLACEHOLDER;
}

export function isApiKeyPlaceholderSafe(key: string): boolean {
  return key === TOKFAI_API_KEY_PLACEHOLDER;
}
