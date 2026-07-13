"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

import { AdminCreditsAdjustForm } from "@/components/admin/admin-credits-adjust-form";
import { AdminLedgerMiniTable } from "@/components/admin/admin-ledger-mini-table";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  filterLedgerEntriesByBucket,
  summarizeLedgerEntries,
} from "@/lib/admin/ledger";
import { formatCredits, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

import type {
  AdminCreditLedgerEntry,
  AdminCreditsData,
} from "@/app/admin/credits/admin-credits-client";

export function AdminCreditsAccountPanel({
  data,
  profileEmail,
  isBusy,
  onRefresh,
  loading,
  onCreditsAdjusted,
}: {
  data: AdminCreditsData;
  profileEmail: string;
  isBusy: boolean;
  onRefresh: () => void;
  loading: boolean;
  onCreditsAdjusted?: () => void;
}) {
  const { t } = useI18n();

  const summaries = useMemo(
    () => summarizeLedgerEntries(data.ledger),
    [data.ledger]
  );

  const recentTopups = useMemo(
    () => filterLedgerEntriesByBucket(data.ledger, "topup", 5),
    [data.ledger]
  );

  const recentDebits = useMemo(
    () => filterLedgerEntriesByBucket(data.ledger, "debit", 5),
    [data.ledger]
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>{t("admin.credits.currentBalance")}</CardDescription>
          <CardTitle className="text-4xl">
            {formatCredits(data.profile.credits_balance)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <div>
              {t("admin.credits.email")}:{" "}
              <span className="font-medium text-foreground">
                {data.profile.email ?? "—"}
              </span>
            </div>
            <div>
              {t("admin.credits.totalUsed")}:{" "}
              <span className="font-medium text-foreground">
                {formatCredits(data.profile.total_credits_used)}
              </span>
            </div>
            <div>
              {t("admin.credits.lastUpdated")}:{" "}
              <span className="font-medium text-foreground">
                {formatDateTime(data.profile.updated_at)}
              </span>
            </div>
            <div>
              <Link
                href={
                  data.profile.email
                    ? `/admin/usage?email=${encodeURIComponent(data.profile.email)}`
                    : "/admin/usage"
                }
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("admin.credits.viewUsageLogs")}
              </Link>
            </div>
          </div>

          <AdminCreditsAdjustForm
            userId={data.profile.id}
            userEmail={data.profile.email}
            currentBalance={data.profile.credits_balance}
            disabled={isBusy}
            onSuccess={() => {
              onCreditsAdjusted?.();
              onRefresh();
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.credits.groupStatsTitle")}</CardTitle>
            <Badge variant="secondary">{t("admin.credits.basedOnLoadedBatch")}</Badge>
          </div>
          <CardDescription>{t("admin.credits.groupStatsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminStatCard
              label={t("admin.credits.topupStats")}
              value={formatCredits(summaries.topup.totalAmount)}
              hint={formatMessage(t("admin.credits.entryCount"), {
                count: summaries.topup.count,
              })}
            />
            <AdminStatCard
              label={t("admin.credits.debitStats")}
              value={formatCredits(summaries.debit.totalAmount)}
              hint={formatMessage(t("admin.credits.entryCount"), {
                count: summaries.debit.count,
              })}
            />
            <AdminStatCard
              label={t("admin.credits.adjustmentStats")}
              value={formatCredits(Math.abs(summaries.adjustment.totalAmount))}
              hint={formatMessage(t("admin.credits.entryCount"), {
                count: summaries.adjustment.count,
              })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.credits.recentTopups")}</CardTitle>
            <CardDescription>{t("admin.credits.recentTopupsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLedgerMiniTable
              entries={recentTopups}
              emptyLabel={t("admin.credits.noRecentTopups")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.credits.recentDebits")}</CardTitle>
            <CardDescription>{t("admin.credits.recentDebitsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLedgerMiniTable
              entries={recentDebits}
              emptyLabel={t("admin.credits.noRecentDebits")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("admin.credits.ledgerEntries")}</CardTitle>
            <CardDescription>
              {formatMessage(t("admin.credits.ledgerEntriesDesc"), {
                email: profileEmail || "selected user",
              })}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={onRefresh}
          >
            {loading ? t("admin.credits.refreshing") : t("admin.credits.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {data.ledger.length > 0 ? (
            <AdminCreditsLedgerTable
              entries={data.ledger}
              profileEmail={profileEmail}
            />
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("admin.credits.noLedgerEntries")}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AdminCreditsLedgerTable({
  entries,
  profileEmail,
}: {
  entries: AdminCreditLedgerEntry[];
  profileEmail: string;
}) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("admin.credits.email")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colType")}</th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("admin.credits.colAmount")}
            </th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("admin.credits.colBalanceAfter")}
            </th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colReason")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colReference")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colCreated")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b last:border-0">
              <td className="py-2 pr-4">{profileEmail ?? "—"}</td>
              <td className="py-2 pr-4">
                <TypeBadge type={entry.type} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                <AmountCell amount={entry.amount} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatCredits(entry.balance_after)}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                <LedgerReason reason={entry.reason} />
              </td>
              <td
                className="max-w-[12rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
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
  );
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

function LedgerReason({ reason }: { reason: string | null | undefined }) {
  const { t } = useI18n();

  if (!reason) return <>—</>;
  if (reason === "stripe_checkout_completed") {
    return <>{t("admin.credits.reasonStripeTopUp")}</>;
  }
  if (reason === "Chat completion usage") {
    return <>{t("admin.credits.reasonChatUsage")}</>;
  }
  if (reason === "admin_adjustment") {
    return <>{t("admin.credits.reasonAdminAdjustment")}</>;
  }
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return <>{t("admin.credits.reasonSystemFix")}</>;
  }
  return <>{reason}</>;
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  const { t } = useI18n();
  if (!type) return <Badge variant="outline">{t("admin.common.unknown")}</Badge>;
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
