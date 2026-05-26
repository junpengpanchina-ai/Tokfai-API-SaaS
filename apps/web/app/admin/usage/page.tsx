import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  AdminUsageClient,
  type AdminUsageLog,
} from "./admin-usage-client";

export const metadata = {
  title: "Admin — Usage",
};

export const dynamic = "force-dynamic";

type UsageResponse = {
  data?: AdminUsageLog[];
};

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/usage");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/usage");
  }

  let initialLogs: AdminUsageLog[] = [];
  let initialError: string | null = null;

  try {
    const body = await fetchDmitAdmin<UsageResponse>(
      `${dmitBaseUrl}/admin/usage`,
      accessToken
    );
    initialLogs = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    if (error instanceof DmitServerError) {
      initialError =
        error.status === 403
          ? "Your account is not authorized for admin access."
          : error.message;
    } else if (error instanceof Error) {
      initialError = error.message;
    } else {
      initialError = "Usage logs could not be loaded.";
    }
  }

  const initialEmailFilter = (searchParams.email ?? "").trim();

  return (
    <AdminUsageClient
      accessToken={accessToken}
      initialLogs={initialLogs}
      initialError={initialError}
      initialEmailFilter={initialEmailFilter}
    />
  );
}
