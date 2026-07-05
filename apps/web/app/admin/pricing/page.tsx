import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminPricingPanel } from "@/components/admin/admin-pricing-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import type { AdminPricingRow } from "@/lib/admin/client";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Pricing",
};

export const dynamic = "force-dynamic";

type PricingResponse = {
  data?: AdminPricingRow[];
};

export default async function AdminPricingPage() {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/pricing");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/pricing");
  }

  let pricing: AdminPricingRow[] = [];
  let debug = null;

  try {
    const body = await fetchDmitAdmin<PricingResponse>(
      `${dmitBaseUrl}/admin/pricing`,
      accessToken
    );
    pricing = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return <AdminPricingPanel pricing={pricing} debug={debug} />;
}
