"use client";

import Link from "next/link";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Cherry,
  KeyRound,
  Rocket,
  Terminal,
} from "lucide-react";

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
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

export interface DashboardFirstRunOnboardingProps {
  /** User has at least one active API key. */
  hasActiveApiKey?: boolean;
  /** Successful chat usage logged (playground or API). */
  hasChatSuccess?: boolean;
  /** At least one request in the last 7 days. */
  hasRecentUsage?: boolean;
  /** `dashboard` hides when complete; `apiKeys` stays until complete. */
  variant?: "dashboard" | "apiKeys";
}

export function isFirstRunOnboardingComplete(props: {
  hasActiveApiKey: boolean;
  hasChatSuccess: boolean;
  hasRecentUsage: boolean;
}): boolean {
  return (
    props.hasActiveApiKey && props.hasChatSuccess && props.hasRecentUsage
  );
}

const HIGHLIGHT_KEYS = [
  "dashboard.firstRun.highlightBaseUrl",
  "dashboard.firstRun.highlightModel",
  "dashboard.firstRun.highlightOneKey",
  "dashboard.firstRun.highlightRequestId",
] as const;

const FLOW_STEP_KEYS = [
  "dashboard.firstRun.flowStep1",
  "dashboard.firstRun.flowStep2",
  "dashboard.firstRun.flowStep3",
  "dashboard.firstRun.flowStep4",
] as const;

export function DashboardFirstRunOnboardingCard({
  hasActiveApiKey = false,
  hasChatSuccess = false,
  hasRecentUsage = false,
  variant = "dashboard",
}: DashboardFirstRunOnboardingProps) {
  const { t } = useI18n();
  const complete = isFirstRunOnboardingComplete({
    hasActiveApiKey,
    hasChatSuccess,
    hasRecentUsage,
  });

  if (complete && variant === "dashboard") {
    return (
      <Card className="border-emerald-300/50 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            {t("dashboard.firstRun.allComplete")}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">
              {t("dashboard.firstRun.checkUsage")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (complete && variant === "apiKeys") {
    return (
      <Card className="border-muted bg-muted/20">
        <CardContent className="py-4 text-sm text-muted-foreground">
          {t("dashboard.firstRun.allComplete")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      id="first-run-onboarding"
      className="border-primary/25 bg-primary/5 shadow-sm"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Rocket className="h-5 w-5 shrink-0 text-primary" />
          {t("dashboard.firstRun.title")}
        </CardTitle>
        <CardDescription>{t("dashboard.firstRun.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {HIGHLIGHT_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                {key === "dashboard.firstRun.highlightBaseUrl"
                  ? formatMessage(t(key), { baseUrl: TOKFAI_API_BASE_URL })
                  : key === "dashboard.firstRun.highlightModel"
                    ? formatMessage(t(key), { model: TOKFAI_RECOMMENDED_MODEL })
                    : t(key)}
              </span>
            </li>
          ))}
        </ul>

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          {FLOW_STEP_KEYS.map((key, index) => {
            const done =
              index === 0
                ? hasActiveApiKey
                : index === 1
                  ? hasChatSuccess
                  : index === 2
                    ? hasActiveApiKey
                    : hasRecentUsage;
            return (
              <li
                key={key}
                className={done ? "text-foreground/80" : undefined}
              >
                {done ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {t(key)}
                  </span>
                ) : (
                  t(key)
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/api-keys#create-api-key">
              <KeyRound className="h-4 w-4" />
              {t("dashboard.firstRun.createApiKey")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/integration-workbench">
              <Terminal className="h-4 w-4" />
              {t("dashboard.firstRun.integrationWorkbench")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#quick-start">
              <Terminal className="h-4 w-4" />
              {t("dashboard.firstRun.quickStart")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/playground">
              <Terminal className="h-4 w-4" />
              {t("dashboard.firstRun.tryPlayground")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#cursor">
              <BookOpen className="h-4 w-4" />
              {t("dashboard.firstRun.cursorGuide")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#cherry-studio">
              <Cherry className="h-4 w-4" />
              {t("dashboard.firstRun.cherryGuide")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">
              <Activity className="h-4 w-4" />
              {t("dashboard.firstRun.checkUsage")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard/docs">
              {t("dashboard.firstRun.viewIntegrationDocs")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
