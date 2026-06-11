"use client";

import Link from "next/link";
import { AlertTriangle, Gauge, Info } from "lucide-react";

import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { ResponsiveTableScroll } from "@/components/responsive-table-scroll";
import { CopyButton, useCopyToClipboard } from "@/components/copy-code-block";
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
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { UsagePageLog, UsagePageState } from "@/lib/usage-page";
import {
  formatUsageCredits,
  formatUsageTokenCell,
  getUsageKind,
  resolveUsageRoute,
  usageStatusLabel,
  usageStatusTone,
  type UsageKind,
} from "@/lib/usage-display";

export function UsageViewClient({ state }: { state: UsagePageState }) {
  const { t } = useI18n();
  const { copiedId, copyText } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.usage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.usage.subtitle")}
        </p>
      </div>

      {state.status === "ready" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStatCard
            label={t("dashboard.usage.statRequests24h")}
            value={formatInt(state.stats.requestsLast24Hours)}
          />
          <AdminStatCard
            label={t("dashboard.usage.statRequests7d")}
            value={formatInt(state.stats.requestsLast7Days)}
          />
          <AdminStatCard
            label={t("dashboard.usage.statTokens7d")}
            value={formatInt(state.stats.tokensLast7Days)}
          />
          <AdminStatCard
            label={t("dashboard.usage.statCredits7d")}
            value={formatCreditsPrecise(state.stats.creditsLast7Days)}
          />
        </div>
      ) : null}

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 shrink-0" />
            {t("dashboard.usage.howItWorksTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t("dashboard.usage.howItWorksItem1")}</li>
            <li>{t("dashboard.usage.howItWorksItem2")}</li>
            <li>{t("dashboard.usage.howItWorksItem3")}</li>
            <li>{t("dashboard.usage.howItWorksItem4")}</li>
            <li>{t("dashboard.usage.howItWorksItem5")}</li>
          </ul>
        </CardContent>
      </Card>

      {state.status === "error" ? <UsageError t={t} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.usage.recentRequests")}</CardTitle>
          <CardDescription>
            {t("dashboard.usage.recentRequestsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "ready" && state.logs.length > 0 ? (
            <UsageTable
              logs={state.logs}
              copiedId={copiedId}
              onCopy={copyText}
              t={t}
            />
          ) : state.status === "ready" ? (
            <EmptyState t={t} />
          ) : state.status === "error" ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.usage.loadErrorDesc")}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageError({ t }: { t: (key: string) => string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {t("dashboard.usage.loadError")}
        </CardTitle>
        <CardDescription>{t("dashboard.usage.loadErrorDesc")}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function UsageTable({
  logs,
  copiedId,
  onCopy,
  t,
}: {
  logs: UsagePageLog[];
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <ResponsiveTableScroll>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colWhen")}
            </th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colModel")}
            </th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colRoute")}
            </th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colStatus")}
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap md:table-cell">
              {t("dashboard.usage.colPrompt")}
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap lg:table-cell">
              {t("dashboard.usage.colCompletion")}
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap sm:table-cell">
              {t("dashboard.usage.colTotal")}
            </th>
            <th className="py-2 pr-3 text-right font-medium whitespace-nowrap">
              {t("dashboard.usage.colCredits")}
            </th>
            <th
              className="py-2 pr-0 font-medium whitespace-nowrap"
              title={t("dashboard.usage.colRequestIdHint")}
            >
              {t("dashboard.usage.colRequestId")}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => {
            const kind = getUsageKind(row.model);
            return (
              <UsageRow
                key={row.id}
                row={row}
                kind={kind}
                copiedId={copiedId}
                onCopy={onCopy}
                t={t}
              />
            );
          })}
        </tbody>
      </table>
    </ResponsiveTableScroll>
  );
}

function UsageRow({
  row,
  kind,
  copiedId,
  onCopy,
  t,
}: {
  row: UsagePageLog;
  kind: UsageKind;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  t: (key: string) => string;
}) {
  const copyId = `usage-request-id-${row.id}`;

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
        {formatDateTime(row.created_at)}
      </td>
      <td className="max-w-[9rem] py-2.5 pr-3 font-mono text-xs break-all sm:max-w-none">
        {row.model ?? "—"}
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
        {resolveUsageRoute(row.model)}
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap">
        <StatusBadge status={row.status} t={t} />
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-xs md:table-cell">
        {formatUsageTokenCell(kind, row.prompt_tokens, "prompt")}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-xs lg:table-cell">
        {formatUsageTokenCell(kind, row.completion_tokens, "completion")}
      </td>
      <td
        className={`hidden py-2.5 pr-3 text-right text-xs sm:table-cell ${
          kind === "image" ? "text-muted-foreground" : "font-mono"
        }`}
      >
        {kind === "image" && row.total_tokens == null
          ? t("dashboard.usage.imageGeneration")
          : formatUsageTokenCell(kind, row.total_tokens, "total")}
      </td>
      <td className="py-2.5 pr-3 text-right text-xs whitespace-nowrap">
        {formatUsageCredits(row, kind)}
      </td>
      <td className="py-2.5 pr-0">
        {row.request_id ? (
          <div className="flex items-center gap-1">
            <code
              className="max-w-[10rem] truncate font-mono text-xs text-muted-foreground"
              title={row.request_id}
            >
              {truncateRequestId(row.request_id)}
            </code>
            <CopyButton
              copied={copiedId === copyId}
              onCopy={() => onCopy(copyId, row.request_id!)}
              copyLabel={t("dashboard.usage.copyRequestId")}
              copiedLabel={t("dashboard.usage.copiedRequestId")}
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

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const tone = usageStatusTone(status);
  const label = usageStatusLabel(status, t);

  if (tone === "success") {
    return <Badge variant="success">{label}</Badge>;
  }
  if (tone === "muted") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  return <Badge variant="destructive">{label}</Badge>;
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Gauge className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm font-medium text-foreground">
        {t("dashboard.usage.emptyTitle")}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("dashboard.usage.emptyHint")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard/playground">{t("common.chatPlayground")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/image-playground">
            {t("common.imagePlayground")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/credits">{t("dashboard.usage.emptyViewCredits")}</Link>
        </Button>
      </div>
    </div>
  );
}

function truncateRequestId(requestId: string) {
  if (requestId.length <= 16) return requestId;
  return `${requestId.slice(0, 8)}...${requestId.slice(-6)}`;
}
