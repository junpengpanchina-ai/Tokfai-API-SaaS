"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  toneForStatus,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export type AdminUsageLogRow = {
  id?: string;
  email: string | null;
  /** Masked API key prefix — never a full secret. */
  prefix?: string | null;
  requested_model?: string | null;
  resolved_model?: string | null;
  model: string | null;
  route?: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  billing_status?: string | null;
  error_code?: string | null;
  request_id: string | null;
  created_at: string | null;
};

export function AdminUsageLogsTable({ rows }: { rows: AdminUsageLogRow[] }) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        {t("admin.usage.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colCreated")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colEmail")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colPrefix")}</th>
            <th className="py-2 pr-4 font-medium">
              {t("admin.usage.colRequestedModel")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("admin.usage.colResolvedModel")}
            </th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colRoute")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colStatus")}</th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("admin.usage.colTotal")}
            </th>
            <th className="py-2 pr-4 text-right font-medium">
              {t("admin.usage.colCredits")}
            </th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colBilling")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colError")}</th>
            <th className="py-2 pr-4 font-medium">{t("admin.usage.colRequestId")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id ?? row.request_id ?? `${row.created_at}-${index}`}
              className="border-b last:border-0"
            >
              <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                {formatDateTime(row.created_at)}
              </td>
              <td className="py-2 pr-4">{row.email ?? "—"}</td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.prefix ?? "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.requested_model ?? row.model ?? "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.resolved_model ?? row.model ?? "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                {row.route ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={row.status} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatMaybeInt(row.total_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {row.credits_charged != null
                  ? formatCreditsPrecise(row.credits_charged)
                  : "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.billing_status ?? "—"}
              </td>
              <td
                className="max-w-[10rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                title={row.error_code ?? undefined}
              >
                {row.error_code ?? "—"}
              </td>
              <td
                className="max-w-[14rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                title={row.request_id ?? undefined}
              >
                {row.request_id ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useI18n();
  const tone = toneForStatus(status);
  if (!status) return <Badge variant="outline">{t("admin.common.unknown")}</Badge>;
  if (tone === "success") return <Badge variant="success">{status}</Badge>;
  if (tone === "warning") return <Badge variant="warning">{status}</Badge>;
  if (tone === "destructive") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatMaybeInt(value: number | null | undefined): string {
  return value == null ? "—" : formatInt(value);
}
