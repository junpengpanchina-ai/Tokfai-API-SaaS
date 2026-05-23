import { createClient } from "@supabase/supabase-js";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import { listAdminModels, patchAdminModel } from "./adminModels.js";

const SUCCESS_STATUSES = ["succeeded", "success", "ok"];
const PAGE_SIZE = 1000;

type ProfileAdminRow = {
  id: string;
  email: string | null;
  credits_balance: number | string | null;
  total_credits_used: number | string | null;
  updated_at: string | null;
};

type UsageAdminRow = {
  id: string;
  user_id: string;
  created_at: string;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
  request_id: string | null;
};

type UsageCreditRow = {
  credits_charged: number | string | null;
};

type ApiKeyAdminRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type AdminCreditAdjustmentInput = {
  user_id?: unknown;
  amount?: unknown;
  direction?: unknown;
  reason?: unknown;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
};

type ParsedCreditAdjustment =
  | {
      userId: string;
      amount: number;
      direction: "add" | "deduct";
      reason: string;
    }
  | {
      error:
        | "missing_user_id"
        | "invalid_user_id"
        | "invalid_amount"
        | "invalid_direction"
        | "invalid_reason";
    };

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function adminEmailsFromEnv(): string[] {
  return (process.env.TOKFAI_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function extractAccessTokenFromAuthorization(
  header: string | null | undefined
): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

function authHeaderError(header: string | null | undefined):
  | "missing_authorization"
  | "invalid_authorization_format"
  | null {
  if (!header) return "missing_authorization";
  return /^Bearer\s+.+$/i.test(header.trim())
    ? null
    : "invalid_authorization_format";
}

function adminAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw ApiError.internal("Missing Supabase admin auth env.", "admin_auth_env_missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function requireAdmin(c: {
  req: { raw: { headers: { get: (name: string) => string | null } } };
  json: (data: unknown, status?: number) => Response;
}) {
  const authorization = c.req.raw.headers.get("authorization");
  const headerError = authHeaderError(authorization);
  const accessToken = extractAccessTokenFromAuthorization(authorization);
  const adminEmails = adminEmailsFromEnv();
  const hasToken = Boolean(accessToken);

  let currentEmail = "";
  let authUserErrorMessage: string | null = accessToken
    ? null
    : headerError === "missing_authorization"
      ? "Missing Bearer token."
      : "Invalid Authorization Bearer format.";

  if (accessToken) {
    const supabase = adminAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    authUserErrorMessage = error?.message ?? (!data.user ? "No user returned." : null);
    currentEmail = normalizeEmail(data.user?.email);
  }

  const matchResult = Boolean(currentEmail && adminEmails.includes(currentEmail));

  if (headerError) {
    const body = {
      error: {
        message:
          headerError === "missing_authorization"
            ? "Missing Bearer token."
            : "Invalid Authorization Bearer format.",
        code: headerError,
        type: "auth_error",
      },
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              currentEmail,
              adminEmails,
              hasToken,
              authUserErrorMessage,
              matchResult,
            },
          }
        : {}),
    };

    return c.json(body, 401);
  }

  if (!matchResult) {
    const body = {
      error: {
        message: "Not authorized.",
        code: "admin_not_authorized",
        type: "auth_error",
      },
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: {
              currentEmail,
              adminEmails,
              hasToken,
              authUserErrorMessage,
              matchResult,
            },
          }
        : {}),
    };

    return c.json(body, 403);
  }
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function jsonError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 500,
  error: string,
  extra?: Record<string, unknown>
) {
  return c.json({ error, ...(extra ?? {}) }, status);
}

function parseCreditAdjustment(
  body: AdminCreditAdjustmentInput
): ParsedCreditAdjustment {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const amount = Number(body.amount);
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "admin_adjustment";

  if (!userId) {
    return { error: "missing_user_id" as const };
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: "invalid_user_id" as const };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid_amount" as const };
  }

  if (body.direction !== "add" && body.direction !== "deduct") {
    return { error: "invalid_direction" as const };
  }

  const direction = body.direction;

  if (reason.length > 200) {
    return { error: "invalid_reason" as const };
  }

  return { userId, amount, direction, reason };
}

async function countRows(table: "profiles" | "api_keys" | "usage_logs") {
  const { count, error } = await supabase()
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) {
    throw ApiError.internal(
      `Failed to count ${table}: ${error.message}`,
      "admin_count_failed"
    );
  }

  return count ?? 0;
}

async function countSuccessfulUsage() {
  const { count, error } = await supabase()
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .in("status", SUCCESS_STATUSES);

  if (error) {
    throw ApiError.internal(
      `Failed to count successful usage logs: ${error.message}`,
      "admin_usage_count_failed"
    );
  }

  return count ?? 0;
}

async function listAllProfiles(): Promise<ProfileAdminRow[]> {
  const rows: ProfileAdminRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, email, credits_balance, total_credits_used, updated_at")
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw ApiError.internal(
        `Failed to list profiles: ${error.message}`,
        "admin_profiles_list_failed"
      );
    }

    const page = (data ?? []) as ProfileAdminRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function sumUsageCreditsCharged(): Promise<number> {
  let total = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase()
      .from("usage_logs")
      .select("credits_charged")
      .range(from, to);

    if (error) {
      throw ApiError.internal(
        `Failed to sum usage credits: ${error.message}`,
        "admin_usage_sum_failed"
      );
    }

    const page = (data ?? []) as UsageCreditRow[];
    total += page.reduce((sum, row) => sum + toNumber(row.credits_charged), 0);
    if (page.length < PAGE_SIZE) break;
  }

  return total;
}

async function listRecentUsageLogs() {
  const { data, error } = await supabase()
    .from("usage_logs")
    .select(
      "id, user_id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw ApiError.internal(
      `Failed to list usage logs: ${error.message}`,
      "admin_usage_list_failed"
    );
  }

  const logs = (data ?? []) as UsageAdminRow[];
  const userIds = [...new Set(logs.map((row) => row.user_id))];
  const emails = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase()
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (profileError) {
      throw ApiError.internal(
        `Failed to map usage emails: ${profileError.message}`,
        "admin_usage_email_map_failed"
      );
    }

    for (const profile of (profiles ?? []) as Array<{
      id: string;
      email: string | null;
    }>) {
      emails.set(profile.id, profile.email);
    }
  }

  return logs.map((row) => ({
    id: row.id,
    email: emails.get(row.user_id) ?? null,
    model: row.model,
    status: row.status,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
    credits_charged: toNumber(row.credits_charged),
    request_id: row.request_id,
    created_at: row.created_at,
  }));
}

async function listAllApiKeys(): Promise<ApiKeyAdminRow[]> {
  const rows: ApiKeyAdminRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase()
      .from("api_keys")
      .select("id, name, prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw ApiError.internal(
        `Failed to list API keys: ${error.message}`,
        "admin_api_keys_list_failed"
      );
    }

    const page = (data ?? []) as ApiKeyAdminRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function verifyAdminForCreditAdjustment(c: Context): Promise<
  | { ok: true; adminUser: SupabaseAuthUser }
  | {
      ok: false;
      status: 401 | 403;
      error:
        | "missing_authorization"
        | "invalid_authorization_format"
        | "invalid_supabase_token"
        | "admin_required"
        | "admin_profile_not_configured";
      detail?: string;
    }
> {
  const authorization = c.req.raw.headers.get("authorization");
  const headerError = authHeaderError(authorization);
  if (headerError) {
    return { ok: false, status: 401, error: headerError };
  }

  const accessToken = extractAccessTokenFromAuthorization(authorization);
  if (!accessToken) {
    return { ok: false, status: 401, error: "invalid_authorization_format" };
  }

  const authClient = adminAuthClient();
  const { data: userData, error: userError } =
    await authClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return { ok: false, status: 401, error: "invalid_supabase_token" };
  }

  const adminUser: SupabaseAuthUser = {
    id: userData.user.id,
    email: userData.user.email,
  };

  const { data: adminProfile, error: adminProfileError } = await supabase()
    .from("profiles")
    .select("*")
    .eq("id", adminUser.id)
    .maybeSingle();

  if (adminProfileError || !adminProfile) {
    return {
      ok: false,
      status: 403,
      error: "admin_profile_not_configured",
      detail: adminProfileError?.message,
    };
  }

  const profile = adminProfile as Record<string, unknown>;
  const hasProfileAdminFields = "role" in profile || "is_admin" in profile;
  const isProfileAdmin =
    profile.role === "admin" || profile.is_admin === true;

  if (hasProfileAdminFields) {
    return isProfileAdmin
      ? { ok: true, adminUser }
      : { ok: false, status: 403, error: "admin_required" };
  }

  // Current Tokfai production admin pages use this allowlist; keep it as a
  // compatibility fallback until role/is_admin exists in profiles.
  const isAllowlistedAdmin = adminEmailsFromEnv().includes(
    normalizeEmail(adminUser.email)
  );

  if (isAllowlistedAdmin) {
    return { ok: true, adminUser };
  }

  return {
    ok: false,
    status: 403,
    error: "admin_profile_not_configured",
  };
}

async function adjustUserCredits(input: {
  userId: string;
  amount: number;
  direction: "add" | "deduct";
  reason: string;
}) {
  const { userId, amount, direction, reason } = input;
  const signedAmount = direction === "add" ? amount : -amount;

  const { data: profile, error: profileError } = await supabase()
    .from("profiles")
    .select("id, credits_balance")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw ApiError.internal(
      `Failed to load profile for credit adjustment: ${profileError.message}`,
      "admin_credit_profile_load_failed"
    );
  }

  if (!profile) {
    return { error: "target_user_not_found" as const };
  }

  const currentBalance = toNumber(
    (profile as { credits_balance?: number | string | null }).credits_balance
  );
  const newBalance = currentBalance + signedAmount;

  if (newBalance < 0) {
    return {
      error: "insufficient_credits" as const,
      current_credits: currentBalance,
      requested_amount: amount,
    };
  }

  const { error: updateError } = await supabase()
    .from("profiles")
    .update({
      credits_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    throw ApiError.internal(
      `Failed to update profile credits: ${updateError.message}`,
      "admin_credit_update_failed"
    );
  }

  const referenceId = `admin_adjustment:${randomUUID()}`;
  const { error: ledgerError } = await supabase().from("credit_ledger").insert({
    user_id: userId,
    type: "adjustment",
    amount: signedAmount,
    balance_after: newBalance,
    reason,
    reference_id: referenceId,
  });

  if (ledgerError) {
    throw ApiError.internal(
      `Failed to write credit adjustment ledger: ${ledgerError.message}`,
      "admin_credit_ledger_failed"
    );
  }

  return {
    previous_credits: currentBalance,
    user_id: userId,
    delta: signedAmount,
    credits: newBalance,
    reason,
    reference_id: referenceId,
  };
}

export const adminRoutes = new Hono();

adminRoutes.post("/credits/adjust", async (c) => {
  const admin = await verifyAdminForCreditAdjustment(c);
  if (!admin.ok) {
    return jsonError(
      c,
      admin.status,
      admin.error,
      admin.detail ? { detail: admin.detail } : undefined
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as AdminCreditAdjustmentInput;
  const input = parseCreditAdjustment(body);
  if ("error" in input) {
    return jsonError(c, 400, input.error);
  }

  const adjustment = await adjustUserCredits(input);
  if ("error" in adjustment) {
    if (adjustment.error === "target_user_not_found") {
      return jsonError(c, 404, adjustment.error);
    }
    if (adjustment.error === "insufficient_credits") {
      return jsonError(c, 400, adjustment.error, {
        current_credits: adjustment.current_credits,
        requested_amount: adjustment.requested_amount,
      });
    }
  }

  return c.json({
    ok: true,
    user_id: adjustment.user_id,
    previous_credits: adjustment.previous_credits,
    delta: adjustment.delta,
    credits: adjustment.credits,
    balance_after: adjustment.credits,
    reason: adjustment.reason,
    reference_id: adjustment.reference_id,
  });
});

adminRoutes.use("*", async (c, next) => {
  const response = await requireAdmin(c);
  if (response) return response;
  await next();
});

adminRoutes.get("/summary", async (c) => {
  const [totalUsers, totalRequests, successRequests, totalCreditsCharged, logs] =
    await Promise.all([
      countRows("profiles"),
      countRows("usage_logs"),
      countSuccessfulUsage(),
      sumUsageCreditsCharged(),
      listRecentUsageLogs(),
    ]);

  return c.json({
    data: {
      summary: {
        total_users: totalUsers,
        total_requests: totalRequests,
        success_requests: successRequests,
        failed_requests: Math.max(totalRequests - successRequests, 0),
        total_credits_charged: totalCreditsCharged,
      },
      usage_logs: logs,
    },
  });
});

adminRoutes.get("/users", async (c) => {
  const profiles = await listAllProfiles();

  return c.json({
    data: profiles.map((row) => ({
      id: row.id,
      email: row.email,
      credits_balance: toNumber(row.credits_balance),
      total_credits_used: toNumber(row.total_credits_used),
      updated_at: row.updated_at,
    })),
  });
});

adminRoutes.get("/api-keys", async (c) => {
  const apiKeys = await listAllApiKeys();

  return c.json({
    data: apiKeys.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
    })),
  });
});

adminRoutes.get("/models", async (c) => {
  const models = await listAdminModels();
  return c.json({ data: models });
});

adminRoutes.patch("/models/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return jsonError(c, 400, "missing_model_id");
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await patchAdminModel(id, body);

  if (!result.ok) {
    return jsonError(
      c,
      result.status,
      result.error,
      result.detail ? { detail: result.detail } : undefined
    );
  }

  return c.json({ data: result.data });
});
