import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { DashboardOverviewContent } from "@/components/dashboard-overview-content";
import { loadDashboardOverviewData } from "@/lib/dashboard-overview";
import { listPublicAnnouncements } from "@/lib/dmit/server";
import {
  EMPTY_DASHBOARD_OVERVIEW,
  loadDashboardPageSession,
  rethrowIfNextNavigation,
} from "@/lib/dashboard-safe/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  try {
    const { user, error } = await loadDashboardPageSession();

    if (error) {
      let announcements: Awaited<ReturnType<typeof listPublicAnnouncements>> = [];
      try {
        announcements = await listPublicAnnouncements(3);
      } catch (err) {
        console.error("[dashboard-ssr-fail-open]", "dashboard/announcements", err);
      }
      console.info("[dashboard-ssr]", "fallback_render", {
        scope: "dashboard/page",
        reason: error,
      });
      return (
        <DashboardOverviewContent
          overview={EMPTY_DASHBOARD_OVERVIEW}
          announcements={announcements}
        />
      );
    }

    if (!user) {
      redirect(loginPathWithNext("/dashboard"));
    }

    let overview = EMPTY_DASHBOARD_OVERVIEW;
    let announcements: Awaited<ReturnType<typeof listPublicAnnouncements>> = [];

    try {
      [overview, announcements] = await Promise.all([
        loadDashboardOverviewData(user.id),
        listPublicAnnouncements(3),
      ]);
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "dashboard/overview", err);
      try {
        overview = await loadDashboardOverviewData(user.id);
      } catch (inner) {
        console.error("[dashboard-ssr-fail-open]", "dashboard/overview-data", inner);
      }
      try {
        announcements = await listPublicAnnouncements(3);
      } catch (inner) {
        console.error("[dashboard-ssr-fail-open]", "dashboard/announcements", inner);
      }
    }

    return (
      <DashboardOverviewContent
        overview={overview}
        announcements={announcements}
      />
    );
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "dashboard/page", err);
    console.info("[dashboard-ssr]", "fallback_render", {
      scope: "dashboard/page",
      reason: "uncaught",
    });
    return (
      <DashboardOverviewContent
        overview={EMPTY_DASHBOARD_OVERVIEW}
        announcements={[]}
      />
    );
  }
}
