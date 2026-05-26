import { redirect } from "next/navigation";

import {
  DashboardOverviewContent,
  type OverviewStat,
} from "@/components/dashboard-overview-content";
import { formatCredits, formatInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

const PROFILE_COLUMNS = "id, email, credits_balance";

export default async function DashboardOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [profileRes, apiKeysRes, usageRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null),
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since24h),
  ]);

  const profile = (profileRes.data ?? null) as Pick<
    ProfileRow,
    "id" | "email" | "credits_balance"
  > | null;
  const profileMissing = !profileRes.error && !profile;
  const activeApiKeyCount = apiKeysRes.count ?? 0;
  const requestsLast24h = usageRes.count ?? 0;

  const stats: OverviewStat[] = [
    {
      labelKey: "dashboard.overview.creditsRemaining",
      subKey: profileMissing
        ? "dashboard.overview.profileMissing"
        : "dashboard.overview.topUpToStart",
      value: formatCredits(profile?.credits_balance ?? 0),
      href: "/dashboard/credits",
      icon: "credit-card",
    },
    {
      labelKey: "dashboard.overview.requestsLast24h",
      subKey:
        requestsLast24h > 0
          ? "dashboard.overview.recentTraffic"
          : "dashboard.overview.noTrafficYet",
      value: formatInt(requestsLast24h),
      href: "/dashboard/usage",
      icon: "gauge",
    },
    {
      labelKey: "dashboard.overview.activeApiKeys",
      subKey:
        activeApiKeyCount > 0
          ? "dashboard.overview.keysReady"
          : "dashboard.overview.createFirstKey",
      value: formatInt(activeApiKeyCount),
      href: "/dashboard/api-keys",
      icon: "key-round",
    },
  ];

  return <DashboardOverviewContent stats={stats} />;
}
