/**
 * Canonical site origin for OAuth redirectTo only.
 * Callback redirects must use request.nextUrl.origin so Set-Cookie domain
 * matches the host that received the OAuth code (avoids www / non-www split).
 */
export function getOAuthRedirectOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

/** @deprecated Use getOAuthRedirectOrigin in client code. */
export function getBrowserSiteOrigin(): string {
  return getOAuthRedirectOrigin();
}
