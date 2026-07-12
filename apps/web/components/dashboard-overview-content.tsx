"use client";

import Link from "next/link";
import {
  Activity,
  Coins,
  CreditCard,
  ImageIcon,
  KeyRound,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import { DashboardAnnouncementsOverview } from "@/components/dashboard-announcements-overview";
import type { PublicAnnouncement } from "@/lib/dashboard-safe/dtos/announcements";
import type { DashboardOverviewData } from "@/lib/dashboard-safe/dtos/overview";
import {
  normalizeDashboardOverview,
  normalizePublicAnnouncements,
} from "@/lib/dashboard-safe/normalize-dashboard-data";
import {
  dashboardFormatCreditsWithSuffix,
  dashboardFormatDate,
  dashboardFormatInt,
  dashboardGetModelLabel,
} from "@/lib/dashboard-safe/display-helpers";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardOverviewContent({
  overview,
  announcements,
}: {
  overview: DashboardOverviewData | null | undefined;
  announcements?: PublicAnnouncement[] | unknown;
}) {
  const { t } = useDashboardLabels();
  const safeOverview = normalizeDashboardOverview(overview);
  const safeAnnouncements = normalizePublicAnnouncements(announcements);

  const statCards = [
    {
      labelKey: "dashboard.overview.creditsBalance",
      value: dashboardFormatCreditsWithSuffix(safeOverview.creditsBalance),
      icon: CreditCard,
    },
    {
      labelKey: "dashboard.overview.creditsConsumedLast7Days",
      value: dashboardFormatCreditsWithSuffix(
        safeOverview.creditsConsumedLast7Days
      ),
      icon: Coins,
    },
    {
      labelKey: "dashboard.overview.activeApiKeys",
      value: dashboardFormatInt(safeOverview.activeApiKeyCount),
      icon: KeyRound,
    },
    {
      labelKey: "dashboard.overview.requestsLast7Days",
      value: dashboardFormatInt(safeOverview.requestsLast7Days),
      icon: Activity,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.overview.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("dashboard.overview.subtitle")}
        </p>
      </div>

      {/* 2. Account status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.overview.accountStatusTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.labelKey}
                  className="rounded-md border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t(stat.labelKey)}
                    </p>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/pricing" prefetch={false}>
                {t("dashboard.overview.goTopUp")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/usage" prefetch={false}>
                {t("dashboard.overview.goUsage")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/api-keys" prefetch={false}>
                {t("dashboard.overview.goManageKeys")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Get started */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.overview.continueTitle")}
          </CardTitle>
          <CardDescription>
            {t("dashboard.overview.continueDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StartAction
              href="/dashboard/playground"
              icon={Terminal}
              label={t("dashboard.overview.startChat")}
            />
            <StartAction
              href="/dashboard/image-playground"
              icon={ImageIcon}
              label={t("dashboard.overview.startImage")}
            />
            <StartAction
              href="/dashboard/docs#cherry-studio"
              icon={Sparkles}
              label={t("dashboard.overview.startCherry")}
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Recent usage */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.overview.recentUsageTitle")}</CardTitle>
          <CardDescription>
            {t("dashboard.overview.recentUsageDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentUsageTable overview={safeOverview} t={t} />
        </CardContent>
      </Card>

      {/* Light announcements footer */}
      {safeAnnouncements.length > 0 ? (
        <div className="border-t pt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("dashboard.overview.announcementsHint")}
            </p>
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Link href="/dashboard/announcements" prefetch={false}>
                {t("dashboard.overview.viewAllAnnouncements")}
              </Link>
            </Button>
          </div>
          <DashboardAnnouncementsOverview announcements={safeAnnouncements} />
        </div>
      ) : null}
    </div>
  );
}

function StartAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className="h-auto justify-start gap-3 px-4 py-4 text-left"
    >
      <Link href={href} prefetch={false}>
        <Icon className="h-5 w-5 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </Link>
    </Button>
  );
}

function RecentUsageTable({
  overview,
  t,
}: {
  overview: DashboardOverviewData;
  t: (key: string) => string;
}) {
  const rows = Array.isArray(overview.recentActivity)
    ? overview.recentActivity
    : [];

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          {t("dashboard.overview.recentActivityEmpty")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/playground" prefetch={false}>
              {t("dashboard.overview.startChat")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/image-playground" prefetch={false}>
              {t("dashboard.overview.startImage")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto rounded-md border px-1">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">
                {t("dashboard.usage.colWhen")}
              </th>
              <th className="px-4 py-3 font-medium">
                {t("dashboard.usage.colModel")}
              </th>
              <th className="px-4 py-3 font-medium">
                {t("dashboard.overview.colType")}
              </th>
              <th className="px-4 py-3 font-medium">
                {t("dashboard.usage.colCredits")}
              </th>
              <th className="px-4 py-3 font-medium">
                {t("dashboard.overview.colRequestId")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id || `activity-row-${index}`}
                className="border-b last:border-0"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {dashboardFormatDate(row.created_at)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {dashboardGetModelLabel(row.model)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="font-normal">
                    {row.kind === "image"
                      ? t("dashboard.overview.typeImage")
                      : t("dashboard.overview.typeChat")}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {dashboardFormatCreditsWithSuffix(row.credits_charged)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {row.request_id ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/usage" prefetch={false}>
            {t("dashboard.overview.viewAllUsage")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
