import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminOverviewPanel } from "@/components/admin/admin-overview-panel";
import {
  ADMIN_SESSION_EXPIRED,
  fetchDmitAdmin,
  toAdminDebug,
  type AdminDebug,
} from "@/lib/admin/server";
import type { AdminDashboardSummary } from "@/lib/admin/client";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Overview",
};

export const dynamic = "force-dynamic";

type AdminMeResponse = {
  data: {
    is_admin: boolean;
  };
};

type DashboardSummaryResponse = {
  data: AdminDashboardSummary;
  warnings?: string[];
};

type ApiHealth = {
  ok: boolean;
  service?: string;
  now?: string;
  timestamp?: string;
};

async function fetchApiHealth(dmitBaseUrl: string): Promise<ApiHealth | null> {
  try {
    const res = await fetch(`${dmitBaseUrl}/v1/health`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false };
    }
    return (await res.json()) as ApiHealth;
  } catch {
    return { ok: false };
  }
}

export default async function AdminOverviewPage() {
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
    redirect("/login?redirect=/admin/overview");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  const userEmail = user.email ?? null;
  const hasAccessToken = Boolean(accessToken);

  let summary: AdminDashboardSummary | null = null;
  let warnings: string[] = [];
  let debug: AdminDebug | null = null;
  let health: ApiHealth | null = null;

  health = await fetchApiHealth(dmitBaseUrl);

  if (!accessToken) {
    debug = {
      statusCode: "401",
      message: ADMIN_SESSION_EXPIRED,
      dmitBaseUrl,
      hasAccessToken,
      userEmail,
      isForbidden: false,
    };
  } else {
    try {
      const meRes = await fetchDmitAdmin<AdminMeResponse>(
        `${dmitBaseUrl}/admin/me`,
        accessToken
      );

      if (!meRes.data.is_admin) {
        debug = {
          statusCode: "403",
          message: "Your account is not authorized for admin access.",
          dmitBaseUrl,
          hasAccessToken,
          userEmail,
          isForbidden: true,
        };
      } else {
        const summaryRes = await fetchDmitAdmin<DashboardSummaryResponse>(
          `${dmitBaseUrl}/admin/dashboard-summary`,
          accessToken
        );

        summary = summaryRes.data;
        warnings = Array.isArray(summaryRes.warnings) ? summaryRes.warnings : [];
      }
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
      warnings={warnings}
      health={health}
      debug={debug}
    />
  );
}
