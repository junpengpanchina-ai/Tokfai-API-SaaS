import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import type { AdminSettingsView } from "@/lib/admin/client";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Settings",
};

export const dynamic = "force-dynamic";

type SettingsResponse = {
  data?: AdminSettingsView;
};

export default async function AdminSettingsPage() {
  noStore();
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin");
  }
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/settings");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/settings");
  }

  let settings: AdminSettingsView | null = null;
  let debug = null;

  try {
    const body = await fetchDmitAdmin<SettingsResponse>(
      `${dmitBaseUrl}/admin/settings`,
      accessToken
    );
    settings = body.data ?? null;
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return <AdminSettingsPanel settings={settings} debug={debug} />;
}
