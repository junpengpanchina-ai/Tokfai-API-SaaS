import { redirect } from "next/navigation";

import { AdminOverviewPanel } from "@/components/admin/admin-overview-panel";
import {
  fetchDmitAdmin,
  toAdminDebug,
  type AdminDebug,
} from "@/lib/admin/server";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Overview",
};

type AdminSummary = {
  total_users: number;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  total_credits_charged: number;
};

type AdminUsageLog = {
  id: string;
  email: string | null;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  created_at: string | null;
};

type SummaryResponse = {
  data: {
    summary: AdminSummary;
    usage_logs: AdminUsageLog[];
  };
};

export default async function AdminPage() {
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  const userEmail = user.email ?? null;
  const hasAccessToken = Boolean(accessToken);

  let summary: AdminSummary | null = null;
  let usageLogs: AdminUsageLog[] = [];
  let debug: AdminDebug | null = null;

  if (!accessToken) {
    debug = {
      statusCode: "401",
      message: "missing session token",
      dmitBaseUrl,
      hasAccessToken,
      userEmail,
      isForbidden: false,
    };
  } else {
    try {
      const summaryRes = await fetchDmitAdmin<SummaryResponse>(
        `${dmitBaseUrl}/admin/summary`,
        accessToken
      );

      summary = summaryRes.data.summary;
      usageLogs = summaryRes.data.usage_logs;
    } catch (error) {
      debug = toAdminDebug(error, {
        dmitBaseUrl,
        hasAccessToken,
        userEmail,
      });
    }
  }

  return (
    <AdminOverviewPanel
      summary={summary}
      recentActivity={usageLogs.slice(0, 5)}
      debug={debug}
    />
  );
}
