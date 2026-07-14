import { cors } from "hono/cors";

import { env } from "../env.js";

const BASELINE_ORIGINS = [
  "https://tokfai.com",
  "https://www.tokfai.com",
  "http://localhost:3000",
];

/**
 * Canonical CORS request headers. Browsers match these case-insensitively, so
 * `Idempotency-Key` covers `idempotency-key` on preflight and actual requests.
 */
export const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "X-Request-Id",
  "X-Tokfai-Host",
  "Stripe-Signature",
] as const;

function allowedOrigins(): Set<string> {
  const fromEnv = Array.isArray(env.CORS_ALLOWED_ORIGINS)
    ? env.CORS_ALLOWED_ORIGINS
        .map((origin: string) => origin.trim())
        .filter(Boolean)
    : [];

  return new Set([...BASELINE_ORIGINS, ...fromEnv]);
}

function isTokfaiSubdomainOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return host === "tokfai.com" || host.endsWith(".tokfai.com");
  } catch {
    return false;
  }
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;

    const allowed = allowedOrigins();
    if (allowed.has(origin)) return origin;
    // Allow tokfai.com subdomains for tenant sites (custom domains via env).
    if (isTokfaiSubdomainOrigin(origin)) return origin;
    return null;
  },
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: [...CORS_ALLOW_HEADERS],
  exposeHeaders: ["X-Request-Id"],
  credentials: false,
  maxAge: 86400,
});
