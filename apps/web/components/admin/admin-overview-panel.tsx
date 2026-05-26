"use client";

import Link from "next/link";
import {
  ArrowRight,
  Coins,
  Cpu,
  ScrollText,
  Users,
} from "lucide-react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import {
  AdminUsageLogsTable,
  type AdminUsageLogRow,
} from "@/components/admin/admin-usage-logs-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDebug } from "@/lib/admin/server";
import { formatCredits, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type AdminSummary = {
  total_users: number;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  total_credits_charged: number;
};

const QUICK_LINKS = [
  {
    href: "/admin/models",
    titleKey: "admin.overview.manageModels",
    descKey: "admin.overview.manageModelsDesc",
    icon: Cpu,
  },
  {
    href: "/admin/usage",
    titleKey: "admin.overview.viewUsageLogs",
    descKey: "admin.overview.viewUsageLogsDesc",
    icon: ScrollText,
  },
  {
    href: "/admin/credits",
    titleKey: "admin.overview.viewCreditsLedger",
    descKey: "admin.overview.viewCreditsLedgerDesc",
    icon: Coins,
  },
  {
    href: "/admin/users",
    titleKey: "admin.overview.viewUsers",
    descKey: "admin.overview.viewUsersDesc",
    icon: Users,
  },
] as const;

export function AdminOverviewPanel({
  summary,
  recentActivity,
  debug,
}: {
  summary: AdminSummary | null;
  recentActivity: AdminUsageLogRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.overview.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.overview.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      {summary ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <AdminStatCard
            label={t("admin.overview.totalUsers")}
            value={formatInt(summary.total_users)}
          />
          <AdminStatCard
            label={t("admin.overview.totalRequests")}
            value={formatInt(summary.total_requests)}
          />
          <AdminStatCard
            label={t("admin.overview.succeeded")}
            value={formatInt(summary.success_requests)}
          />
          <AdminStatCard
            label={t("admin.overview.failed")}
            value={formatInt(summary.failed_requests)}
          />
          <AdminStatCard
            label={t("admin.overview.creditsCharged")}
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
                  {t(link.titleKey)}
                </Link>
              </CardTitle>
              <CardDescription>{t(link.descKey)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("admin.overview.recentActivity")}</CardTitle>
            <CardDescription>{t("admin.overview.recentActivityDesc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/usage">{t("admin.overview.viewAllUsage")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <AdminUsageLogsTable rows={recentActivity} />
        </CardContent>
      </Card>
    </>
  );
}
