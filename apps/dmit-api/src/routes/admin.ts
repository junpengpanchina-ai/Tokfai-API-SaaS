import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";

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

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function adminEmailsFromEnv(): string[] {
  return (process.env.TOKFAI_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function extractBearerFromAuthorization(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
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
  req: { header: (name: string) => string | undefined };
  json: (data: unknown, status?: number) => Response;
}) {
  const authorization =
    c.req.header("Authorization") ?? c.req.header("authorization");
  const token = extractBearerFromAuthorization(authorization);
  const hasToken = Boolean(token);
  const adminEmailsRaw = process.env.TOKFAI_ADMIN_EMAILS ?? "";
  const adminEmails = adminEmailsFromEnv();

  let currentEmail = "";
  let authUserErrorMessage: string | null = hasToken
    ? null
    : "Missing Bearer token.";

  if (token) {
    const { data, error } = await adminAuthClient().auth.getUser(token);
    authUserErrorMessage = error?.message ?? (!data.user ? "No user returned." : null);
    currentEmail = normalizeEmail(data.user?.email);
  }

  const matchResult = Boolean(currentEmail && adminEmails.includes(currentEmail));

  // Deliberately excludes bearer token and server-only secrets.
  console.log("ADMIN_AUTH_DEBUG", {
    currentEmail,
    adminEmails,
    hasToken,
    matchResult,
    authUserErrorMessage,
  });

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
              adminEmailsRaw,
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

export const adminRoutes = new Hono();

adminRoutes.use("/admin/*", async (c, next) => {
  const response = await requireAdmin(c);
  if (response) return response;
  await next();
});

adminRoutes.get("/admin/summary", async (c) => {
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

adminRoutes.get("/admin/users", async (c) => {
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

adminRoutes.get("/admin/api-keys", async (c) => {
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
