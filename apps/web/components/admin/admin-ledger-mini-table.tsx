"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCredits, formatDateTime } from "@/lib/format";
import type { AdminLedgerEntry } from "@/lib/admin/ledger";
import { useI18n } from "@/lib/i18n/i18n-provider";

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

export function AdminLedgerMiniTable({
  entries,
  emptyLabel,
}: {
  entries: AdminLedgerEntry[];
  emptyLabel: string;
}) {
  const { t } = useI18n();

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colCreated")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colType")}</th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("admin.credits.colAmount")}
            </th>
            <th className="py-2 pr-4 font-medium">{t("admin.credits.colReason")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b last:border-0">
              <td className="py-2 pr-4 text-muted-foreground">
                {formatDateTime(entry.created_at)}
              </td>
              <td className="py-2 pr-4">
                <TypeBadge type={entry.type} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                <AmountCell amount={entry.amount} />
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                <LedgerReason reason={entry.reason} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
