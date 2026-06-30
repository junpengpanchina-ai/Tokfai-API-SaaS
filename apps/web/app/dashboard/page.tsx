import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { DashboardOverviewContent } from "@/components/dashboard-overview-content";
import { loadDashboardOverviewData } from "@/lib/dashboard-overview";
import { listPublicAnnouncements } from "@/lib/dmit/server";
import {
  EMPTY_DASHBOARD_OVERVIEW,
  loadDashboardPageSession,
} from "@/lib/dashboard-safe/server-session";

export default async function DashboardOverviewPage() {
  const { user, error } = await loadDashboardPageSession();

  if (error) {
    const announcements = await listPublicAnnouncements(3);
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

  const [overview, announcements] = await Promise.all([
    loadDashboardOverviewData(user.id),
    listPublicAnnouncements(3),
  ]);

  return (
    <DashboardOverviewContent
      overview={overview}
      announcements={announcements}
    />
  );
}
