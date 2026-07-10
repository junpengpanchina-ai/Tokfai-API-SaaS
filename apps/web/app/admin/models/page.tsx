import { redirect } from "next/navigation";

import { AdminModelsPageIntro } from "@/components/admin/admin-models-page-intro";
import { AdminModelsManagePanel } from "@/components/admin/admin-models-manage-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Models & pricing",
};

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/models");
  }

  return (
    <>
      <AdminModelsPageIntro />
      <AdminModelsManagePanel />
    </>
  );
}
