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
  let availableModelsCount: number | null = null;
  let rechargePlansCount: number | null = null;
  let imageServiceOk: boolean | null = null;

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

        try {
          const modelsRes = await fetchDmitAdmin<{
            data?: Array<{ enabled?: boolean; visible?: boolean; status?: string }>;
          }>(`${dmitBaseUrl}/admin/models`, accessToken);
          const models = Array.isArray(modelsRes.data) ? modelsRes.data : [];
          availableModelsCount = models.filter((model) => {
            if (model.enabled === false || model.visible === false) return false;
            const status = (model.status ?? "").toLowerCase();
            return status !== "archived" && status !== "disabled";
          }).length;
        } catch {
          availableModelsCount = null;
        }

        try {
          const plansRes = await fetchDmitAdmin<{
            data?: Array<{ enabled?: boolean; archived?: boolean }>;
          }>(`${dmitBaseUrl}/admin/recharge-plans`, accessToken);
          const plans = Array.isArray(plansRes.data) ? plansRes.data : [];
          rechargePlansCount = plans.filter(
            (plan) => plan.enabled !== false && plan.archived !== true
          ).length;
        } catch {
          rechargePlansCount = null;
        }

        try {
          const channelsRes = await fetchDmitAdmin<{
            data?: Array<{ enabled?: boolean; modalities?: string[] }>;
          }>(`${dmitBaseUrl}/admin/channels`, accessToken);
          const channels = Array.isArray(channelsRes.data)
            ? channelsRes.data
            : [];
          imageServiceOk = channels.some(
            (channel) =>
              channel.enabled !== false &&
              Array.isArray(channel.modalities) &&
              channel.modalities.includes("image")
          );
          if (channels.length === 0) {
            imageServiceOk = health?.ok === true;
          }
        } catch {
          imageServiceOk = health?.ok === true ? true : null;
        }
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
      availableModelsCount={availableModelsCount}
      rechargePlansCount={rechargePlansCount}
      imageServiceOk={imageServiceOk}
    />
  );
}
