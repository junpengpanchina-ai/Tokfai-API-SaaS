import type { NextRequest } from "next/server";

/**
 * Canonical site origin for OAuth redirects. Prefer NEXT_PUBLIC_SITE_URL so
 * www.tokfai.com vs tokfai.com does not split sessions.
 */
export function getServerSiteOrigin(request: NextRequest | Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  return new URL(request.url).origin;
}

/** Browser OAuth redirect origin (client components). */
export function getBrowserSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  return window.location.origin;
}
