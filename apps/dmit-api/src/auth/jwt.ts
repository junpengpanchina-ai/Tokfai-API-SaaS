import { jwtVerify } from "jose";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import type { AuthedUser } from "../types.js";

/**
 * Supabase signs user JWTs with HS256 + the project JWT secret (raw string).
 *
 * Verify with the secret as UTF-8 bytes via TextEncoder. Do not base64-decode
 * SUPABASE_JWT_SECRET and do not import it as a JWK.
 *
 * Standard Supabase JWT payload looks like:
 *   {
 *     "iss": "https://<project>.supabase.co/auth/v1",
 *     "sub": "<auth.users.id>",
 *     "email": "...",
 *     "role": "authenticated",
 *     ...
 *   }
 */
export async function verifySupabaseJwt(token: string): Promise<AuthedUser> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
      { algorithms: ["HS256"] }
    );

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
      if (err.message.includes("expired") || err.name === "JWTExpired") {
        throw ApiError.unauthorized("Token expired.", "expired_token");
      }

      log.error("jwt_invalid_token", {
        errorName: err.name,
        errorMessage: err.message,
      });
    } else {
      log.error("jwt_invalid_token", {
        errorName: "unknown",
        errorMessage: String(err),
      });
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
