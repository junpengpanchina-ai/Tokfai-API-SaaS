export const AUTH_SUCCESS_STORAGE_KEY = "tokfai-auth-success";
export const AUTH_SUCCESS_COOKIE = "tokfai_auth_success";

export type AuthSuccessKind = "login" | "signup";

export function markAuthSuccess(kind: AuthSuccessKind) {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(AUTH_SUCCESS_STORAGE_KEY, kind);
}

export function consumeAuthSuccess(): AuthSuccessKind | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fromStorage = sessionStorage.getItem(AUTH_SUCCESS_STORAGE_KEY);
  if (fromStorage === "login" || fromStorage === "signup") {
    sessionStorage.removeItem(AUTH_SUCCESS_STORAGE_KEY);
    return fromStorage;
  }

  const match = document.cookie.match(
    `(?:^|;\\s*)${AUTH_SUCCESS_COOKIE}=(login|signup)(?:;|$)`
  );
  if (match) {
    document.cookie = `${AUTH_SUCCESS_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    return match[1] as AuthSuccessKind;
  }

  return null;
}

export function assignAfterAuth(path: string, kind: AuthSuccessKind) {
  markAuthSuccess(kind);
  window.location.assign(path);
}
