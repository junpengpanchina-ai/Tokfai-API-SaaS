import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { AuthedUser } from "../types.js";

/**
 * Verifies a browser Supabase access_token with Supabase Auth itself.
 *
 * Supabase projects that have migrated from the legacy JWT secret to JWT
 * Signing Keys may issue user tokens that cannot be verified locally with
 * SUPABASE_JWT_SECRET + HS256. The service-role client asks Supabase Auth to
 * validate the token against the project's current signing keys.
 */
export async function verifySupabaseJwt(token: string): Promise<AuthedUser> {
  let result: Awaited<ReturnType<ReturnType<typeof supabase>["auth"]["getUser"]>>;
  try {
    result = await supabase().auth.getUser(token);
  } catch (err) {
    log.warn("supabase_auth_invalid_token", {
      errorName: err instanceof Error ? err.name : "UnknownAuthError",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw ApiError.unauthorized("Invalid token.", "invalid_token");
  }

  const {
    data: { user },
    error,
  } = result;

  if (error) {
    log.warn("supabase_auth_invalid_token", {
      errorName: error.name,
      errorMessage: error.message,
    });
    throw ApiError.unauthorized("Invalid token.", "invalid_token");
  }

  if (!user?.id) {
    log.warn("supabase_auth_invalid_token", {
      errorName: "MissingUser",
      errorMessage: "Supabase Auth returned no user for access token.",
    });
    throw ApiError.unauthorized("Invalid token.", "invalid_token");
  }

  return { id: user.id, email: user.email ?? null };
}

/** Pulls `Bearer <token>` out of an Authorization header. */
export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
