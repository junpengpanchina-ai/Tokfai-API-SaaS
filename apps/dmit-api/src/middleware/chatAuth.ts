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
 * Accepts either a customer sk-tokfai_ API key or a Supabase access JWT.
 * API keys set `apiKey` on context; JWTs set `user` and `userId`.
 * Tenant is taken from the key when present, else from X-Tokfai-Host / Host.
 */
export const requireApiKeyOrSupabaseJwt: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    throw ApiError.unauthorized("Missing Bearer token.", "missing_token");
  }

  if (isValidApiKeyFormat(token)) {
    const apiKey = await verifyApiKeyToken(token);
    c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
    c.set("tenantId" as never, apiKey.tenantId);
    await next();
    return;
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

  await next();
};

export interface ChatCaller {
  userId: string;
  apiKeyId: string | null;
  tenantId: string | null;
}

export function getChatCaller(c: {
  get: (key: never) => unknown;
}): ChatCaller {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey | undefined;
  const tenantId =
    (c.get("tenantId" as never) as string | null | undefined) ?? null;

  if (apiKey) {
    return {
      userId: apiKey.userId,
      apiKeyId: apiKey.apiKeyId,
      tenantId: apiKey.tenantId ?? tenantId,
    };
  }

  const user = c.get("user" as never) as AuthedUser | undefined;
  if (user?.id) {
    return { userId: user.id, apiKeyId: null, tenantId };
  }

  throw ApiError.unauthorized("Missing Bearer token.", "missing_token");
}
