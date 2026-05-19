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
 * Accepts either a customer sk-tokfai_ API key or a Supabase access JWT.
 * API keys set `apiKey` on context; JWTs set `user` and `userId`.
 */
export const requireApiKeyOrSupabaseJwt: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    throw ApiError.unauthorized("Missing Bearer token.", "missing_token");
  }

  if (isValidApiKeyFormat(token)) {
    const apiKey = await verifyApiKeyToken(token);
    c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
    await next();
    return;
  }

  const user = await verifySupabaseJwt(token);
  c.set("user" as never, user satisfies AuthedUser);
  c.set("userId" as never, user.id);
  await next();
};

export interface ChatCaller {
  userId: string;
  apiKeyId: string | null;
}

export function getChatCaller(c: {
  get: (key: never) => unknown;
}): ChatCaller {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey | undefined;
  if (apiKey) {
    return { userId: apiKey.userId, apiKeyId: apiKey.apiKeyId };
  }

  const user = c.get("user" as never) as AuthedUser | undefined;
  if (user?.id) {
    return { userId: user.id, apiKeyId: null };
  }

  throw ApiError.unauthorized("Missing Bearer token.", "missing_token");
}
