/** Session-only API key mirror — no customer modules. */

const SESSION_KEY = "tokfai-quick-start-api-key";
const SESSION_KEY_ID = "tokfai-quick-start-api-key-id";

export const DASHBOARD_API_KEY_EVENT = "tokfai:quick-start-key";

export function setDashboardApiKeySecret(secret: string, keyId?: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, secret);
    if (keyId) {
      sessionStorage.setItem(SESSION_KEY_ID, keyId);
    } else {
      sessionStorage.removeItem(SESSION_KEY_ID);
    }
    window.dispatchEvent(new Event(DASHBOARD_API_KEY_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearDashboardApiKeySecret(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY_ID);
    window.dispatchEvent(new Event(DASHBOARD_API_KEY_EVENT));
  } catch {
    /* ignore */
  }
}

export function readDashboardApiKeySecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function readDashboardApiKeyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_KEY_ID);
  } catch {
    return null;
  }
}

export function clearDashboardApiKeyIfMatches(keyId: string): void {
  if (typeof window === "undefined") return;
  if (readDashboardApiKeyId() === keyId) {
    clearDashboardApiKeySecret();
  }
}
