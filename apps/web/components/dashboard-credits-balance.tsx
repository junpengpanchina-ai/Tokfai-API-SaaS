"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  dashboardShellFormatCreditBalance,
} from "@/lib/dashboard-shell-format";
import {
  isLowCreditsBalance,
  type DashboardShellCredits,
} from "@/lib/dashboard-shell-credits";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function formatShellCreditsAmount(credits: DashboardShellCredits): string {
  if (!credits.loaded) {
    return "—";
  }
  return dashboardShellFormatCreditBalance(credits.balance ?? 0);
}

export function DashboardSidebarCreditsSummary({
  credits,
}: {
  credits: DashboardShellCredits;
}) {
  const { t } = useI18n();
  const amount = formatShellCreditsAmount(credits);
  const lowCredits = isLowCreditsBalance(credits);

  return (
    <div className="rounded-md border bg-background/80 p-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("dashboard.shell.sidebarCreditsLabel")}
        </p>
        {lowCredits ? (
          <Badge variant="warning" className="font-normal">
            {t("dashboard.shell.lowCredits")}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
        {amount}
      </p>
      {lowCredits ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-2 h-8 w-full text-xs"
        >
          <Link href="/dashboard/credits" prefetch={false}>
            {t("dashboard.shell.topUp")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
