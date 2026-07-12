import type { ProfileRow, UsageLogRow } from "@/lib/supabase/types";
import {
  dashboardGetUsageKind,
  dashboardUsageStatusTone,
} from "@/lib/dashboard-display-helpers";
import type {
  DashboardOverviewActivity,
  DashboardOverviewData,
} from "@/lib/dashboard-overview-types";
import {
  EMPTY_DASHBOARD_OVERVIEW,
  tryCreateServerClient,
} from "@/lib/dashboard-safe/server-session";

export type {
  DashboardOverviewActivity,
  DashboardOverviewData,
} from "@/lib/dashboard-overview-types";

const RECENT_ACTIVITY_LIMIT = 5;

type DebitRow = { amount: number | string | null };

export async function loadDashboardOverviewData(
  userId: string
): Promise<DashboardOverviewData> {
  const supabase = tryCreateServerClient();
  if (!supabase) {
    return EMPTY_DASHBOARD_OVERVIEW;
  }

  try {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    profileRes,
    apiKeysRes,
    usageCountRes,
    ledgerDebitsRes,
    recentRes,
    successUsageRes,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, credits_balance")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("revoked_at", null),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("credit_ledger")
        .select("amount")
        .eq("user_id", userId)
        .lt("amount", 0)
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("usage_logs")
        .select(
          "id, created_at, model, status, total_tokens, credits_charged, request_id"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(RECENT_ACTIVITY_LIMIT),
      supabase
        .from("usage_logs")
        .select("model, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const profile = profileRes.error
    ? null
    : (profileRes.data as Pick<ProfileRow, "credits_balance"> | null);
  const activeApiKeyCount = apiKeysRes.error ? 0 : (apiKeysRes.count ?? 0);

  const creditsBalance =
    profile?.credits_balance != null ? toNumber(profile.credits_balance) : 0;
  const playgroundFlags = derivePlaygroundSuccessFlags(
    successUsageRes.error ? [] : (successUsageRes.data ?? [])
  );

  return {
    creditsBalance,
    activeApiKeyCount,
    requestsLast7Days: usageCountRes.error ? 0 : (usageCountRes.count ?? 0),
    creditsConsumedLast7Days: ledgerDebitsRes.error
      ? 0
      : sumDebitAmounts(ledgerDebitsRes.data ?? []),
    hasActiveApiKey: activeApiKeyCount > 0,
    hasChatPlaygroundSuccess: playgroundFlags.hasChatPlaygroundSuccess,
    hasImagePlaygroundSuccess: playgroundFlags.hasImagePlaygroundSuccess,
    recentActivity: recentRes.error
      ? []
      : mapRecentActivity((recentRes.data ?? []) as UsageLogRow[]),
    profileMissing: !profileRes.error && !profileRes.data,
  };
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardOverviewData", error);
    return EMPTY_DASHBOARD_OVERVIEW;
  }
}

function derivePlaygroundSuccessFlags(
  rows: Array<{ model: string | null; status: string | null }>
): {
  hasChatPlaygroundSuccess: boolean;
  hasImagePlaygroundSuccess: boolean;
} {
  let hasChatPlaygroundSuccess = false;
  let hasImagePlaygroundSuccess = false;

  for (const row of rows) {
    if (dashboardUsageStatusTone(row.status) !== "success") continue;
    const kind = dashboardGetUsageKind(row.model);
    if (kind === "chat") hasChatPlaygroundSuccess = true;
    if (kind === "image") hasImagePlaygroundSuccess = true;
  }

  return { hasChatPlaygroundSuccess, hasImagePlaygroundSuccess };
}

function mapRecentActivity(rows: UsageLogRow[]): DashboardOverviewActivity[] {
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    model: row.model,
    status: row.status,
    total_tokens: row.total_tokens,
    credits_charged:
      row.credits_charged != null ? toNumber(row.credits_charged) : null,
    request_id: row.request_id ?? null,
    kind: dashboardGetUsageKind(row.model),
  }));
}

function sumDebitAmounts(rows: DebitRow[]): number {
  let total = 0;
  for (const row of rows) {
    const amount = row.amount != null ? toNumber(row.amount) : 0;
    if (amount < 0) {
      total += Math.abs(amount);
    }
  }
  return total;
}

function toNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
