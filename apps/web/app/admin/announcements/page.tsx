import { redirect } from "next/navigation";

import { AdminAnnouncementsPanel } from "@/components/admin/admin-announcements-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Announcements",
};

export default async function AdminAnnouncementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/announcements");
  }

  return <AdminAnnouncementsPanel />;
}
