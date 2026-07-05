import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminApiKeysPanel } from "@/components/admin/admin-api-keys-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";
import type { AdminApiKeyRow } from "@/lib/admin/client";

export const metadata = {
  title: "Admin — API Keys",
};

export const dynamic = "force-dynamic";

type ApiKeysResponse = {
  data?: AdminApiKeyRow[];
};

export default async function AdminApiKeysPage() {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/api-keys");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/api-keys");
  }

  let apiKeys: AdminApiKeyRow[] = [];
  let debug = null;

  try {
    const body = await fetchDmitAdmin<ApiKeysResponse>(
      `${dmitBaseUrl}/admin/api-keys`,
      accessToken
    );
    apiKeys = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return <AdminApiKeysPanel apiKeys={apiKeys} debug={debug} />;
}
