import { supabase } from "../supabase.js";
import { listAdminCreditOrders } from "./adminCreditOrders.js";

const PAGE_SIZE = 1000;
/** Paid order statuses in public.credit_orders (schema default: paid; also accept legacy values). */
const PAID_ORDER_STATUSES = ["paid", "succeeded", "completed"];
const USAGE_SUCCESS_STATUSES = ["succeeded", "success", "ok"];

export type AdminDashboardRecentOrder = {
  id: string;
  email: string | null;
  plan_label: string | null;
  amount_cents: number | null;
  status: string;
  created_at: string;
};

export type AdminDashboardRecentUser = {
  id: string;
  email: string | null;
  created_at: string;
};

export type AdminDashboardSparklinePoint = {
  date: string;
  count: number;
};

export type AdminDashboardModelTopRow = {
  model: string;
  request_count: number;
};

export type AdminDashboardRecentError = {
  id: string;
  request_id: string | null;
  model: string | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export type AdminDashboardSummary = {
  /** Terminal users from public.profiles (one row per auth.users). */
  total_users: number | null;
  /**
   * Staff admin registry count from public.admin_users — not end-user signups.
   * See migration 0012_admin_security_base.sql.
   */
  admin_user_count: number | null;
  today_new_users: number | null;
  last_7d_new_users: number | null;
  last_30d_new_users: number | null;
  /** Which table backs user counts / recent users. */
  user_source: "profiles" | "admin_users";

  total_credit_orders: number | null;
  paid_orders: number | null;
  pending_orders: number | null;
  /** Sum of paid order amounts only; pending/cancelled/failed excluded. */
  total_recharge_amount_cents: number;

  total_requests: number | null;
  successful_requests: number | null;
  failed_requests: number | null;
  has_token_data: boolean;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  total_usage_credits: number | null;

  recent_orders: AdminDashboardRecentOrder[];
  recent_users: AdminDashboardRecentUser[];

  today_requests: number | null;
  today_credits_consumed: number | null;
  today_revenue_cents: number;
  active_users_7d: number | null;
  total_api_keys: number | null;
  error_rate_percent: number | null;
  request_sparkline_7d: AdminDashboardSparklinePoint[];
  model_top_10: AdminDashboardModelTopRow[];
  recent_errors: AdminDashboardRecentError[];

  updated_at: string;
};

type SafeCountResult = {
  value: number | null;
  warning?: string;
};

type SafeSumResult = {
  value: number | null;
  warning?: string;
};

type UsageAggregateResult = {
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  total_usage_credits: number | null;
  has_token_data: boolean;
  warning?: string;
};

function isoStartOfTodayUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

function isoSinceDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") || lower.includes("could not find"))
  );
}

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("relation") && lower.includes("does not exist")) ||
    (lower.includes("schema cache") && lower.includes("could not find"))
  );
}

type CountResponse = {
  count: number | null;
  error: { message: string } | null;
};

type SupabaseCountQuery = {
  is: (column: string, value: null) => SupabaseCountQuery;
  eq: (column: string, value: boolean | string) => SupabaseCountQuery;
  gte: (column: string, value: string) => SupabaseCountQuery;
  in: (column: string, values: string[]) => SupabaseCountQuery;
} & PromiseLike<CountResponse>;

async function safeCount(
  table: string,
  apply?: (query: SupabaseCountQuery) => SupabaseCountQuery
): Promise<SafeCountResult> {
  try {
    const base = supabase()
      .from(table)
      .select("id", { count: "exact", head: true }) as unknown as SupabaseCountQuery;
    const query = apply ? apply(base) : base;

    const { count, error } = await query;

    if (error) {
      return {
        value: null,
        warning: `${table} count: ${error.message}`,
      };
    }

    return { value: count ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: null, warning: `${table} count: ${message}` };
  }
}

async function sumPaidCreditOrdersAmountCents(): Promise<{
  value: number;
  warning?: string;
}> {
  try {
    const probe = await supabase()
      .from("credit_orders")
      .select("amount_cents")
      .in("status", PAID_ORDER_STATUSES)
      .limit(1);

    if (probe.error) {
      if (isMissingColumnError(probe.error.message)) {
        return sumPaidCreditOrdersAmountFromCny();
      }
      if (isMissingTableError(probe.error.message)) {
        return { value: 0, warning: `credit_orders paid amount sum: ${probe.error.message}` };
      }
      return { value: 0, warning: `credit_orders paid amount sum: ${probe.error.message}` };
    }

    if (!probe.data || probe.data.length === 0) {
      return { value: 0 };
    }

    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data: rows, error: pageError } = await supabase()
        .from("credit_orders")
        .select("amount_cents")
        .in("status", PAID_ORDER_STATUSES)
        .range(from, to);

      if (pageError) {
        return {
          value: 0,
          warning: `credit_orders paid amount_cents sum: ${pageError.message}`,
        };
      }

      const page = (rows ?? []) as Array<{ amount_cents: number | null }>;
      total += page.reduce((sum, row) => sum + toNumber(row.amount_cents), 0);

      if (page.length < PAGE_SIZE) break;
    }

    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: 0, warning: `credit_orders paid amount sum: ${message}` };
  }
}

async function sumPaidCreditOrdersAmountFromCny(): Promise<{
  value: number;
  warning?: string;
}> {
  try {
    const probe = await supabase()
      .from("credit_orders")
      .select("amount_cny")
      .in("status", PAID_ORDER_STATUSES)
      .limit(1);

    if (probe.error) {
      if (isMissingColumnError(probe.error.message)) {
        return { value: 0 };
      }
      return { value: 0, warning: `credit_orders paid amount_cny sum: ${probe.error.message}` };
    }

    if (!probe.data || probe.data.length === 0) {
      return { value: 0 };
    }

    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data: rows, error: pageError } = await supabase()
        .from("credit_orders")
        .select("amount_cny")
        .in("status", PAID_ORDER_STATUSES)
        .range(from, to);

      if (pageError) {
        return {
          value: 0,
          warning: `credit_orders paid amount_cny sum: ${pageError.message}`,
        };
      }

      const page = (rows ?? []) as Array<{ amount_cny: number | null }>;
      total += page.reduce(
        (sum, row) => sum + toNumber(row.amount_cny) * 100,
        0
      );

      if (page.length < PAGE_SIZE) break;
    }

    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: 0, warning: `credit_orders paid amount_cny sum: ${message}` };
  }
}

async function countOrdersByStatus(statuses: string[]): Promise<SafeCountResult> {
  return safeCount("credit_orders", (q) => q.in("status", statuses));
}

async function countSuccessfulRequests(): Promise<SafeCountResult> {
  return safeCount("usage_logs", (q) => q.in("status", USAGE_SUCCESS_STATUSES));
}

async function aggregateUsageMetrics(): Promise<UsageAggregateResult> {
  try {
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;
    let totalCredits = 0;
    let hasTokenData = false;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase()
        .from("usage_logs")
        .select("prompt_tokens, completion_tokens, total_tokens, credits_charged")
        .range(from, to);

      if (error) {
        if (isMissingColumnError(error.message)) {
          return {
            total_input_tokens: null,
            total_output_tokens: null,
            total_tokens: null,
            total_usage_credits: null,
            has_token_data: false,
          };
        }
        return {
          total_input_tokens: null,
          total_output_tokens: null,
          total_tokens: null,
          total_usage_credits: null,
          has_token_data: false,
          warning: `usage_logs aggregate: ${error.message}`,
        };
      }

      const page = (data ?? []) as Array<{
        prompt_tokens: number | null;
        completion_tokens: number | null;
        total_tokens: number | null;
        credits_charged: number | string | null;
      }>;

      for (const row of page) {
        if (row.prompt_tokens != null) {
          hasTokenData = true;
          totalInput += toNumber(row.prompt_tokens);
        }
        if (row.completion_tokens != null) {
          hasTokenData = true;
          totalOutput += toNumber(row.completion_tokens);
        }
        if (row.total_tokens != null) {
          hasTokenData = true;
          totalTokens += toNumber(row.total_tokens);
        }
        totalCredits += toNumber(row.credits_charged);
      }

      if (page.length < PAGE_SIZE) break;
    }

    return {
      total_input_tokens: hasTokenData ? totalInput : null,
      total_output_tokens: hasTokenData ? totalOutput : null,
      total_tokens: hasTokenData ? totalTokens : null,
      total_usage_credits: totalCredits,
      has_token_data: hasTokenData,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      total_input_tokens: null,
      total_output_tokens: null,
      total_tokens: null,
      total_usage_credits: null,
      has_token_data: false,
      warning: `usage_logs aggregate: ${message}`,
    };
  }
}

function resolvePlanLabel(
  packageCode: string | null | undefined,
  planId: string | null | undefined
): string | null {
  const pkg = packageCode?.trim();
  const plan = planId?.trim();
  if (pkg && plan && pkg !== plan) return `${pkg} / ${plan}`;
  return pkg || plan || null;
}

async function fetchRecentOrders(): Promise<{
  orders: AdminDashboardRecentOrder[];
  warning?: string;
}> {
  try {
    const rows = await listAdminCreditOrders({ limit: 5 });
    return {
      orders: rows.map((row) => ({
        id: row.id,
        email: row.email,
        plan_label: resolvePlanLabel(row.package_code, row.plan_id),
        amount_cents: row.amount_cents,
        status: row.status,
        created_at: row.created_at,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { orders: [], warning: `recent credit_orders: ${message}` };
  }
}

async function fetchRecentUsers(): Promise<{
  users: AdminDashboardRecentUser[];
  user_source: "profiles" | "admin_users";
  warning?: string;
}> {
  try {
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, email, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error) {
      return {
        users: ((data ?? []) as AdminDashboardRecentUser[]).map((row) => ({
          id: row.id,
          email: row.email,
          created_at: row.created_at,
        })),
        user_source: "profiles",
      };
    }

    if (!isMissingTableError(error.message)) {
      return {
        users: [],
        user_source: "profiles",
        warning: `recent profiles: ${error.message}`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      users: [],
      user_source: "profiles",
      warning: `recent profiles: ${message}`,
    };
  }

  // Fallback: admin_users holds staff identities only, not terminal signups.
  try {
    const { data, error } = await supabase()
      .from("admin_users")
      .select("id, email, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      return {
        users: [],
        user_source: "admin_users",
        warning: `recent admin_users fallback: ${error.message}`,
      };
    }

    return {
      users: ((data ?? []) as AdminDashboardRecentUser[]).map((row) => ({
        id: row.id,
        email: row.email,
        created_at: row.created_at,
      })),
      user_source: "admin_users",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      users: [],
      user_source: "admin_users",
      warning: `recent admin_users fallback: ${message}`,
    };
  }
}

function collectWarning(
  warnings: string[],
  result: { warning?: string }
): void {
  if (result.warning) {
    warnings.push(result.warning);
  }
}

async function countUsageSince(iso: string): Promise<SafeCountResult> {
  return safeCount("usage_logs", (q) => q.gte("created_at", iso));
}

async function sumUsageCreditsSince(iso: string): Promise<SafeSumResult> {
  try {
    let total = 0;
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase()
        .from("usage_logs")
        .select("credits_charged")
        .gte("created_at", iso)
        .range(from, to);

      if (error) {
        return { value: null, warning: `usage_logs credits since: ${error.message}` };
      }

      const page = (data ?? []) as Array<{ credits_charged: number | string | null }>;
      total += page.reduce((sum, row) => sum + toNumber(row.credits_charged), 0);
      if (page.length < PAGE_SIZE) break;
    }
    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: null, warning: `usage_logs credits since: ${message}` };
  }
}

async function sumPaidOrdersAmountSince(iso: string): Promise<{ value: number; warning?: string }> {
  try {
    let total = 0;
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase()
        .from("credit_orders")
        .select("amount_cents, amount_cny")
        .in("status", PAID_ORDER_STATUSES)
        .gte("created_at", iso)
        .range(from, to);

      if (error) {
        if (isMissingColumnError(error.message)) {
          return { value: 0 };
        }
        return { value: 0, warning: `credit_orders today revenue: ${error.message}` };
      }

      const page = (data ?? []) as Array<{
        amount_cents: number | null;
        amount_cny: number | null;
      }>;

      for (const row of page) {
        if (row.amount_cents != null) {
          total += toNumber(row.amount_cents);
        } else if (row.amount_cny != null) {
          total += toNumber(row.amount_cny) * 100;
        }
      }

      if (page.length < PAGE_SIZE) break;
    }
    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: 0, warning: `credit_orders today revenue: ${message}` };
  }
}

async function countActiveUsersSince(iso: string): Promise<SafeCountResult> {
  try {
    const { data, error } = await supabase()
      .from("usage_logs")
      .select("user_id")
      .gte("created_at", iso)
      .limit(PAGE_SIZE);

    if (error) {
      return { value: null, warning: `active users: ${error.message}` };
    }

    const ids = new Set(
      ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)
    );
    return { value: ids.size };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: null, warning: `active users: ${message}` };
  }
}

async function buildRequestSparkline7d(): Promise<{
  points: AdminDashboardSparklinePoint[];
  warning?: string;
}> {
  try {
    const since7d = isoSinceDays(7);
    const buckets = new Map<string, number>();

    for (let day = 6; day >= 0; day -= 1) {
      const d = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }

    const { data, error } = await supabase()
      .from("usage_logs")
      .select("created_at")
      .gte("created_at", since7d)
      .limit(PAGE_SIZE * 5);

    if (error) {
      return { points: [], warning: `request sparkline: ${error.message}` };
    }

    for (const row of (data ?? []) as Array<{ created_at: string }>) {
      const key = row.created_at.slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return {
      points: [...buckets.entries()].map(([date, count]) => ({ date, count })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { points: [], warning: `request sparkline: ${message}` };
  }
}

async function buildModelTop10(): Promise<{
  rows: AdminDashboardModelTopRow[];
  warning?: string;
}> {
  try {
    const since7d = isoSinceDays(7);
    const counts = new Map<string, number>();

    const { data, error } = await supabase()
      .from("usage_logs")
      .select("model")
      .gte("created_at", since7d)
      .limit(PAGE_SIZE * 5);

    if (error) {
      return { rows: [], warning: `model top 10: ${error.message}` };
    }

    for (const row of (data ?? []) as Array<{ model: string | null }>) {
      const model = row.model?.trim() || "unknown";
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }

    const rows = [...counts.entries()]
      .map(([model, request_count]) => ({ model, request_count }))
      .sort((a, b) => b.request_count - a.request_count)
      .slice(0, 10);

    return { rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { rows: [], warning: `model top 10: ${message}` };
  }
}

async function fetchRecentErrors(): Promise<{
  errors: AdminDashboardRecentError[];
  warning?: string;
}> {
  try {
    const { data, error } = await supabase()
      .from("usage_logs")
      .select("id, request_id, model, status, error_code, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { errors: [], warning: `recent errors: ${error.message}` };
    }

    const errors = ((data ?? []) as AdminDashboardRecentError[]).filter(
      (row) =>
        !USAGE_SUCCESS_STATUSES.includes((row.status ?? "").toLowerCase()) ||
        Boolean(row.error_code?.trim()) ||
        Boolean(row.error_message?.trim())
    );

    return { errors: errors.slice(0, 10) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [], warning: `recent errors: ${message}` };
  }
}

function computeErrorRatePercent(
  total: number | null,
  failed: number | null
): number | null {
  if (total == null || failed == null || total <= 0) return null;
  return Math.round((failed / total) * 1000) / 10;
}

export async function buildAdminDashboardSummary(): Promise<{
  summary: AdminDashboardSummary;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const sinceToday = isoStartOfTodayUtc();
  const since7d = isoSinceDays(7);
  const since30d = isoSinceDays(30);

  const [
    totalUsers,
    adminUserCount,
    todayNewUsers,
    last7dNewUsers,
    last30dNewUsers,
    totalCreditOrders,
    paidOrders,
    pendingOrders,
    rechargeAmount,
    totalRequests,
    successfulRequests,
    usageAggregate,
    recentOrdersResult,
    recentUsersResult,
    todayRequests,
    todayCredits,
    todayRevenue,
    activeUsers7d,
    totalApiKeys,
    sparklineResult,
    modelTopResult,
    recentErrorsResult,
  ] = await Promise.all([
    safeCount("profiles"),
    safeCount("admin_users"),
    safeCount("profiles", (q) => q.gte("created_at", sinceToday)),
    safeCount("profiles", (q) => q.gte("created_at", since7d)),
    safeCount("profiles", (q) => q.gte("created_at", since30d)),
    safeCount("credit_orders"),
    countOrdersByStatus(PAID_ORDER_STATUSES),
    countOrdersByStatus(["pending"]),
    sumPaidCreditOrdersAmountCents(),
    safeCount("usage_logs"),
    countSuccessfulRequests(),
    aggregateUsageMetrics(),
    fetchRecentOrders(),
    fetchRecentUsers(),
    countUsageSince(sinceToday),
    sumUsageCreditsSince(sinceToday),
    sumPaidOrdersAmountSince(sinceToday),
    countActiveUsersSince(since7d),
    safeCount("api_keys", (q) => q.is("revoked_at", null)),
    buildRequestSparkline7d(),
    buildModelTop10(),
    fetchRecentErrors(),
  ]);

  const failedRequests: SafeCountResult = {
    value:
      totalRequests.value != null && successfulRequests.value != null
        ? Math.max(0, totalRequests.value - successfulRequests.value)
        : null,
  };

  collectWarning(warnings, totalUsers);
  collectWarning(warnings, adminUserCount);
  collectWarning(warnings, todayNewUsers);
  collectWarning(warnings, last7dNewUsers);
  collectWarning(warnings, last30dNewUsers);
  collectWarning(warnings, totalCreditOrders);
  collectWarning(warnings, paidOrders);
  collectWarning(warnings, pendingOrders);
  collectWarning(warnings, rechargeAmount);
  collectWarning(warnings, totalRequests);
  collectWarning(warnings, successfulRequests);
  collectWarning(warnings, usageAggregate);
  collectWarning(warnings, recentOrdersResult);
  collectWarning(warnings, recentUsersResult);
  collectWarning(warnings, todayRequests);
  collectWarning(warnings, todayCredits);
  collectWarning(warnings, todayRevenue);
  collectWarning(warnings, activeUsers7d);
  collectWarning(warnings, totalApiKeys);
  collectWarning(warnings, sparklineResult);
  collectWarning(warnings, modelTopResult);
  collectWarning(warnings, recentErrorsResult);

  return {
    summary: {
      total_users: totalUsers.value,
      admin_user_count: adminUserCount.value,
      today_new_users: todayNewUsers.value,
      last_7d_new_users: last7dNewUsers.value,
      last_30d_new_users: last30dNewUsers.value,
      user_source: recentUsersResult.user_source,

      total_credit_orders: totalCreditOrders.value,
      paid_orders: paidOrders.value,
      pending_orders: pendingOrders.value,
      total_recharge_amount_cents: rechargeAmount.value,

      total_requests: totalRequests.value,
      successful_requests: successfulRequests.value,
      failed_requests: failedRequests.value,
      has_token_data: usageAggregate.has_token_data,
      total_input_tokens: usageAggregate.total_input_tokens,
      total_output_tokens: usageAggregate.total_output_tokens,
      total_tokens: usageAggregate.total_tokens,
      total_usage_credits: usageAggregate.total_usage_credits,

      recent_orders: recentOrdersResult.orders,
      recent_users: recentUsersResult.users,

      today_requests: todayRequests.value,
      today_credits_consumed: todayCredits.value,
      today_revenue_cents: todayRevenue.value,
      active_users_7d: activeUsers7d.value,
      total_api_keys: totalApiKeys.value,
      error_rate_percent: computeErrorRatePercent(
        totalRequests.value,
        failedRequests.value
      ),
      request_sparkline_7d: sparklineResult.points,
      model_top_10: modelTopResult.rows,
      recent_errors: recentErrorsResult.errors,

      updated_at: new Date().toISOString(),
    },
    warnings,
  };
}
