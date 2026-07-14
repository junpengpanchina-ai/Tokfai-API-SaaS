import type { MiddlewareHandler } from "hono";

import {
  isValidApiKeyFormat,
  verifyApiKeyToken,
  type VerifiedApiKey,
} from "../auth/apiKey.js";
import { ApiError } from "../errors.js";
import { extractBearer, verifySupabaseJwt } from "../auth/jwt.js";
import type { AuthedUser } from "../types.js";

/**
 * Extract Tokfai credentials the way Google Gemini / Cherry Studio clients send them:
 *   1. x-goog-api-key header
 *   2. ?key= query param
 *   3. Authorization: Bearer …
 */
export function extractGeminiCredential(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (key: string) => string | undefined;
  };
}): string | null {
  const googKey = c.req.header("x-goog-api-key")?.trim();
  if (googKey) return googKey;

  const queryKey = c.req.query("key")?.trim();
  if (queryKey) return queryKey;

  return extractBearer(c.req.header("authorization"));
}

async function setApiKeyCaller(
  c: Parameters<MiddlewareHandler>[0],
  token: string
): Promise<void> {
  if (!isValidApiKeyFormat(token)) {
    throw ApiError.unauthorized("API key not recognised.", "invalid_token");
  }
  const apiKey = await verifyApiKeyToken(token);
  c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
  c.set("tenantId" as never, apiKey.tenantId);
}

/**
 * Gemini-compatible auth for /v1beta generateContent routes.
 * Google-style headers/query accept sk-tokfai_ keys only; Bearer also
 * allows Supabase JWTs (same dual-auth as chat/responses).
 */
export const requireGeminiAuth: MiddlewareHandler = async (c, next) => {
  const googKey = c.req.header("x-goog-api-key")?.trim();
  if (googKey) {
    await setApiKeyCaller(c, googKey);
    await next();
    return;
  }

  const queryKey = c.req.query("key")?.trim();
  if (queryKey) {
    await setApiKeyCaller(c, queryKey);
    await next();
    return;
  }

  const bearer = extractBearer(c.req.header("authorization"));
  if (!bearer) {
    throw ApiError.unauthorized("Missing API key.", "missing_token");
  }

  if (isValidApiKeyFormat(bearer)) {
    const apiKey = await verifyApiKeyToken(bearer);
    c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
    c.set("tenantId" as never, apiKey.tenantId);
    await next();
    return;
  }

  const user = await verifySupabaseJwt(bearer);
  c.set("user" as never, user satisfies AuthedUser);
  c.set("userId" as never, user.id);

  const { resolveTenantByHost } = await import("../tenants/resolve.js");
  const host =
    c.req.header("x-tokfai-host")?.trim() ||
    c.req.header("x-forwarded-host")?.trim() ||
    c.req.header("host")?.trim() ||
    null;
  const { tenant } = await resolveTenantByHost(host);
  c.set("tenantId" as never, tenant?.id ?? null);

  await next();
};
