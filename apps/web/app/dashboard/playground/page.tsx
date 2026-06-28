import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Playground",
};

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginPathWithNext("/dashboard/playground"));
  }

  return <DashboardSafeFallback page="playground" />;
}
