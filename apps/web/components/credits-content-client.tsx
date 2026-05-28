"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
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
import type { BillingRechargePlan, MeCreditLedgerEntry, MeCredits } from "@/lib/dmit/server";
import { formatCredits, formatDateTime } from "@/lib/format";

import { CreditsTopUpClient } from "@/app/dashboard/credits/credits-top-up-client";

type CreditsLoadErrorKind = "auth" | "temporary";

interface CreditsRequestDebug {
  endpoint: string;
  url: string;
  status: number | null;
  code: string | null;
  message: string | null;
}

export interface CreditsLoadState {
  profile: MeCredits | null;
  ledger: MeCreditLedgerEntry[];
  plans: BillingRechargePlan[];
  plansError: string | null;
  error: CreditsLoadErrorKind | null;
  debug: CreditsRequestDebug[];
}

export function CreditsContentClient({
  creditsState,
  checkoutSucceeded,
  checkoutStatus,
}: {
  creditsState: CreditsLoadState;
  checkoutSucceeded: boolean;
  checkoutStatus?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.credits.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.credits.subtitle")}
        </p>
      </div>

      <CheckoutStatusBanner
        status={checkoutStatus}
        checkoutSucceeded={checkoutSucceeded}
        t={t}
      />

      {creditsState.error ? (
        <CreditsLoadErrorCard state={creditsState} t={t} />
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>{t("dashboard.credits.currentBalance")}</CardDescription>
          <CardTitle className="text-4xl">
            {creditsState.profile
              ? formatCredits(creditsState.profile.credits_balance)
              : t("common.unavailable")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <div>
            {t("dashboard.credits.totalPurchased")}{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatCredits(creditsState.profile.total_credits_purchased)
                : t("common.unavailable")}
            </span>
          </div>
          <div>
            {t("dashboard.credits.totalUsed")}{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatCredits(creditsState.profile.total_credits_used)
                : t("common.unavailable")}
            </span>
          </div>
          <div>
            {t("dashboard.credits.lastUpdated")}{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatDateTime(creditsState.profile.updated_at)
                : t("common.unavailable")}
            </span>
          </div>
        </CardContent>
      </Card>

      <CreditsTopUpClient
        plans={creditsState.plans}
        plansError={creditsState.plansError}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.credits.recentLedger")}</CardTitle>
          <CardDescription>{t("dashboard.credits.recentLedgerDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {creditsState.ledger.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colType")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("dashboard.credits.colAmount")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("dashboard.credits.colBalanceAfter")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colReason")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colReference")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colCreated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {creditsState.ledger.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <TypeBadge type={entry.type} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        <AmountCell amount={entry.amount} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {entry.balance_after != null
                          ? formatCredits(entry.balance_after)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {displayReason(entry.reason, t)}
                      </td>
                      <td
                        className="max-w-[10rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                        title={entry.reference_id ?? undefined}
                      >
                        {entry.reference_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreditsLoadErrorCard({
  state,
  t,
}: {
  state: CreditsLoadState;
  t: (key: string) => string;
}) {
  const isAuth = state.error === "auth";
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {isAuth
            ? t("dashboard.credits.loadErrorAuth")
            : t("dashboard.credits.loadErrorTemp")}
        </CardTitle>
        <CardDescription>
          {isAuth
            ? t("dashboard.credits.loadErrorAuthDesc")
            : t("dashboard.credits.loadErrorTempDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-background p-3 text-xs">
          <div className="mb-2 font-medium text-foreground">DMIT debug</div>
          <div className="flex flex-col gap-2">
            {state.debug.map((item) => (
              <div key={`${item.endpoint}-${item.status}`} className="font-mono">
                <div className="break-all text-muted-foreground">{item.url}</div>
                <div>
                  status={item.status ?? "n/a"} code={item.code ?? "n/a"}
                </div>
                {item.message ? (
                  <div className="break-words text-muted-foreground">
                    {item.message}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckoutStatusBanner({
  status,
  checkoutSucceeded,
  t,
}: {
  status?: string;
  checkoutSucceeded: boolean;
  t: (key: string) => string;
}) {
  if (checkoutSucceeded || status === "success") {
    return (
      <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {t("dashboard.credits.paymentReceived")}
          </CardTitle>
          <CardDescription className="text-emerald-900/80 dark:text-emerald-100/80">
            {t("dashboard.credits.paymentReceivedDesc")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (status === "cancel" || status === "cancelled") {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {t("dashboard.credits.checkoutCancelled")}
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
            {t("dashboard.credits.checkoutCancelledDesc")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return null;
}

function AmountCell({ amount }: { amount: number | null }) {
  if (amount == null) return <span>—</span>;
  const isPositive = amount >= 0;
  return (
    <span
      className={
        isPositive
          ? "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center gap-1 text-destructive"
      }
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {formatCredits(Math.abs(amount))}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <Badge variant="outline">unknown</Badge>;
  const normalized = type.toLowerCase();
  if (
    normalized === "purchase" ||
    normalized === "topup" ||
    normalized === "grant" ||
    normalized === "refund"
  ) {
    return <Badge variant="success">{type}</Badge>;
  }
  if (normalized === "debit") {
    return <Badge variant="destructive">{type}</Badge>;
  }
  if (normalized === "adjustment") {
    return <Badge variant="warning">{type}</Badge>;
  }
  return <Badge variant="outline">{type}</Badge>;
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <CreditCard className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("dashboard.credits.emptyLedger")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm" variant="default">
          <a href="#recharge-credits">{t("dashboard.credits.rechargeCredits")}</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/pricing">{t("dashboard.credits.viewPricing")}</Link>
        </Button>
      </div>
    </div>
  );
}

function displayReason(
  reason: string | null | undefined,
  t: (key: string) => string
) {
  if (!reason) return "—";
  if (reason === "stripe_checkout_completed") {
    return t("dashboard.credits.reasonStripeCheckout");
  }
  if (reason === "Chat completion usage") {
    return t("dashboard.credits.reasonChatUsage");
  }
  if (reason === "admin_adjustment") {
    return t("dashboard.credits.reasonAdminAdjustment");
  }
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return t("dashboard.credits.reasonSystemFix");
  }
  return reason;
}
