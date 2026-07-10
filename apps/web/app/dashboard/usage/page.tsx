import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { UsageViewClient } from "@/components/usage-view-client";
import { loadUsagePageData } from "@/lib/usage-page";
import {
  EMPTY_USAGE_PAGE_STATE,
  loadDashboardPageSession,
  rethrowIfNextNavigation,
} from "@/lib/dashboard-safe/server-session";

export const metadata = {
  title: "Usage",
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  noStore();

  try {
    const { user, error } = await loadDashboardPageSession();

    if (error) {
      return <UsageViewClient state={EMPTY_USAGE_PAGE_STATE} />;
    }

    if (!user) {
      redirect(loginPathWithNext("/dashboard/usage"));
    }

    let state = EMPTY_USAGE_PAGE_STATE;
    try {
      state = await loadUsagePageData(user.id);
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "usage/loadUsagePageData", err);
    }

    return <UsageViewClient state={state} />;
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "usage/page", err);
    return <UsageViewClient state={EMPTY_USAGE_PAGE_STATE} />;
  }
}
