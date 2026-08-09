import type { MiddlewareHandler } from "hono";

import {
  isValidApiKeyFormat,
  verifyApiKeyToken,
  type VerifiedApiKey,
} from "../auth/apiKey.js";
import { ApiError } from "../errors.js";
import { extractBearer, verifySupabaseJwt } from "../auth/jwt.js";
import { resolveTenantByHost } from "../tenants/resolve.js";
import type { AuthedUser } from "../types.js";

/**
 * P1067 — Azure OpenAI / Cursor auth compatibility at ingress only.
 *
 * Accepts:
 *   1. Authorization: Bearer <sk-tokfai_… | Supabase JWT>  (preferred)
 *   2. api-key: <sk-tokfai_…>
 *
 * When both are present, Authorization Bearer wins (no fuzzy merge).
 * Does not reimplement key DB validation — reuses verifyApiKeyToken.
 * Does not affect the original /v1/chat/completions Bearer middleware.
 */
export function extractAzureCredential(c: {
  req: {
    header: (name: string) => string | undefined;
  };
}): { token: string; source: "authorization_bearer" | "api_key" } | null {
  const bearer = extractBearer(c.req.header("authorization"));
  const apiKeyHeader = c.req.header("api-key")?.trim();

  if (bearer) {
    return { token: bearer, source: "authorization_bearer" };
  }
  if (apiKeyHeader) {
    return { token: apiKeyHeader, source: "api_key" };
  }
  return null;
}

export const requireAzureOpenAiAuth: MiddlewareHandler = async (c, next) => {
  const cred = extractAzureCredential(c);
  if (!cred) {
    throw ApiError.unauthorized(
      "Missing API key. Provide Authorization: Bearer or api-key.",
      "missing_token"
    );
  }

  const { token } = cred;

  if (isValidApiKeyFormat(token)) {
    const apiKey = await verifyApiKeyToken(token);
    c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
    c.set("tenantId" as never, apiKey.tenantId);
    // P1070 — propagate handler Response (status/headers/body) up the chain.
    return await next();
  }

  // Bearer may still be a Supabase JWT (playground). api-key must be sk-tokfai_.
  if (cred.source === "api_key") {
    throw ApiError.unauthorized(
      "Invalid API key format. Use sk-tokfai_<48 hex>.",
      "invalid_token"
    );
  }

  const user = await verifySupabaseJwt(token);
  c.set("user" as never, user satisfies AuthedUser);
  c.set("userId" as never, user.id);

  const host =
    c.req.header("x-tokfai-host")?.trim() ||
    c.req.header("x-forwarded-host")?.trim() ||
    c.req.header("host")?.trim() ||
    null;
  const { tenant } = await resolveTenantByHost(host);
  c.set("tenantId" as never, tenant?.id ?? null);

  // P1070 — propagate handler Response (status/headers/body) up the chain.
  return await next();
};
