export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

/** Safe internal path for post-login redirect (open-redirect guard). */
export function sanitizeNextPath(
  next: string | null | undefined
): string {
  if (!next) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  const trimmed = next.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    trimmed.includes("://") ||
    trimmed.startsWith("/\\")
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return trimmed;
}

export function resolvePostLoginPath(
  next?: string | null,
  legacyRedirect?: string | null
): string {
  return sanitizeNextPath(next ?? legacyRedirect);
}

export function loginPathWithNext(next?: string | null): string {
  const path = sanitizeNextPath(next);
  return `/login?next=${encodeURIComponent(path)}`;
}

export function signupPathWithNext(next?: string | null): string {
  const path = sanitizeNextPath(next);
  return `/signup?next=${encodeURIComponent(path)}`;
}

export function loginPathWithError(
  error: string,
  next?: string | null
): string {
  const path = sanitizeNextPath(next);
  return `/login?error=${encodeURIComponent(error)}&next=${encodeURIComponent(path)}`;
}

export function isProtectedDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}
