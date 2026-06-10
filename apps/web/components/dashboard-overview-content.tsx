"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Coins,
  CreditCard,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  Shield,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import { DashboardAnnouncementsOverview } from "@/components/dashboard-announcements-overview";
import type { PublicAnnouncement } from "@/lib/announcements";
import type { DashboardOverviewData } from "@/lib/dashboard-overview";
import {
  formatCredits,
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  toneForStatus,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type OnboardingCompleteWhen =
  | "creditsBalance"
  | "activeApiKey"
  | "chatPlayground"
  | "imagePlayground";

type OnboardingStepConfig = {
  step: number;
  titleKey: string;
  bodyKey: string;
  buttonKey: string;
  href: string;
  icon: LucideIcon;
  completeWhen?: OnboardingCompleteWhen;
};

const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    step: 1,
    titleKey: "dashboard.overview.onboardingStep1Title",
    bodyKey: "dashboard.overview.onboardingStep1Body",
    buttonKey: "dashboard.overview.goRecharge",
    href: "/pricing",
    icon: CreditCard,
    completeWhen: "creditsBalance",
  },
  {
    step: 2,
    titleKey: "dashboard.overview.onboardingStep2Title",
    bodyKey: "dashboard.overview.onboardingStep2Body",
    buttonKey: "dashboard.overview.goCreate",
    href: "/dashboard/api-keys",
    icon: KeyRound,
    completeWhen: "activeApiKey",
  },
  {
    step: 3,
    titleKey: "dashboard.overview.onboardingStep3Title",
    bodyKey: "dashboard.overview.onboardingStep3Body",
    buttonKey: "dashboard.overview.goView",
    href: "/dashboard/docs",
    icon: BookOpen,
  },
  {
    step: 4,
    titleKey: "dashboard.overview.onboardingStep4Title",
    bodyKey: "dashboard.overview.onboardingStep4Body",
    buttonKey: "dashboard.overview.goTest",
    href: "/dashboard/playground",
    icon: Terminal,
    completeWhen: "chatPlayground",
  },
  {
    step: 5,
    titleKey: "dashboard.overview.onboardingStep5Title",
    bodyKey: "dashboard.overview.onboardingStep5Body",
    buttonKey: "dashboard.overview.goTest",
    href: "/dashboard/image-playground",
    icon: ImageIcon,
    completeWhen: "imagePlayground",
  },
];

const QUICK_LINKS = [
  {
    href: "/dashboard/api-keys",
    labelKey: "nav.apiKeys",
    icon: KeyRound,
  },
  {
    href: "/dashboard/docs",
    labelKey: "nav.docs",
    icon: BookOpen,
  },
  {
    href: "/dashboard/playground",
    labelKey: "nav.playground",
    icon: Terminal,
  },
  {
    href: "/dashboard/image-playground",
    labelKey: "nav.imagePlayground",
    icon: ImageIcon,
  },
  {
    href: "/dashboard/usage",
    labelKey: "nav.usage",
    icon: Activity,
  },
  {
    href: "/dashboard/credits",
    labelKey: "nav.credits",
    icon: CreditCard,
  },
  {
    href: "/pricing",
    labelKey: "nav.pricing",
    icon: LayoutDashboard,
  },
] as const;

const SECURITY_ITEM_KEYS = [
  "dashboard.overview.securityItem1",
  "dashboard.overview.securityItem2",
  "dashboard.overview.securityItem3",
  "dashboard.overview.securityItem4",
] as const;

export function DashboardOverviewContent({
  overview,
  announcements = [],
}: {
  overview: DashboardOverviewData;
  announcements?: PublicAnnouncement[];
}) {
  const { t } = useI18n();

  const statCards = [
    {
      labelKey: "dashboard.overview.creditsBalance",
      subKey: overview.profileMissing
        ? "dashboard.overview.profileMissing"
        : "dashboard.overview.creditsBalanceHint",
      value: formatCredits(overview.creditsBalance),
      href: "/dashboard/credits",
      icon: CreditCard,
    },
    {
      labelKey: "dashboard.overview.activeApiKeys",
      subKey:
        overview.activeApiKeyCount > 0
          ? "dashboard.overview.keysReady"
          : "dashboard.overview.createFirstKey",
      value: formatInt(overview.activeApiKeyCount),
      href: "/dashboard/api-keys",
      icon: KeyRound,
    },
    {
      labelKey: "dashboard.overview.requestsLast7Days",
      subKey:
        overview.requestsLast7Days > 0
          ? "dashboard.overview.recentTraffic"
          : "dashboard.overview.noTrafficYet",
      value: formatInt(overview.requestsLast7Days),
      href: "/dashboard/usage",
      icon: Activity,
    },
    {
      labelKey: "dashboard.overview.creditsConsumedLast7Days",
      subKey:
        overview.creditsConsumedLast7Days > 0
          ? "dashboard.overview.creditsConsumedHint"
          : "dashboard.overview.noConsumptionYet",
      value: formatCredits(overview.creditsConsumedLast7Days),
      href: "/dashboard/credits",
      icon: Coins,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.overview.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("dashboard.overview.subtitle")}
        </p>
      </div>

      <DashboardAnnouncementsOverview announcements={announcements} />

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.overview.onboardingTitle")}</CardTitle>
          <CardDescription>{t("dashboard.overview.onboardingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ONBOARDING_STEPS.map((item) => (
            <OnboardingStep
              key={item.step}
              item={item}
              overview={overview}
              t={t}
            />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.labelKey}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{t(stat.labelKey)}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(stat.subKey)}
                </p>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="mt-3 -ml-2 h-7 px-2 text-xs"
                >
                  <Link href={stat.href}>
                    {t("common.open")}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.overview.quickLinksTitle")}</CardTitle>
          <CardDescription>{t("dashboard.overview.quickLinksDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.href}
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-2 px-4 py-3"
                >
                  <Link href={link.href}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(link.labelKey)}
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.overview.recentActivityTitle")}</CardTitle>
          <CardDescription>
            {t("dashboard.overview.recentActivityDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.recentActivity.length > 0 ? (
            <div className="flex flex-col gap-4">
              <RecentActivityTable rows={overview.recentActivity} t={t} />
              <div className="flex justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/usage">
                    {t("dashboard.overview.viewAllUsage")}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              {t("dashboard.overview.recentActivityEmpty")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 shrink-0" />
            {t("dashboard.overview.securityTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {SECURITY_ITEM_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/dashboard/api-keys">
              {t("dashboard.overview.manageApiKeys")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function isOnboardingStepComplete(
  completeWhen: OnboardingCompleteWhen | undefined,
  overview: DashboardOverviewData
): boolean {
  switch (completeWhen) {
    case "creditsBalance":
      return overview.creditsBalance > 0;
    case "activeApiKey":
      return overview.hasActiveApiKey;
    case "chatPlayground":
      return overview.hasChatPlaygroundSuccess;
    case "imagePlayground":
      return overview.hasImagePlaygroundSuccess;
    default:
      return false;
  }
}

function OnboardingStep({
  item,
  overview,
  t,
}: {
  item: OnboardingStepConfig;
  overview: DashboardOverviewData;
  t: (key: string) => string;
}) {
  const Icon = item.icon;
  const completed = isOnboardingStepComplete(item.completeWhen, overview);

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-4 sm:flex-1">
        <div
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
            completed
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-primary/10 text-primary"
          }`}
        >
          {completed ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            item.step
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {t(item.titleKey)}
            {completed ? (
              <Badge variant="success" className="font-normal">
                {t("dashboard.overview.stepCompleted")}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t(item.bodyKey)}</p>
        </div>
      </div>
      <div className="flex shrink-0 sm:mt-0.5">
        <Button asChild size="sm" variant={completed ? "outline" : "default"}>
          <Link href={item.href}>{t(item.buttonKey)}</Link>
        </Button>
      </div>
    </div>
  );
}

function RecentActivityTable({
  rows,
  t,
}: {
  rows: DashboardOverviewData["recentActivity"];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
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
              {t("dashboard.usage.colStatus")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("dashboard.usage.colTotal")}
            </th>
            <th className="px-4 py-3 font-medium">
              {t("dashboard.usage.colCredits")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-mono text-xs">
                {formatDateTime(row.created_at)}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {row.model ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} t={t} />
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {row.total_tokens != null ? formatInt(row.total_tokens) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {formatActivityCredits(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: string | null;
  t: (key: string) => string;
}) {
  const tone = toneForStatus(status);
  const label =
    tone === "success"
      ? t("dashboard.usage.statusSucceeded")
      : tone === "destructive"
        ? t("dashboard.usage.statusFailed")
        : (status ?? "—");

  return (
    <Badge
      variant={
        tone === "success"
          ? "success"
          : tone === "destructive"
            ? "destructive"
            : "outline"
      }
    >
      {label}
    </Badge>
  );
}

function formatActivityCredits(
  row: DashboardOverviewData["recentActivity"][number]
): string {
  if (toneForStatus(row.status) !== "success") {
    return "—";
  }
  if (row.credits_charged == null || row.credits_charged <= 0) {
    return "—";
  }
  return formatCreditsPrecise(row.credits_charged);
}
