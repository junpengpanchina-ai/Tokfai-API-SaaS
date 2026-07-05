import { Hono, type Context } from "hono";

import { ApiError } from "../errors.js";
import {
  authenticateSupabaseUser,
  requireAdminV1,
  resolveAdminMe,
  respondAdminAuthError,
} from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";
import { handleAdminCreditsAdjust } from "./adminCreditsAdjust.js";
import { syncCatalogModelsAdmin } from "../catalog/seedModels.js";
import {
  archiveAdminModel,
  createAdminModel,
  listAdminModels,
  restoreAdminModel,
  updateAdminModel,
} from "./adminModels.js";
import {
  createAdminAnnouncement,
  listAdminAnnouncements,
  updateAdminAnnouncement,
} from "./adminAnnouncements.js";
import { listAdminChannels } from "./adminChannels.js";
import { buildAdminDashboardSummary } from "./adminDashboardSummary.js";
import { listAdminErrorLogs } from "./adminLogs.js";
import { listAdminPricing } from "./adminPricing.js";
import { getAdminSettings } from "./adminSettings.js";
import {
  listAdminCreditOrders,
  parseAdminCreditOrdersQuery,
} from "./adminCreditOrders.js";
import {
  archiveAdminRechargePlan,
  createAdminRechargePlan,
  duplicateAdminRechargePlan,
  listAdminRechargePlans,
  rechargePlanAdminErrorMessage,
  restoreAdminRechargePlan,
  updateAdminRechargePlan,
} from "./adminRechargePlans.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";

const SUCCESS_STATUSES = ["succeeded", "success", "ok"];
const PAGE_SIZE = 1000;

type ProfileAdminRow = {
  id: string;
  email: string | null;
  credits_balance: number | string | null;
  total_credits_purchased: number | string | null;
  total_credits_used: number | string | null;
  created_at: string | null;
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

type UsageAdminDetailRow = {
  id: string;
  user_id: string;
  api_key_id: string | null;
  created_at: string;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
  request_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type UsageCreditRow = {
  credits_charged: number | string | null;
};

type ApiKeyAdminRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type CreditLedgerAdminRow = {
  id: string;
  created_at: string;
  type: string;
  amount: number | string | null;
  balance_after: number | string | null;
  reason: string | null;
  reference_id: string | null;
};

const DEFAULT_LEDGER_LIMIT = 50;
const MAX_LEDGER_LIMIT = 100;

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
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

function adminApiError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 500,
  message: string,
  code: string,
  type:
    | "auth_error"
    | "validation_error"
    | "not_found"
    | "server_error" = "validation_error",
  detail?: unknown
) {
  return c.json(
    {
      error: {
        message,
        code,
        type,
        ...(detail !== undefined ? { detail } : {}),
      },
    },
    status as never
  );
}

function adminModelWriteContext(c: Context): {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
} {
  const adminUser = c.get("adminUser" as never) as AdminUserContext;
  const forwarded = c.req.header("x-forwarded-for");
  const ipAddress = forwarded
    ? (forwarded.split(",")[0]?.trim() ?? null)
    : (c.req.header("x-real-ip") ?? null);
  const idempotencyKey =
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key") ?? "";

  return {
    adminUser,
    ipAddress,
    userAgent: c.req.header("user-agent") ?? null,
    idempotencyKey: idempotencyKey.trim(),
  };
}

function adminModelErrorMessage(code: string): string {
  switch (code) {
    case "model_not_found":
      return "Model not found.";
    case "model_already_exists":
      return "A model with this ID already exists.";
    case "invalid_model_fields":
      return "Invalid model fields.";
    case "invalid_pricing_value":
      return "Invalid pricing value.";
    case "empty_patch":
      return "No fields to update.";
    case "unknown_field":
      return "Unknown field in request body.";
    case "missing_model_id":
      return "Model ID is required.";
    default:
      return code;
  }
}

function parseLedgerLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LEDGER_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LEDGER_LIMIT;
  return Math.min(parsed, MAX_LEDGER_LIMIT);
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
      .select(
        "id, email, credits_balance, total_credits_purchased, total_credits_used, created_at, updated_at"
      )
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

async function listAdminUsageLogs() {
  const { data, error } = await supabase()
    .from("usage_logs")
    .select(
      "id, user_id, api_key_id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id, error_code, error_message"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw ApiError.internal(
      `Failed to list admin usage logs: ${error.message}`,
      "admin_usage_list_failed"
    );
  }

  const logs = (data ?? []) as UsageAdminDetailRow[];
  const userIds = [...new Set(logs.map((row) => row.user_id))];
  const apiKeyIds = [
    ...new Set(
      logs
        .map((row) => row.api_key_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const emails = new Map<string, string | null>();
  const apiKeys = new Map<
    string,
    { prefix: string | null; name: string | null }
  >();

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

  if (apiKeyIds.length > 0) {
    const { data: keys, error: apiKeyError } = await supabase()
      .from("api_keys")
      .select("id, prefix, name")
      .in("id", apiKeyIds);

    if (apiKeyError) {
      throw ApiError.internal(
        `Failed to map usage API keys: ${apiKeyError.message}`,
        "admin_usage_api_key_map_failed"
      );
    }

    for (const key of (keys ?? []) as Array<{
      id: string;
      prefix: string | null;
      name: string | null;
    }>) {
      apiKeys.set(key.id, { prefix: key.prefix, name: key.name });
    }
  }

  return logs.map((row) => {
    const apiKey = row.api_key_id ? apiKeys.get(row.api_key_id) : null;

    return {
      created_at: row.created_at,
      email: emails.get(row.user_id) ?? null,
      prefix: apiKey?.prefix ?? null,
      api_key_name: apiKey?.name ?? null,
      model: row.model,
      status: row.status,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      credits_charged: toNumber(row.credits_charged),
      request_id: row.request_id,
      error_code: row.error_code,
      error_message: row.error_message,
    };
  });
}

async function listAllApiKeys(): Promise<ApiKeyAdminRow[]> {
  const rows: ApiKeyAdminRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase()
      .from("api_keys")
      .select("id, user_id, name, prefix, created_at, last_used_at, revoked_at")
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

async function countUsageByApiKeyIds(
  apiKeyIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (apiKeyIds.length === 0) return counts;

  for (const apiKeyId of apiKeyIds) {
    counts.set(apiKeyId, 0);
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase()
      .from("usage_logs")
      .select("api_key_id")
      .in("api_key_id", apiKeyIds)
      .range(from, to);

    if (error) {
      break;
    }

    const page = (data ?? []) as Array<{ api_key_id: string | null }>;
    for (const row of page) {
      if (!row.api_key_id) continue;
      counts.set(row.api_key_id, (counts.get(row.api_key_id) ?? 0) + 1);
    }

    if (page.length < PAGE_SIZE) break;
  }

  return counts;
}

async function listAdminApiKeysEnriched() {
  const apiKeys = await listAllApiKeys();
  const userIds = [...new Set(apiKeys.map((row) => row.user_id))];
  const emails = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase()
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (profileError) {
      throw ApiError.internal(
        `Failed to map API key emails: ${profileError.message}`,
        "admin_api_keys_email_map_failed"
      );
    }

    for (const profile of (profiles ?? []) as Array<{
      id: string;
      email: string | null;
    }>) {
      emails.set(profile.id, profile.email);
    }
  }

  const usageCounts = await countUsageByApiKeyIds(apiKeys.map((row) => row.id));

  return apiKeys.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    owner_email: emails.get(row.user_id) ?? null,
    name: row.name,
    prefix: row.prefix,
    status: row.revoked_at ? "revoked" : "active",
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    total_usage: usageCounts.get(row.id) ?? 0,
  }));
}

async function getAdminCreditsByEmail(email: string, ledgerLimit: number) {
  const { data: profile, error: profileError } = await supabase()
    .from("profiles")
    .select("id, email, credits_balance, total_credits_used, updated_at")
    .ilike("email", email)
    .maybeSingle();

  if (profileError) {
    throw ApiError.internal(
      `Failed to load profile for admin credits lookup: ${profileError.message}`,
      "admin_credits_profile_failed"
    );
  }

  if (!profile) {
    return { error: "user_not_found" as const };
  }

  const profileRow = profile as ProfileAdminRow;
  const { data: ledger, error: ledgerError } = await supabase()
    .from("credit_ledger")
    .select("id, created_at, type, amount, balance_after, reason, reference_id")
    .eq("user_id", profileRow.id)
    .order("created_at", { ascending: false })
    .limit(ledgerLimit);

  if (ledgerError) {
    throw ApiError.internal(
      `Failed to load credit ledger for admin credits lookup: ${ledgerError.message}`,
      "admin_credits_ledger_failed"
    );
  }

  return {
    profile: {
      id: profileRow.id,
      email: profileRow.email,
      credits_balance: toNumber(profileRow.credits_balance),
      total_credits_used: toNumber(profileRow.total_credits_used),
      updated_at: profileRow.updated_at,
    },
    ledger: ((ledger ?? []) as CreditLedgerAdminRow[]).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      type: row.type,
      amount: toNumber(row.amount),
      balance_after: toNumber(row.balance_after),
      reason: row.reason,
      reference_id: row.reference_id,
    })),
  };
}

export const adminRoutes = new Hono();

/** JWT only — returns is_admin without requiring admin privileges. */
adminRoutes.get("/me", async (c) => {
  const auth = await authenticateSupabaseUser(c);
  if (!auth.ok) {
    return respondAdminAuthError(c, auth.status, auth.code);
  }

  const data = await resolveAdminMe(auth.user);
  return c.json({ data });
});

const protectedAdminRoutes = new Hono();
protectedAdminRoutes.use("*", requireAdminV1);

protectedAdminRoutes.post("/credits/adjust", handleAdminCreditsAdjust);

/**
 * Read-only admin dashboard metrics. Response is a single JSON object via
 * `c.json` (Content-Type: application/json) — no HTML or log lines in the body.
 * When piping to jq, run this curl in its own shell; do not chain with git,
 * pm2, or other commands whose stdout would be read by jq.
 * See apps/dmit-api/README.md § Admin dashboard smoke test.
 */
protectedAdminRoutes.get("/dashboard-summary", async (c) => {
  const { summary, warnings } = await buildAdminDashboardSummary();
  return c.json({ data: summary, warnings });
});

protectedAdminRoutes.get("/summary", async (c) => {
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

protectedAdminRoutes.get("/users", async (c) => {
  const profiles = await listAllProfiles();

  return c.json({
    data: profiles.map((row) => ({
      id: row.id,
      email: row.email,
      credits_balance: toNumber(row.credits_balance),
      total_credits_purchased: toNumber(row.total_credits_purchased),
      total_credits_used: toNumber(row.total_credits_used),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });
});

protectedAdminRoutes.get("/api-keys", async (c) => {
  const apiKeys = await listAdminApiKeysEnriched();
  return c.json({ data: apiKeys });
});

protectedAdminRoutes.get("/channels", async (c) => {
  return c.json({ data: listAdminChannels() });
});

protectedAdminRoutes.get("/pricing", async (c) => {
  const pricing = await listAdminPricing();
  return c.json({ data: pricing });
});

protectedAdminRoutes.get("/logs", async (c) => {
  const logs = await listAdminErrorLogs({
    request_id: c.req.query("request_id"),
    limit: c.req.query("limit"),
  });
  return c.json({ data: logs });
});

protectedAdminRoutes.get("/settings", async (c) => {
  return c.json({ data: getAdminSettings() });
});

protectedAdminRoutes.get("/announcements", async (c) => {
  const announcements = await listAdminAnnouncements();
  return c.json({ data: announcements });
});

protectedAdminRoutes.post("/announcements", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createAdminAnnouncement(body, adminModelWriteContext(c));

  if (!result.ok) {
    const message =
      result.error === "announcement_slug_exists"
        ? "An announcement with this slug already exists."
        : result.error === "invalid_announcement_fields"
          ? "Invalid announcement fields."
          : "Failed to create announcement.";
    return adminApiError(
      c,
      result.status,
      message,
      result.error,
      result.status === 409 ? "validation_error" : "validation_error"
    );
  }

  return c.json({ data: result.announcement }, 201);
});

protectedAdminRoutes.patch("/announcements/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(
      c,
      400,
      "Announcement ID is required.",
      "missing_announcement_id"
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateAdminAnnouncement(id, body, adminModelWriteContext(c));

  if (!result.ok) {
    const message =
      result.error === "announcement_not_found"
        ? "Announcement not found."
        : result.error === "announcement_slug_exists"
          ? "An announcement with this slug already exists."
          : result.error === "empty_patch"
            ? "No fields to update."
            : result.error === "invalid_announcement_fields"
              ? "Invalid announcement fields."
              : "Failed to update announcement.";
    return adminApiError(
      c,
      result.status,
      message,
      result.error,
      result.status === 404 ? "not_found" : "validation_error"
    );
  }

  return c.json({ data: result.announcement });
});

protectedAdminRoutes.get("/credit-orders", async (c) => {
  const orders = await listAdminCreditOrders(parseAdminCreditOrdersQuery(c));
  return c.json({ data: orders });
});

protectedAdminRoutes.get("/recharge-plans", async (c) => {
  const includeArchived =
    c.req.query("include_archived") === "true" ||
    c.req.query("include_archived") === "1";
  const plans = await listAdminRechargePlans({ includeArchived });
  return c.json({ data: plans });
});

protectedAdminRoutes.post("/recharge-plans", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createAdminRechargePlan(body, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      rechargePlanAdminErrorMessage(result.error),
      result.error,
      result.status === 409 ? "validation_error" : "validation_error",
      result.detail
    );
  }

  return c.json({ data: result.plan }, 201);
});

protectedAdminRoutes.patch("/recharge-plans/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Plan ID is required.", "missing_plan_id");
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateAdminRechargePlan(id, body, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      rechargePlanAdminErrorMessage(result.error),
      result.error,
      result.status === 404 ? "not_found" : "validation_error",
      result.detail
    );
  }

  return c.json({ data: result.plan });
});

protectedAdminRoutes.post("/recharge-plans/:id/duplicate", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Plan ID is required.", "missing_plan_id");
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await duplicateAdminRechargePlan(
    id,
    body,
    adminModelWriteContext(c)
  );

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      rechargePlanAdminErrorMessage(result.error),
      result.error,
      result.status === 404 ? "not_found" : "validation_error",
      result.detail
    );
  }

  return c.json(
    {
      data: {
        plan: result.plan,
        source_plan_id: result.source_plan_id,
      },
    },
    201
  );
});

protectedAdminRoutes.delete("/recharge-plans/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Plan ID is required.", "missing_plan_id");
  }

  const result = await archiveAdminRechargePlan(id, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      rechargePlanAdminErrorMessage(result.error),
      result.error,
      result.status === 404 ? "not_found" : "validation_error"
    );
  }

  return c.json({
    data: {
      plan: result.plan,
      archived: result.archived,
    },
  });
});

protectedAdminRoutes.post("/recharge-plans/:id/restore", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Plan ID is required.", "missing_plan_id");
  }

  const result = await restoreAdminRechargePlan(id, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      rechargePlanAdminErrorMessage(result.error),
      result.error,
      result.status === 404 ? "not_found" : "validation_error"
    );
  }

  return c.json({ data: result.plan });
});

protectedAdminRoutes.get("/models", async (c) => {
  const models = await listAdminModels();
  return c.json({ data: models });
});

protectedAdminRoutes.post("/models/sync-catalog", async (c) => {
  const result = await syncCatalogModelsAdmin(adminModelWriteContext(c));
  return c.json({ data: result });
});

protectedAdminRoutes.post("/models", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createAdminModel(body, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      adminModelErrorMessage(result.error),
      result.error,
      result.status === 409 ? "validation_error" : "validation_error"
    );
  }

  return c.json({ data: result.model }, 201);
});

protectedAdminRoutes.patch("/models/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Model ID is required.", "missing_model_id");
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateAdminModel(id, body, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      adminModelErrorMessage(result.error),
      result.error,
      result.status === 404 ? "not_found" : "validation_error"
    );
  }

  return c.json({ data: result.model });
});

protectedAdminRoutes.delete("/models/:id", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Model ID is required.", "missing_model_id");
  }

  const result = await archiveAdminModel(id, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      adminModelErrorMessage(result.error),
      result.error,
      "not_found"
    );
  }

  return c.json({
    data: {
      model: result.model,
      usage_log_count: result.usage_log_count,
      archived: true,
    },
  });
});

protectedAdminRoutes.post("/models/:id/restore", async (c) => {
  const id = c.req.param("id").trim();
  if (!id) {
    return adminApiError(c, 400, "Model ID is required.", "missing_model_id");
  }

  const result = await restoreAdminModel(id, adminModelWriteContext(c));

  if (!result.ok) {
    return adminApiError(
      c,
      result.status,
      adminModelErrorMessage(result.error),
      result.error,
      "not_found"
    );
  }

  return c.json({ data: result.model });
});

protectedAdminRoutes.get("/usage", async (c) => {
  const usageLogs = await listAdminUsageLogs();
  return c.json({ data: usageLogs });
});

protectedAdminRoutes.get("/credits", async (c) => {
  const email = normalizeEmail(c.req.query("email"));
  if (!email) {
    return jsonError(c, 400, "missing_email");
  }

  const result = await getAdminCreditsByEmail(
    email,
    parseLedgerLimit(c.req.query("limit"))
  );

  if ("error" in result) {
    return jsonError(c, 404, result.error as "user_not_found");
  }

  return c.json({ data: result });
});

adminRoutes.route("/", protectedAdminRoutes);
