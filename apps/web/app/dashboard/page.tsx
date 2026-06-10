import { redirect } from "next/navigation";

import { DashboardOverviewContent } from "@/components/dashboard-overview-content";
import { loadDashboardOverviewData } from "@/lib/dashboard-overview";
import { listPublicAnnouncements } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
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
