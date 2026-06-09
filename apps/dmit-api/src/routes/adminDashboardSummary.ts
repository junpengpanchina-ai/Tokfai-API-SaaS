import { supabase } from "../supabase.js";

const PAGE_SIZE = 1000;
const PAID_ORDER_STATUSES = ["paid", "succeeded", "completed"];

export type AdminDashboardSummary = {
  total_users: number | null;
  total_api_keys: number | null;
  total_recharge_plans: number | null;
  visible_recharge_plans: number | null;
  total_credit_orders: number | null;
  credit_orders_last_24h: number | null;
  credit_orders_last_7d: number | null;
  paid_credit_orders: number | null;
  total_recharge_amount_cents: number;
  credit_ledger_credits_in: number | null;
  total_usage_logs: number | null;
  usage_logs_last_24h: number | null;
  usage_logs_last_7d: number | null;
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

function isoSinceHours(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
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
    lower.includes("relation") && lower.includes("does not exist") ||
    lower.includes("schema cache") && lower.includes("could not find")
  );
}

type CountResponse = {
  count: number | null;
  error: { message: string } | null;
};

type SupabaseCountQuery = {
  is: (column: string, value: null) => SupabaseCountQuery;
  eq: (column: string, value: boolean) => SupabaseCountQuery;
  gte: (column: string, value: string) => SupabaseCountQuery;
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

async function sumCreditLedgerCreditsIn(): Promise<SafeSumResult> {
  try {
    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase()
        .from("credit_ledger")
        .select("amount")
        .gt("amount", 0)
        .range(from, to);

      if (error) {
        return {
          value: null,
          warning: `credit_ledger credits_in sum: ${error.message}`,
        };
      }

      const page = (data ?? []) as Array<{ amount: number | string | null }>;
      total += page.reduce((sum, row) => sum + toNumber(row.amount), 0);

      if (page.length < PAGE_SIZE) break;
    }

    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: null, warning: `credit_ledger credits_in sum: ${message}` };
  }
}

async function sumCreditOrdersAmountCents(): Promise<{
  value: number;
  warning?: string;
}> {
  try {
    const { data, error } = await supabase()
      .from("credit_orders")
      .select("amount_cents")
      .limit(1);

    if (error) {
      if (isMissingColumnError(error.message)) {
        return sumCreditOrdersAmountFromCny();
      }
      if (isMissingTableError(error.message)) {
        return { value: 0, warning: `credit_orders amount sum: ${error.message}` };
      }
      return { value: 0, warning: `credit_orders amount sum: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { value: 0 };
    }

    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data: rows, error: pageError } = await supabase()
        .from("credit_orders")
        .select("amount_cents")
        .range(from, to);

      if (pageError) {
        return {
          value: 0,
          warning: `credit_orders amount_cents sum: ${pageError.message}`,
        };
      }

      const page = (rows ?? []) as Array<{ amount_cents: number | null }>;
      total += page.reduce((sum, row) => sum + toNumber(row.amount_cents), 0);

      if (page.length < PAGE_SIZE) break;
    }

    return { value: total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: 0, warning: `credit_orders amount sum: ${message}` };
  }
}

async function sumCreditOrdersAmountFromCny(): Promise<{
  value: number;
  warning?: string;
}> {
  try {
    const { data, error } = await supabase()
      .from("credit_orders")
      .select("amount_cny")
      .limit(1);

    if (error) {
      if (isMissingColumnError(error.message)) {
        return { value: 0 };
      }
      return { value: 0, warning: `credit_orders amount_cny sum: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { value: 0 };
    }

    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data: rows, error: pageError } = await supabase()
        .from("credit_orders")
        .select("amount_cny")
        .range(from, to);

      if (pageError) {
        return {
          value: 0,
          warning: `credit_orders amount_cny sum: ${pageError.message}`,
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
    return { value: 0, warning: `credit_orders amount_cny sum: ${message}` };
  }
}

async function countPaidCreditOrders(): Promise<SafeCountResult> {
  try {
    const { count, error } = await supabase()
      .from("credit_orders")
      .select("id", { count: "exact", head: true })
      .in("status", PAID_ORDER_STATUSES);

    if (error) {
      if (isMissingColumnError(error.message)) {
        return { value: null };
      }
      return {
        value: null,
        warning: `credit_orders paid count: ${error.message}`,
      };
    }

    return { value: count ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: null, warning: `credit_orders paid count: ${message}` };
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

export async function buildAdminDashboardSummary(): Promise<{
  summary: AdminDashboardSummary;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const since24h = isoSinceHours(24);
  const since7d = isoSinceDays(7);

  const [
    totalUsers,
    totalApiKeys,
    totalRechargePlans,
    visibleRechargePlans,
    totalCreditOrders,
    creditOrders24h,
    creditOrders7d,
    paidCreditOrders,
    rechargeAmount,
    ledgerCreditsIn,
    totalUsageLogs,
    usageLogs24h,
    usageLogs7d,
  ] = await Promise.all([
    safeCount("profiles"),
    safeCount("api_keys"),
    safeCount("recharge_plans", (q) => q.is("archived_at", null)),
    safeCount("recharge_plans", (q) =>
      q.is("archived_at", null).eq("enabled", true).eq("visible", true)
    ),
    safeCount("credit_orders"),
    safeCount("credit_orders", (q) => q.gte("created_at", since24h)),
    safeCount("credit_orders", (q) => q.gte("created_at", since7d)),
    countPaidCreditOrders(),
    sumCreditOrdersAmountCents(),
    sumCreditLedgerCreditsIn(),
    safeCount("usage_logs"),
    safeCount("usage_logs", (q) => q.gte("created_at", since24h)),
    safeCount("usage_logs", (q) => q.gte("created_at", since7d)),
  ]);

  collectWarning(warnings, totalUsers);
  collectWarning(warnings, totalApiKeys);
  collectWarning(warnings, totalRechargePlans);
  collectWarning(warnings, visibleRechargePlans);
  collectWarning(warnings, totalCreditOrders);
  collectWarning(warnings, creditOrders24h);
  collectWarning(warnings, creditOrders7d);
  collectWarning(warnings, paidCreditOrders);
  collectWarning(warnings, rechargeAmount);
  collectWarning(warnings, ledgerCreditsIn);
  collectWarning(warnings, totalUsageLogs);
  collectWarning(warnings, usageLogs24h);
  collectWarning(warnings, usageLogs7d);

  return {
    summary: {
      total_users: totalUsers.value,
      total_api_keys: totalApiKeys.value,
      total_recharge_plans: totalRechargePlans.value,
      visible_recharge_plans: visibleRechargePlans.value,
      total_credit_orders: totalCreditOrders.value,
      credit_orders_last_24h: creditOrders24h.value,
      credit_orders_last_7d: creditOrders7d.value,
      paid_credit_orders: paidCreditOrders.value,
      total_recharge_amount_cents: rechargeAmount.value,
      credit_ledger_credits_in: ledgerCreditsIn.value,
      total_usage_logs: totalUsageLogs.value,
      usage_logs_last_24h: usageLogs24h.value,
      usage_logs_last_7d: usageLogs7d.value,
      updated_at: new Date().toISOString(),
    },
    warnings,
  };
}
