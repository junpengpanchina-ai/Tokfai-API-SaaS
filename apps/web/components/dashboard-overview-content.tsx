"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Coins,
  CreditCard,
  ImageIcon,
  KeyRound,
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

type UserPhase = "needsCredits" | "needsApiKey" | "needsFirstCall" | "returning";

type OnboardingStepStatus = "completed" | "current" | "upcoming";

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

const CONTINUE_LINKS = [
  {
    href: "/dashboard/playground",
    labelKey: "common.chatPlayground",
    icon: Terminal,
  },
  {
    href: "/dashboard/image-playground",
    labelKey: "common.imagePlayground",
    icon: ImageIcon,
  },
  { href: "/dashboard/usage", labelKey: "nav.usage", icon: Activity },
  { href: "/dashboard/credits", labelKey: "nav.credits", icon: CreditCard },
  { href: "/dashboard/models", labelKey: "nav.models", icon: Boxes },
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
  const phase = getUserPhase(overview);
  const isReturning = phase === "returning";
  const allOnboardingComplete = ONBOARDING_STEPS.every((step) =>
    isOnboardingStepComplete(step, overview)
  );

  const statCards = [
    {
      labelKey: "dashboard.overview.creditsBalance",
      subKey: overview.profileMissing
        ? "dashboard.overview.profileMissing"
        : overview.creditsBalance <= 0
          ? "dashboard.overview.topUpToStart"
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.overview.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t(
            isReturning
              ? "dashboard.overview.subtitleReturning"
              : "dashboard.overview.subtitle"
          )}
        </p>
      </div>

      <DashboardAnnouncementsOverview announcements={announcements} />

      {!isReturning ? <StatePriorityBanner phase={phase} t={t} /> : null}

      <ContinueCard t={t} emphasize={isReturning} />

      {isReturning ? (
        <>
          <StatCards statCards={statCards} t={t} />
          <RecentActivityCard overview={overview} t={t} />
          <OnboardingSection
            overview={overview}
            isReturning
            allComplete={allOnboardingComplete}
            t={t}
          />
        </>
      ) : (
        <>
          <OnboardingSection
            overview={overview}
            isReturning={false}
            allComplete={allOnboardingComplete}
            t={t}
          />
          <StatCards statCards={statCards} t={t} />
          <RecentActivityCard overview={overview} t={t} />
        </>
      )}

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

function getUserPhase(overview: DashboardOverviewData): UserPhase {
  if (overview.creditsBalance <= 0) return "needsCredits";
  if (!overview.hasActiveApiKey) return "needsApiKey";
  if (
    !overview.hasChatPlaygroundSuccess &&
    !overview.hasImagePlaygroundSuccess
  ) {
    return "needsFirstCall";
  }
  return "returning";
}

function isOnboardingStepComplete(
  item: OnboardingStepConfig,
  overview: DashboardOverviewData
): boolean {
  if (item.completeWhen) {
    return isCompleteByFlag(item.completeWhen, overview);
  }
  if (item.step === 3) {
    return (
      overview.hasChatPlaygroundSuccess || overview.hasImagePlaygroundSuccess
    );
  }
  return false;
}

function isCompleteByFlag(
  completeWhen: OnboardingCompleteWhen,
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

function getOnboardingStepStatus(
  item: OnboardingStepConfig,
  overview: DashboardOverviewData
): OnboardingStepStatus {
  if (isOnboardingStepComplete(item, overview)) return "completed";
  const firstIncomplete = ONBOARDING_STEPS.find(
    (step) => !isOnboardingStepComplete(step, overview)
  );
  if (firstIncomplete?.step === item.step) return "current";
  return "upcoming";
}

function StatePriorityBanner({
  phase,
  t,
}: {
  phase: Exclude<UserPhase, "returning">;
  t: (key: string) => string;
}) {
  const config = {
    needsCredits: {
      titleKey: "dashboard.overview.stateNeedsCreditsTitle",
      bodyKey: "dashboard.overview.stateNeedsCreditsBody",
      actionKey: "dashboard.overview.stateNeedsCreditsAction",
      href: "/pricing",
    },
    needsApiKey: {
      titleKey: "dashboard.overview.stateNeedsApiKeyTitle",
      bodyKey: "dashboard.overview.stateNeedsApiKeyBody",
      actionKey: "dashboard.overview.stateNeedsApiKeyAction",
      href: "/dashboard/api-keys",
    },
    needsFirstCall: {
      titleKey: "dashboard.overview.stateNeedsFirstCallTitle",
      bodyKey: "dashboard.overview.stateNeedsFirstCallBody",
      actionKey: null,
      href: null,
    },
  }[phase];

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t(config.titleKey)}</CardTitle>
        <CardDescription>{t(config.bodyKey)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {phase === "needsFirstCall" ? (
          <>
            <Button asChild size="sm">
              <Link href="/dashboard/docs">
                {t("dashboard.overview.stateNeedsFirstCallQuickstart")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/playground">
                {t("dashboard.overview.stateNeedsFirstCallPlayground")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/image-playground">
                {t("common.imagePlayground")}
              </Link>
            </Button>
          </>
        ) : config.href && config.actionKey ? (
          <Button asChild size="sm">
            <Link href={config.href}>{t(config.actionKey)}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContinueCard({
  t,
  emphasize,
}: {
  t: (key: string) => string;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-primary/20 shadow-sm" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("dashboard.overview.continueTitle")}
        </CardTitle>
        <CardDescription>{t("dashboard.overview.continueDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CONTINUE_LINKS.map((link) => {
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
  );
}

function OnboardingSection({
  overview,
  isReturning,
  allComplete,
  t,
}: {
  overview: DashboardOverviewData;
  isReturning: boolean;
  allComplete: boolean;
  t: (key: string) => string;
}) {
  if (isReturning && allComplete) {
    return (
      <Card className="border-muted bg-muted/20">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("dashboard.overview.onboardingAllComplete")}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">
              {t("dashboard.overview.recentActivityViewUsage")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const incompleteSteps = ONBOARDING_STEPS.filter(
    (step) => !isOnboardingStepComplete(step, overview)
  );
  const stepsToShow =
    isReturning && incompleteSteps.length > 0
      ? incompleteSteps
      : ONBOARDING_STEPS;

  return (
    <Card className={isReturning ? "border-muted bg-muted/20" : undefined}>
      <CardHeader>
        <CardTitle className={isReturning ? "text-base" : undefined}>
          {t(
            isReturning
              ? "dashboard.overview.onboardingTitleReturning"
              : "dashboard.overview.onboardingTitle"
          )}
        </CardTitle>
        <CardDescription>
          {t(
            isReturning
              ? "dashboard.overview.onboardingDescReturning"
              : "dashboard.overview.onboardingDesc"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stepsToShow.map((item) => (
          <OnboardingStep
            key={item.step}
            item={item}
            overview={overview}
            t={t}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function StatCards({
  statCards,
  t,
}: {
  statCards: ReadonlyArray<{
    labelKey: string;
    subKey: string;
    value: string;
    href: string;
    icon: LucideIcon;
  }>;
  t: (key: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
  );
}

function RecentActivityCard({
  overview,
  t,
}: {
  overview: DashboardOverviewData;
  t: (key: string) => string;
}) {
  const hasSuccessfulActivity = overview.recentActivity.some(
    (row) => toneForStatus(row.status) === "success"
  );

  return (
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
            <div className="flex flex-wrap justify-end gap-2">
              {hasSuccessfulActivity ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/usage">
                      {t("dashboard.overview.recentActivityViewUsage")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/credits">
                      {t("dashboard.overview.recentActivityViewCredits")}
                    </Link>
                  </Button>
                </>
              ) : null}
              <Button asChild size="sm" variant="ghost">
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
  );
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
  const status = getOnboardingStepStatus(item, overview);
  const completed = status === "completed";

  return (
    <div
      className={`flex min-w-0 flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-start ${
        status === "current"
          ? "border-primary/40 ring-1 ring-primary/10"
          : status === "completed"
            ? "opacity-80"
            : ""
      }`}
    >
      <div className="flex items-start gap-4 sm:flex-1">
        <div
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
            completed
              ? "bg-emerald-500/10 text-emerald-700"
              : status === "current"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
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
            {status === "completed" ? (
              <Badge variant="success" className="font-normal">
                {t("dashboard.overview.stepCompleted")}
              </Badge>
            ) : status === "current" ? (
              <Badge variant="default" className="font-normal">
                {t("dashboard.overview.stepCurrent")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="font-normal">
                {t("dashboard.overview.stepNext")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t(item.bodyKey)}</p>
        </div>
      </div>
      <div className="flex shrink-0 sm:mt-0.5">
        <Button
          asChild
          size="sm"
          variant={status === "current" ? "default" : "outline"}
          className="w-full sm:w-auto"
        >
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
