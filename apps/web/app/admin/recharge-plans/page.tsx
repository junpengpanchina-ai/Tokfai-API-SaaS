import { redirect } from "next/navigation";

import { AdminRechargePlansPageIntro } from "@/components/admin/admin-recharge-plans-page-intro";
import { AdminRechargePlansPanel } from "@/components/admin/admin-recharge-plans-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Recharge plans",
};

export default async function AdminRechargePlansPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/recharge-plans");
  }

  return (
    <>
      <AdminRechargePlansPageIntro />
      <AdminRechargePlansPanel />
    </>
  );
}
