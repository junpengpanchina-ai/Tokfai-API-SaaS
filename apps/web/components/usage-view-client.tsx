"use client";

import Link from "next/link";
import { AlertTriangle, Gauge, ImageIcon, Info, MessageSquare } from "lucide-react";

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
import { formatDateTime, toneForStatus } from "@/lib/format";
import type { MeUsageLogEntry } from "@/lib/dmit/server";
import {
  formatUsageCredits,
  formatUsageTokenCell,
  getUsageKind,
  type UsageKind,
} from "@/lib/usage-display";

type UsageState =
  | { status: "ready"; logs: MeUsageLogEntry[] }
  | { status: "error"; message: string; code?: string; httpStatus?: number };

export function UsageViewClient({ state }: { state: UsageState }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.usage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.usage.subtitle")}
        </p>
      </div>

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
          </ul>
        </CardContent>
      </Card>

      {state.status === "error" ? <UsageError state={state} t={t} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.usage.recentRequests")}</CardTitle>
          <CardDescription>
            {t("dashboard.usage.recentRequestsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "ready" && state.logs.length > 0 ? (
            <UsageTable logs={state.logs} t={t} />
          ) : state.status === "ready" ? (
            <EmptyState t={t} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageError({
  state,
  t,
}: {
  state: Extract<UsageState, { status: "error" }>;
  t: (key: string) => string;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {t("dashboard.usage.loadError")}
        </CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-xs text-muted-foreground">
        status={state.httpStatus ?? "n/a"} code={state.code ?? "n/a"}
      </CardContent>
    </Card>
  );
}

function UsageTable({
  logs,
  t,
}: {
  logs: MeUsageLogEntry[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colWhen")}
            </th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colType")}
            </th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">
              {t("dashboard.usage.colModel")}
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
              className="hidden py-2 pr-3 font-medium whitespace-nowrap xl:table-cell"
              title={t("dashboard.usage.colRequestIdHint")}
            >
              {t("dashboard.usage.colRequestId")}
            </th>
            <th className="hidden py-2 pr-0 font-medium whitespace-nowrap lg:table-cell">
              {t("dashboard.usage.colError")}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => {
            const kind = getUsageKind(row.model);
            return <UsageRow key={row.id} row={row} kind={kind} t={t} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsageRow({
  row,
  kind,
  t,
}: {
  row: MeUsageLogEntry;
  kind: UsageKind;
  t: (key: string) => string;
}) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
        {formatDateTime(row.created_at)}
      </td>
      <td className="py-2.5 pr-3">
        <KindBadge kind={kind} t={t} />
      </td>
      <td className="max-w-[9rem] py-2.5 pr-3 font-mono text-xs break-all sm:max-w-none">
        {row.model ?? "—"}
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
      <td
        className="hidden max-w-[10rem] truncate py-2.5 pr-3 font-mono text-xs text-muted-foreground xl:table-cell"
        title={row.request_id ?? undefined}
      >
        {truncateRequestId(row.request_id)}
      </td>
      <td className="hidden max-w-[8rem] truncate py-2.5 pr-0 font-mono text-xs text-muted-foreground lg:table-cell">
        {row.error_code ?? "—"}
      </td>
    </tr>
  );
}

function KindBadge({
  kind,
  t,
}: {
  kind: UsageKind;
  t: (key: string) => string;
}) {
  const label =
    kind === "image"
      ? t("dashboard.usage.kindImage")
      : t("dashboard.usage.kindChat");

  if (kind === "image") {
    return (
      <Badge variant="outline" className="gap-1 whitespace-nowrap">
        <ImageIcon className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <MessageSquare className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const tone = toneForStatus(status);
  const label =
    tone === "success"
      ? t("dashboard.usage.statusSucceeded")
      : t("dashboard.usage.statusFailed");
  if (tone === "success") {
    return <Badge variant="success">{label}</Badge>;
  }
  return <Badge variant="destructive">{label}</Badge>;
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Gauge className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("dashboard.usage.emptyTitle")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/playground">{t("common.chatPlayground")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/image-playground">
            {t("common.imagePlayground")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function truncateRequestId(requestId: string | null | undefined) {
  if (!requestId) return "—";
  if (requestId.length <= 16) return requestId;
  return `${requestId.slice(0, 8)}...${requestId.slice(-6)}`;
}

export type { UsageState };
