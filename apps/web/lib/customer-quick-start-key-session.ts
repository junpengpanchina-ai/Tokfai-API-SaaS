/** Session-only storage so Docs Quick Start can mirror API Keys one-line curl after key creation. */
const SESSION_KEY = "tokfai-quick-start-api-key";

export const QUICK_START_KEY_EVENT = "tokfai:quick-start-key";

export function setQuickStartApiKeySecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, secret);
    window.dispatchEvent(new Event(QUICK_START_KEY_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearQuickStartApiKeySecret(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
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
