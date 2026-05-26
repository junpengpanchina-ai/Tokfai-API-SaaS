import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { isAdminEmail } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
