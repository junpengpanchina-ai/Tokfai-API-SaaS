import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Coins,
  Cpu,
  ScrollText,
  Users,
} from "lucide-react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminUsageLogsTable } from "@/components/admin/admin-usage-logs-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchDmitAdmin,
  toAdminDebug,
  type AdminDebug,
} from "@/lib/admin/server";
import { formatCredits, formatInt } from "@/lib/format";
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

const QUICK_LINKS = [
  {
    href: "/admin/models",
    title: "Manage models",
    description: "Catalog pricing overview and model directory.",
    icon: Cpu,
  },
  {
    href: "/admin/usage",
    title: "View usage logs",
    description: "Full request history across all accounts.",
    icon: ScrollText,
  },
  {
    href: "/admin/credits",
    title: "View credits ledger",
    description: "Balances and ledger entries by user.",
    icon: Coins,
  },
  {
    href: "/admin/users",
    title: "View users",
    description: "Account overview and activity signals.",
    icon: Users,
  },
] as const;

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

  const recentActivity = usageLogs.slice(0, 5);

  return (
    <>
      <div>
        <Badge variant="secondary">Admin tools</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Tokfai Admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal operations dashboard. Read-only controls in this phase.
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      {summary ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <AdminStatCard
            label="Total users"
            value={formatInt(summary.total_users)}
          />
          <AdminStatCard
            label="Total requests"
            value={formatInt(summary.total_requests)}
          />
          <AdminStatCard
            label="Succeeded"
            value={formatInt(summary.success_requests)}
          />
          <AdminStatCard
            label="Failed"
            value={formatInt(summary.failed_requests)}
          />
          <AdminStatCard
            label="Credits charged"
            value={formatCredits(summary.total_credits_charged)}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Card key={link.href} className="transition-colors hover:bg-muted/30">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <link.icon className="h-5 w-5 text-muted-foreground" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">
                <Link href={link.href} className="hover:underline">
                  {link.title}
                </Link>
              </CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Latest requests across all users (preview).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/usage">View all usage</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <AdminUsageLogsTable rows={recentActivity} />
        </CardContent>
      </Card>
    </>
  );
}
