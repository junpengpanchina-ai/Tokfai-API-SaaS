import { jwtVerify } from "jose";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import type { AuthedUser } from "../types.js";

const SECRET = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

/**
 * Supabase signs user JWTs with HS256 + the project JWT secret. We verify
 * offline (no network call) so /v1/keys and /v1/billing/checkout stay fast.
 *
 * Standard Supabase JWT payload looks like:
 *   {
 *     "iss": "https://<project>.supabase.co/auth/v1",
 *     "sub": "<auth.users.id>",
 *     "email": "...",
 *     "role": "authenticated",
 *     "aal": "aal1",
 *     "exp": 1700000000,
 *     ...
 *   }
 */
export async function verifySupabaseJwt(token: string): Promise<AuthedUser> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: ["HS256"],
    });

    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) {
      throw ApiError.unauthorized("Invalid token (no subject).", "invalid_token");
    }
    if (payload.role && payload.role !== "authenticated") {
      throw ApiError.forbidden("Token role is not 'authenticated'.", "wrong_role");
    }

    const email =
      typeof payload.email === "string" && payload.email.length > 0
        ? payload.email
        : null;

    return { id: sub, email };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error) {
      const msg = err.message;
      if (msg.includes("expired")) {
        throw ApiError.unauthorized("Token expired.", "expired_token");
      }
    }
    throw ApiError.unauthorized("Invalid token.", "invalid_token");
  }
}

/** Pulls `Bearer <token>` out of an Authorization header. */
export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
