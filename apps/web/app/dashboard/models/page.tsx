import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Models",
};

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect(loginPathWithNext("/dashboard/models"));
  }

  return <DashboardSafeFallback page="models" />;
}
