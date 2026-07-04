import { DashboardAnnouncementsList } from "@/components/dashboard-announcements-list";
import { listPublicAnnouncements } from "@/lib/dmit/server";

export const metadata = {
  title: "Announcements",
};

export const dynamic = "force-dynamic";

export default async function DashboardAnnouncementsPage() {
  try {
    const announcements = await listPublicAnnouncements(50);
    return <DashboardAnnouncementsList announcements={announcements} />;
  } catch (err) {
    console.error("[dashboard-ssr-fail-open]", "announcements/page", err);
    return <DashboardAnnouncementsList announcements={[]} />;
  }
}
