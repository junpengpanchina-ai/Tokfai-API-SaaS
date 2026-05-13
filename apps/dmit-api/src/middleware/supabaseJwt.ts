import type { MiddlewareHandler } from "hono";

import { ApiError } from "../errors.js";
import { extractBearer, verifySupabaseJwt } from "../auth/jwt.js";
import type { AuthedUser } from "../types.js";

/**
 * Requires a Supabase Bearer JWT. Resolves the user and stashes it on the
 * context for downstream handlers as `c.get('user')`.
 *
 * Use this for dashboard-driven endpoints: /v1/keys, /v1/billing/checkout.
 */
export const requireSupabaseJwt: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    throw ApiError.unauthorized("Missing Bearer token.", "missing_token");
  }
  const user = await verifySupabaseJwt(token);
  c.set("user" as never, user satisfies AuthedUser);
  await next();
};
