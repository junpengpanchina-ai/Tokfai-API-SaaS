import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { UsageViewClient } from "@/components/usage-view-client";
import { loadUsagePageData } from "@/lib/usage-page";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Usage",
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/usage");
  }

  const state = await loadUsagePageData(user.id);
  return <UsageViewClient state={state} />;
}
