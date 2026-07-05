import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminChannelsPanel } from "@/components/admin/admin-channels-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import type { AdminChannelRow } from "@/lib/admin/client";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Channels",
};

export const dynamic = "force-dynamic";

type ChannelsResponse = {
  data?: AdminChannelRow[];
};

export default async function AdminChannelsPage() {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/channels");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/channels");
  }

  let channels: AdminChannelRow[] = [];
  let debug = null;

  try {
    const body = await fetchDmitAdmin<ChannelsResponse>(
      `${dmitBaseUrl}/admin/channels`,
      accessToken
    );
    channels = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return <AdminChannelsPanel channels={channels} debug={debug} />;
}
