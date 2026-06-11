export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

/** Safe internal path for post-login redirect (open-redirect guard). */
export function sanitizeNextPath(
  next: string | null | undefined
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return next;
}

export function resolvePostLoginPath(
  next?: string | null,
  legacyRedirect?: string | null
): string {
  return sanitizeNextPath(next ?? legacyRedirect);
}

export function loginPathWithNext(next: string): string {
  return `/login?next=${encodeURIComponent(sanitizeNextPath(next))}`;
}

export function isProtectedDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}
