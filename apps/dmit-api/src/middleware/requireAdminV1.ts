import type { Context, MiddlewareHandler } from "hono";

import { extractBearer } from "../auth/jwt.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { supabaseAdmin, supabaseAuth } from "../supabase.js";
import type { AuthedUser } from "../types.js";

export type AdminAuthSource = "admin_users" | "legacy_allowlist";

export type AdminAuthErrorCode =
  | "missing_authorization"
  | "invalid_token"
  | "admin_not_authorized";

const ADMIN_AUTH_MESSAGES: Record<AdminAuthErrorCode, string> = {
  missing_authorization: "Missing Bearer token.",
  invalid_token: "Invalid token.",
  admin_not_authorized: "Not authorized.",
};

export type AdminUserContext = {
  /** auth.users.id */
  userId: string;
  email: string | null;
  /** public.admin_users.id when resolved from the registry */
  adminUserId: string | null;
  status: "active" | null;
  authSource: AdminAuthSource;
};

type AdminUserRow = {
  id: string;
  user_id: string;
  email: string;
  status: string;
  revoked_at: string | null;
};

const ADMIN_AUTH_LOG_KEYS = new Set([
  "requestId",
  "route",
  "code",
  "userId",
  "email",
]);

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function adminEmailsFromEnv(): string[] {
  return env.TOKFAI_ADMIN_EMAILS;
}

function adminAuthErrorResponse(
  c: Context,
  status: 401 | 403,
  code: AdminAuthErrorCode
) {
  return c.json(
    {
      error: {
        message: ADMIN_AUTH_MESSAGES[code],
        code,
        type: "auth_error",
      },
    },
    status
  );
}

/** Standard admin auth failure envelope — never includes debug or internal fields. */
export function respondAdminAuthError(
  c: Context,
  status: 401 | 403,
  code: AdminAuthErrorCode
) {
  return adminAuthErrorResponse(c, status, code);
}

function sanitizeAdminAuthLogFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ADMIN_AUTH_LOG_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

function logAdminAuthEvent(
  c: Context,
  msg:
    | "admin_authorized"
    | "admin_denied"
    | "admin_missing_token"
    | "admin_invalid_token"
    | "legacy_admin_allowlist_fallback"
    | "admin_users_lookup_failed",
  fields: Record<string, unknown>
) {
  log.info(msg, sanitizeAdminAuthLogFields({
    requestId: c.get("requestId" as never),
    route: `${c.req.method} ${c.req.path}`,
    ...fields,
  }));
}

async function lookupActiveAdminUser(
  userId: string,
  email: string
): Promise<
  | { ok: true; row: AdminUserRow }
  | { ok: false; queryFailed: true }
  | { ok: false; queryFailed: false }
> {
  const normalizedEmail = normalizeEmail(email);
  const filters = [`user_id.eq.${userId}`];
  if (normalizedEmail) {
    filters.push(`email.eq.${normalizedEmail}`);
  }

  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .select("id, user_id, email, status, revoked_at")
    .eq("status", "active")
    .is("revoked_at", null)
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, queryFailed: true };
  }

  if (!data) {
    return { ok: false, queryFailed: false };
  }

  return { ok: true, row: data as AdminUserRow };
}

export async function resolveAdminUser(
  authUser: AuthedUser,
  c?: Context
): Promise<AdminUserContext | null> {
  const email = normalizeEmail(authUser.email);
  const lookup = await lookupActiveAdminUser(authUser.id, email);

  if (lookup.ok) {
    return {
      userId: authUser.id,
      email: authUser.email,
      adminUserId: lookup.row.id,
      status: "active",
      authSource: "admin_users",
    };
  }

  if (lookup.queryFailed) {
    if (c) {
      logAdminAuthEvent(c, "admin_users_lookup_failed", {
        code: "admin_users_lookup_failed",
        userId: authUser.id,
        email: authUser.email,
      });
    }

    const allowlisted = Boolean(email && adminEmailsFromEnv().includes(email));
    if (allowlisted) {
      if (c) {
        logAdminAuthEvent(c, "legacy_admin_allowlist_fallback", {
          code: "legacy_admin_allowlist_fallback",
          userId: authUser.id,
          email: authUser.email,
        });
      } else {
        log.warn("legacy_admin_allowlist_fallback", sanitizeAdminAuthLogFields({
          code: "legacy_admin_allowlist_fallback",
          userId: authUser.id,
          email: authUser.email,
        }));
      }
      return {
        userId: authUser.id,
        email: authUser.email,
        adminUserId: null,
        status: "active",
        authSource: "legacy_allowlist",
      };
    }
    return null;
  }

  return null;
}

/**
 * Validates a browser Supabase access_token via Supabase Auth (supports ES256
 * signing keys). Never verifies JWTs locally with SUPABASE_JWT_SECRET.
 */
async function verifyAccessTokenWithSupabase(
  token: string
): Promise<AuthedUser | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabaseAuth().auth.getUser(token);

    if (error || !user?.id) {
      return null;
    }

    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}

export async function authenticateSupabaseUser(
  c: Context
): Promise<
  | { ok: true; user: AuthedUser }
  | {
      ok: false;
      status: 401;
      code: Extract<AdminAuthErrorCode, "missing_authorization" | "invalid_token">;
    }
> {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    logAdminAuthEvent(c, "admin_missing_token", {
      code: "missing_authorization",
    });
    return {
      ok: false,
      status: 401,
      code: "missing_authorization",
    };
  }

  const user = await verifyAccessTokenWithSupabase(token);
  if (!user) {
    logAdminAuthEvent(c, "admin_invalid_token", {
      code: "invalid_token",
    });
    return {
      ok: false,
      status: 401,
      code: "invalid_token",
    };
  }

  return { ok: true, user };
}

/**
 * Admin V1 gate for protected /admin/* routes (not /admin/me).
 *
 * - JWT missing/invalid → 401 with standard auth_error envelope only
 * - Authenticated non-admin → 403 admin_not_authorized
 * - GET /admin/me uses authenticateSupabaseUser + resolveAdminMe instead and
 *   returns HTTP 200 with is_admin:false for non-admins.
 */
export const requireAdminV1: MiddlewareHandler = async (c, next) => {
  const auth = await authenticateSupabaseUser(c);
  if (!auth.ok) {
    return respondAdminAuthError(c, auth.status, auth.code);
  }

  const adminUser = await resolveAdminUser(auth.user, c);
  if (!adminUser) {
    logAdminAuthEvent(c, "admin_denied", {
      code: "admin_not_authorized",
      userId: auth.user.id,
      email: auth.user.email,
    });
    return respondAdminAuthError(c, 403, "admin_not_authorized");
  }

  if (adminUser.authSource === "admin_users") {
    logAdminAuthEvent(c, "admin_authorized", {
      code: "admin_authorized",
      userId: adminUser.userId,
      email: adminUser.email,
    });
  }

  c.set("adminUser" as never, adminUser satisfies AdminUserContext);
  await next();
};

export async function resolveAdminMe(authUser: AuthedUser): Promise<{
  is_admin: boolean;
  email: string | null;
  user_id: string;
  admin_user_id: string | null;
  status: "active" | null;
  auth_source: AdminAuthSource | null;
}> {
  const adminUser = await resolveAdminUser(authUser);
  if (!adminUser) {
    return {
      is_admin: false,
      email: authUser.email,
      user_id: authUser.id,
      admin_user_id: null,
      status: null,
      auth_source: null,
    };
  }

  return {
    is_admin: true,
    email: adminUser.email,
    user_id: adminUser.userId,
    admin_user_id: adminUser.adminUserId,
    status: adminUser.status,
    auth_source: adminUser.authSource,
  };
}
