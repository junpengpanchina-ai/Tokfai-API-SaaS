"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCreditBalanceNumber } from "@/lib/format";
import {
  isLowCreditsBalance,
  type DashboardShellCredits,
} from "@/lib/dashboard-shell-credits";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

export function formatShellCreditsAmount(credits: DashboardShellCredits): string {
  if (!credits.loaded) {
    return "—";
  }
  return formatCreditBalanceNumber(credits.balance ?? 0);
}

export function DashboardHeaderCredits({
  credits,
}: {
  credits: DashboardShellCredits;
}) {
  const { t } = useI18n();
  const amount = formatShellCreditsAmount(credits);
  const lowCredits = isLowCreditsBalance(credits);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span className="font-medium text-foreground">
          {formatMessage(t("dashboard.shell.creditsWithBalance"), {
            balance: amount,
          })}
        </span>
        {lowCredits ? (
          <Badge variant="warning" className="font-normal">
            {t("dashboard.shell.lowCredits")}
          </Badge>
        ) : null}
      </div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
      >
        <Link href="/pricing">{t("dashboard.shell.topUp")}</Link>
      </Button>
    </div>
  );
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("dashboard.shell.sidebarCreditsLabel")}
      </p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
        {amount}
      </p>
      {lowCredits ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          {t("dashboard.shell.lowCredits")}
        </p>
      ) : null}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-2 h-8 w-full text-xs"
      >
        <Link href="/pricing">{t("dashboard.shell.topUp")}</Link>
      </Button>
    </div>
  );
}
