import { DashboardAnnouncementsList } from "@/components/dashboard-announcements-list";
import { listPublicAnnouncements } from "@/lib/dmit/server";

export const metadata = {
  title: "Announcements",
};

export default async function DashboardAnnouncementsPage() {
  const announcements = await listPublicAnnouncements(50);

  return <DashboardAnnouncementsList announcements={announcements} />;
}
