import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminDocsPanel } from "@/components/admin/admin-docs-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Docs",
};

export const dynamic = "force-dynamic";

export default async function AdminDocsPage() {
  noStore();
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin/docs");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirect=/admin/docs");
  }

  return <AdminDocsPanel />;
}
