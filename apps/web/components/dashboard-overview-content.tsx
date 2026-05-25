"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CreditCard,
  Gauge,
  ImageIcon,
  KeyRound,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_BILLING_POLICY,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";

type OverviewStat = {
  labelKey: string;
  subKey: string;
  value: string;
  href: string;
  icon: LucideIcon;
};

type OnboardingStepConfig = {
  step: number;
  titleKey: string;
  bodyKey: string;
  buttonKey: string;
  href: string;
  icon: LucideIcon;
};

const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    step: 1,
    titleKey: "dashboard.overview.createApiKey",
    bodyKey: "dashboard.overview.createApiKeyBody",
    buttonKey: "dashboard.overview.createApiKey",
    href: "/dashboard/api-keys",
    icon: KeyRound,
  },
  {
    step: 2,
    titleKey: "dashboard.overview.tryChatPlayground",
    bodyKey: "dashboard.overview.tryChatPlaygroundBody",
    buttonKey: "dashboard.overview.openChatPlayground",
    href: "/dashboard/playground",
    icon: MessageSquare,
  },
  {
    step: 3,
    titleKey: "dashboard.overview.tryImagePlayground",
    bodyKey: "dashboard.overview.tryImagePlaygroundBody",
    buttonKey: "dashboard.overview.openImagePlayground",
    href: "/dashboard/image-playground",
    icon: ImageIcon,
  },
  {
    step: 4,
    titleKey: "dashboard.overview.reviewUsage",
    bodyKey: "dashboard.overview.reviewUsageBody",
    buttonKey: "dashboard.overview.viewUsage",
    href: "/dashboard/usage",
    icon: Gauge,
  },
  {
    step: 5,
    titleKey: "dashboard.overview.topUpCredits",
    bodyKey: "dashboard.overview.topUpCreditsBody",
    buttonKey: "dashboard.overview.topUpCredits",
    href: "/dashboard/credits",
    icon: CreditCard,
  },
];

const QUICK_REFERENCE = [
  { labelKey: "dashboard.overview.baseUrl", value: TOKFAI_API_BASE_URL },
  { labelKey: "dashboard.overview.apiKeyFormat", value: TOKFAI_API_KEY_FORMAT },
  { labelKey: "dashboard.overview.starter", value: TOKFAI_STARTER_PLAN },
  { labelKey: "dashboard.overview.billing", value: TOKFAI_BILLING_POLICY },
] as const;

export function DashboardOverviewContent({
  stats,
}: {
  stats: OverviewStat[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("dashboard.overview.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("dashboard.overview.subtitle")}
          </p>
        </div>
        <Badge variant="secondary">{t("dashboard.overview.v1Preview")}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.overview.getStarted")}</CardTitle>
          <CardDescription>{t("dashboard.overview.getStartedDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ONBOARDING_STEPS.map((item) => (
            <OnboardingStep key={item.step} item={item} t={t} />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
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
          <CardTitle>{t("dashboard.overview.devQuickRef")}</CardTitle>
          <CardDescription>{t("dashboard.overview.devQuickRefDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y rounded-lg border p-0">
          {QUICK_REFERENCE.map((row) => (
            <div
              key={row.labelKey}
              className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-medium text-foreground">
                {t(row.labelKey)}
              </span>
              <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                {row.value}
              </code>
            </div>
          ))}
          <QuickRefLink
            label={t("nav.models")}
            href="/dashboard/models"
            path="/dashboard/models"
          />
          <QuickRefLink
            label={t("common.chatPlayground")}
            href="/dashboard/playground"
            path="/dashboard/playground"
          />
          <QuickRefLink
            label={t("common.imagePlayground")}
            href="/dashboard/image-playground"
            path="/dashboard/image-playground"
          />
          <QuickRefLink
            label={t("nav.docs")}
            href="/dashboard/docs"
            path="/dashboard/docs"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickRefLink({
  label,
  href,
  path,
}: {
  label: string;
  href: string;
  path: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Link
        href={href}
        className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
      >
        {path}
      </Link>
    </div>
  );
}

function OnboardingStep({
  item,
  t,
}: {
  item: OnboardingStepConfig;
  t: (key: string) => string;
}) {
  const Icon = item.icon;
  let body = t(item.bodyKey);

  if (item.bodyKey === "dashboard.overview.createApiKeyBody") {
    body = formatMessage(body, { format: TOKFAI_API_KEY_FORMAT });
  } else if (item.bodyKey === "dashboard.overview.topUpCreditsBody") {
    body = formatMessage(body, {
      plan: TOKFAI_STARTER_PLAN,
      policy: TOKFAI_BILLING_POLICY,
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-4 sm:flex-1">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {item.step}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {t(item.titleKey)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 sm:mt-0.5">
        <Link href={item.href}>{t(item.buttonKey)}</Link>
      </Button>
    </div>
  );
}

export type { OverviewStat };
