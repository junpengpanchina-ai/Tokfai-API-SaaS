"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Info,
  KeyRound,
} from "lucide-react";

import {
  DashboardCopyButton,
  useDashboardCopyToClipboard,
} from "@/lib/dashboard-safe/copy-block";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

import { ResponsiveTableScroll } from "@/components/responsive-table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatPlanIdLabel,
  toneForCreditOrderStatus,
  truncateCheckoutSessionId,
  type CreditOrderDisplayStatus,
} from "@/lib/dashboard-safe/billing-display";
import type { CreditLedgerEntry, CreditsPageData } from "@/lib/dashboard-safe/dtos/credits";
import {
  dashboardFormatBalanceCredits,
  dashboardFormatCreditsWithSuffix,
  dashboardFormatDate,
  dashboardFormatCny,
  dashboardSafeNumber,
  dashboardShortRequestId,
} from "@/lib/dashboard-safe/display-helpers";
import { normalizeCreditsPageData } from "@/lib/dashboard-safe/normalize-dashboard-data";

export type CreditsLoadState = CreditsPageData;

export function CreditsContentClient({
  creditsState,
  checkoutSucceeded,
  checkoutStatus,
  checkoutSessionId,
}: {
  creditsState: CreditsLoadState | null | undefined;
  checkoutSucceeded: boolean;
  checkoutStatus?: string;
  checkoutSessionId?: string;
}) {
  const { t } = useDashboardLabels();
  const safeCreditsState = normalizeCreditsPageData(creditsState);
  const { balance, ledger, orders, error } = safeCreditsState;
  const [referenceFilter, setReferenceFilter] = useState("");
  const filteredLedger = useMemo(() => {
    const safeLedger = Array.isArray(ledger) ? ledger : [];
    const q = referenceFilter.trim();
    if (!q) return safeLedger;
    return safeLedger.filter((entry) => entry.reference_id?.includes(q));
  }, [ledger, referenceFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.credits.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.credits.subtitle")}
        </p>
      </div>

      <CheckoutStatusBanner
        status={checkoutStatus}
        checkoutSucceeded={checkoutSucceeded}
        checkoutSessionId={checkoutSessionId}
        orders={orders}
        t={t}
      />

      {error ? <CreditsLoadErrorCard error={error} t={t} /> : null}

      <Card>
        <CardHeader>
          <CardDescription>{t("dashboard.credits.currentBalance")}</CardDescription>
          <CardTitle className="text-4xl">
            {error ? t("common.unavailable") : dashboardFormatBalanceCredits(balance.balance)}
          </CardTitle>
          {balance.showNoLedgerHint && !error ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.credits.noLedgerHint")}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BalanceStat
            label={t("dashboard.credits.lastChange")}
            value={
              balance.lastChangeAt
                ? dashboardFormatDate(balance.lastChangeAt)
                : "—"
            }
          />
          <BalanceStat
            label={t("dashboard.credits.todayConsumed")}
            value={dashboardFormatBalanceCredits(balance.todayConsumed)}
          />
          <BalanceStat
            label={t("dashboard.credits.last7DaysConsumed")}
            value={dashboardFormatBalanceCredits(balance.last7DaysConsumed)}
          />
        </CardContent>
      </Card>

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 shrink-0" />
            {t("dashboard.credits.howItWorksTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t("dashboard.credits.howItWorksItem1")}</li>
            <li>{t("dashboard.credits.howItWorksItem2")}</li>
            <li>{t("dashboard.credits.howItWorksItem3")}</li>
            <li>{t("dashboard.credits.howItWorksItem4")}</li>
            <li>{t("dashboard.credits.howItWorksItem5")}</li>
            <li>{t("dashboard.credits.howItWorksItem6")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.credits.quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/pricing">{t("dashboard.credits.actionRecharge")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/api-keys">
              <KeyRound className="mr-1.5 h-4 w-4" />
              {t("dashboard.credits.actionApiKeys")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#usage-credits">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.credits.actionDocs")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/integration-workbench">
              {t("dashboard.credits.integrationWorkbenchLink")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.credits.recentLedger")}</CardTitle>
          <CardDescription>{t("dashboard.credits.recentLedgerDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-w-md space-y-2">
            <Label htmlFor="credits-reference-filter">
              {t("dashboard.credits.referenceFilterOptional")}
            </Label>
            <Input
              id="credits-reference-filter"
              value={referenceFilter}
              onChange={(event) => setReferenceFilter(event.target.value)}
              placeholder="req_..."
            />
          </div>
          {Array.isArray(ledger) && ledger.length === 0 ? (
            <EmptyLedgerState t={t} />
          ) : filteredLedger.length === 0 ? (
            <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("dashboard.credits.noLedgerForReference")}
            </p>
          ) : (
            <ResponsiveTableScroll>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colCreated")}
                    </th>
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
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.map((entry) => (
                    <LedgerRow key={entry.id} entry={entry} t={t} />
                  ))}
                </tbody>
              </table>
            </ResponsiveTableScroll>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.credits.recentOrders")}</CardTitle>
          <CardDescription>{t("dashboard.credits.recentOrdersDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {Array.isArray(orders) && orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                {t("dashboard.credits.emptyOrders")}
              </p>
              <Button asChild size="sm">
                <Link href="/pricing">{t("dashboard.credits.actionRecharge")}</Link>
              </Button>
            </div>
          ) : (
            <ResponsiveTableScroll>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colCreated")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("dashboard.credits.colAmount")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colStatus")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colPlan")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("dashboard.credits.colSession")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className={
                        checkoutSessionId &&
                        order.stripe_checkout_session_id === checkoutSessionId
                          ? "border-b bg-emerald-50/60 last:border-0 dark:bg-emerald-950/20"
                          : "border-b last:border-0"
                      }
                    >
                      <td className="py-2 pr-4 text-muted-foreground">
                        {dashboardFormatDate(order.created_at)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {formatOrderAmount(order)}
                      </td>
                      <td className="py-2 pr-4">
                        <OrderStatusBadge
                          status={order.display_status}
                          t={t}
                        />
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {formatPlanIdLabel(
                          order.plan_id ?? order.package_code ?? null
                        )}
                      </td>
                      <td
                        className="py-2 pr-4 font-mono text-xs text-muted-foreground"
                        title={order.stripe_checkout_session_id ?? undefined}
                      >
                        {truncateCheckoutSessionId(
                          order.stripe_checkout_session_id
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTableScroll>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function LedgerRow({
  entry,
  t,
}: {
  entry: CreditLedgerEntry;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const referenceCopyId = `ledger-ref-${entry.id}`;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 text-muted-foreground">
        {dashboardFormatDate(entry.created_at)}
      </td>
      <td className="py-2 pr-4">
        <LedgerTypeBadge type={entry.type} t={t} />
      </td>
      <td className="py-2 pr-4 text-right font-mono text-xs">
        <AmountCell amount={entry.amount} />
      </td>
      <td className="py-2 pr-4 text-right font-mono text-xs">
        {entry.balance_after != null
          ? dashboardFormatBalanceCredits(dashboardSafeNumber(entry.balance_after))
          : "—"}
      </td>
      <td
        className="max-w-[12rem] truncate py-2 pr-4 text-muted-foreground"
        title={entry.reason ?? undefined}
      >
        {displayReason(entry.reason, t)}
      </td>
      <td className="py-2 pr-4">
        {entry.reference_id ? (
          <div className="flex items-center gap-1">
            <code
              className="max-w-[10rem] truncate font-mono text-xs text-muted-foreground"
              title={entry.reference_id}
            >
              {dashboardShortRequestId(entry.reference_id)}
            </code>
            <DashboardCopyButton
              copied={copiedId === referenceCopyId}
              onCopy={() => copyText(referenceCopyId, entry.reference_id!)}
              copyLabel={t("dashboard.credits.copyReference")}
              copiedLabel={t("dashboard.credits.copiedReference")}
              size="icon"
            />
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function CreditsLoadErrorCard({
  error,
  t,
}: {
  error: "auth" | "temporary";
  t: (key: string) => string;
}) {
  const isAuth = error === "auth";
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
    </Card>
  );
}

function CheckoutStatusBanner({
  status,
  checkoutSucceeded,
  checkoutSessionId,
  orders,
  t,
}: {
  status?: string;
  checkoutSucceeded: boolean;
  checkoutSessionId?: string;
  orders: CreditsLoadState["orders"];
  t: (key: string) => string;
}) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const matchedOrder = checkoutSessionId
    ? safeOrders.find(
        (order) => order.stripe_checkout_session_id === checkoutSessionId
      )
    : undefined;

  if (checkoutSucceeded || status === "success") {
    if (matchedOrder?.display_status === "paid") {
      return (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t("dashboard.credits.orderPaidTitle")}
            </CardTitle>
            <CardDescription className="text-emerald-900/80 dark:text-emerald-100/80">
              {t("dashboard.credits.orderPaidDesc")}
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    if (matchedOrder?.display_status === "expired") {
      return (
        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              {t("dashboard.credits.orderExpiredTitle")}
            </CardTitle>
            <CardDescription>{t("dashboard.credits.orderExpiredDesc")}</CardDescription>
          </CardHeader>
        </Card>
      );
    }

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

function AmountCell({ amount }: { amount: number | string | null }) {
  const formatted = dashboardFormatCreditsWithSuffix(amount);
  if (formatted === "—") return <span>—</span>;
  const n = dashboardSafeNumber(amount);
  const isPositive = n != null && n >= 0;
  const label = isPositive ? `+${formatted}` : formatted;
  return (
    <Badge
      variant={isPositive ? "success" : "destructive"}
      className="font-mono text-xs"
    >
      <span className="inline-flex items-center gap-1">
        {isPositive ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )}
        {label}
      </span>
    </Badge>
  );
}

function OrderStatusBadge({
  status,
  t,
}: {
  status: CreditOrderDisplayStatus;
  t: (key: string) => string;
}) {
  const tone = toneForCreditOrderStatus(status);
  const variant =
    tone === "success"
      ? "success"
      : tone === "warning"
        ? "warning"
        : tone === "destructive"
          ? "destructive"
          : "outline";

  const labelKey = {
    paid: "dashboard.credits.orderStatusPaid",
    pending: "dashboard.credits.orderStatusPending",
    expired: "dashboard.credits.orderStatusExpired",
    cancelled: "dashboard.credits.orderStatusCancelled",
    failed: "dashboard.credits.orderStatusFailed",
  }[status];

  return <Badge variant={variant}>{t(labelKey)}</Badge>;
}

function LedgerTypeBadge({
  type,
  t,
}: {
  type: string | null | undefined;
  t: (key: string) => string;
}) {
  const label = ledgerTypeLabel(type, t);
  const normalized = (type ?? "").toLowerCase();
  if (
    normalized === "purchase" ||
    normalized === "topup" ||
    normalized === "grant" ||
    normalized === "bonus" ||
    normalized === "refund"
  ) {
    return <Badge variant="success">{label}</Badge>;
  }
  if (normalized === "debit" || normalized === "usage") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (normalized === "adjustment") {
    return <Badge variant="warning">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}

function ledgerTypeLabel(
  type: string | null | undefined,
  t: (key: string) => string
): string {
  const normalized = (type ?? "").toLowerCase();
  const keyMap: Record<string, string> = {
    topup: "dashboard.credits.typeTopup",
    purchase: "dashboard.credits.typeTopup",
    bonus: "dashboard.credits.typeBonus",
    grant: "dashboard.credits.typeBonus",
    usage: "dashboard.credits.typeUsage",
    debit: "dashboard.credits.typeUsage",
    refund: "dashboard.credits.typeRefund",
    adjustment: "dashboard.credits.typeAdjustment",
  };
  const key = keyMap[normalized] ?? "dashboard.credits.typeUnknown";
  return t(key);
}

function EmptyLedgerState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <CreditCard className="h-5 w-5" />
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("dashboard.credits.emptyLedger")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm" variant="default">
          <Link href="/pricing">{t("dashboard.credits.emptyLedgerTopUp")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/api-keys">
            {t("dashboard.credits.createApiKey")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/playground">{t("common.chatPlayground")}</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/image-playground">
            {t("common.imagePlayground")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function formatOrderAmount(order: CreditsLoadState["orders"][number]): string {
  if (order.amount_cents != null) {
    return dashboardFormatCny(order.amount_cents);
  }
  if (order.amount_cny != null) {
    return dashboardFormatCny(order.amount_cny * 100);
  }
  return "—";
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
  if (reason === "Image generation usage") {
    return t("dashboard.credits.reasonImageUsage");
  }
  if (reason === "admin_adjustment") {
    return t("dashboard.credits.reasonAdminAdjustment");
  }
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return t("dashboard.credits.reasonSystemFix");
  }
  return reason;
}
