/** Session-only storage so Docs Quick Start can mirror API Keys one-line curl after key creation. */
const SESSION_KEY = "tokfai-quick-start-api-key";
const SESSION_KEY_ID = "tokfai-quick-start-api-key-id";

export const QUICK_START_KEY_EVENT = "tokfai:quick-start-key";

export function setQuickStartApiKeySecret(secret: string, keyId?: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, secret);
    if (keyId) {
      sessionStorage.setItem(SESSION_KEY_ID, keyId);
    } else {
      sessionStorage.removeItem(SESSION_KEY_ID);
    }
    window.dispatchEvent(new Event(QUICK_START_KEY_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearQuickStartApiKeySecret(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY_ID);
    window.dispatchEvent(new Event(QUICK_START_KEY_EVENT));
  } catch {
    /* ignore */
  }
}

export function readQuickStartApiKeySecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function readQuickStartApiKeyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_KEY_ID);
  } catch {
    return null;
  }
}

export function clearQuickStartApiKeyIfMatches(keyId: string): void {
  if (typeof window === "undefined") return;
  if (readQuickStartApiKeyId() === keyId) {
    clearQuickStartApiKeySecret();
  }
}
