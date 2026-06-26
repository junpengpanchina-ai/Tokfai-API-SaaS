"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DmitApiError,
  fetchMyUsageSummary,
  type MeUsageLogEntry,
  type MeUsageSummaryResponse,
} from "@/lib/dmit/client";
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  formatCreditsWithSuffix,
  formatDate,
  formatUsageCredits,
  formatUsageTokenCell,
  getModelLabel,
  getUsageKind,
  shortRequestId,
  usageStatusLabel,
  usageStatusTone,
  type UsageKind,
} from "@/lib/usage-safe-display";

export type UsageApiKeyOption = {
  id: string;
  name: string;
  prefix: string;
  status: string;
};

type StatusFilter = "" | "succeeded" | "failed";

type QueryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: MeUsageSummaryResponse }
  | { status: "error"; message: string };

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
}

export function UsageQuerySection({
  apiKeys,
}: {
  apiKeys: UsageApiKeyOption[];
}) {
  const { t } = useI18n();
  const defaults = useMemo(() => defaultDateRange(), []);

  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [apiKeyId, setApiKeyId] = useState("");
  const [model, setModel] = useState("");
  const [requestId, setRequestId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [queryState, setQueryState] = useState<QueryState>({ status: "idle" });

  const runSearch = useCallback(async () => {
    setQueryState({ status: "loading" });
    try {
      const result = await fetchMyUsageSummary({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        api_key_id: apiKeyId || undefined,
        model: model.trim() || undefined,
        status: statusFilter || undefined,
        limit: 100,
      });
      setQueryState({ status: "ready", result });
    } catch (err) {
      const message =
        err instanceof DmitApiError && err.isAuth
          ? t("admin.common.sessionExpired")
          : err instanceof Error
            ? err.message
            : t("dashboard.usage.queryError");
      setQueryState({ status: "error", message });
    }
  }, [apiKeyId, endDate, model, startDate, statusFilter, t]);

  const handleReset = () => {
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
    setApiKeyId("");
    setModel("");
    setRequestId("");
    setStatusFilter("");
    setQueryState({ status: "idle" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.usage.usageQueryTitle")}</CardTitle>
        <CardDescription>{t("dashboard.usage.usageQueryDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="usage-start-date">{t("dashboard.usage.startDate")}</Label>
            <Input
              id="usage-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-end-date">{t("dashboard.usage.endDate")}</Label>
            <Input
              id="usage-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-api-key">{t("dashboard.usage.apiKeyOptional")}</Label>
            <select
              id="usage-api-key"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={apiKeyId}
              onChange={(event) => setApiKeyId(event.target.value)}
            >
              <option value="">{t("dashboard.usage.allApiKeys")}</option>
              {apiKeys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name} ({key.prefix})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-model">{t("dashboard.usage.modelOptional")}</Label>
            <Input
              id="usage-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="auto-fast"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-request-id">{t("dashboard.usage.requestIdOptional")}</Label>
            <Input
              id="usage-request-id"
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              placeholder="req_..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage-status">{t("dashboard.usage.status")}</Label>
            <select
              id="usage-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="">{t("dashboard.usage.allStatuses")}</option>
              <option value="succeeded">{t("dashboard.usage.statusSucceeded")}</option>
              <option value="failed">{t("dashboard.usage.statusFailed")}</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={queryState.status === "loading"}>
              {queryState.status === "loading" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {t("dashboard.usage.search")}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              {t("dashboard.usage.reset")}
            </Button>
          </div>
        </form>

        {queryState.status === "loading" ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.usage.queryLoading")}
          </p>
        ) : null}

        {queryState.status === "error" ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {t("dashboard.usage.queryError")}
              </CardTitle>
              <CardDescription>{queryState.message}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {queryState.status === "ready" ? (
          <QueryResults
            result={queryState.result}
            requestIdFilter={requestId.trim()}
            t={t}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function QueryResults({
  result,
  requestIdFilter,
  t,
}: {
  result: MeUsageSummaryResponse;
  requestIdFilter: string;
  t: (key: string) => string;
}) {
  const { summary, data } = result;
  const filteredData = requestIdFilter
    ? data.filter((row) => row.request_id?.includes(requestIdFilter))
    : data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminStatCard
          label={t("dashboard.usage.totalRequests")}
          value={formatInt(summary.total_requests)}
        />
        <AdminStatCard
          label={t("dashboard.usage.succeededRequests")}
          value={formatInt(summary.succeeded_requests)}
        />
        <AdminStatCard
          label={t("dashboard.usage.failedRequests")}
          value={formatInt(summary.failed_requests)}
        />
        <AdminStatCard
          label={t("dashboard.usage.totalTokens")}
          value={formatInt(summary.total_tokens)}
        />
        <AdminStatCard
          label={t("dashboard.usage.creditsCharged")}
          value={formatCreditsWithSuffix(summary.total_credits_charged)}
        />
      </div>

      <div>
        <h3 className="text-base font-semibold">{t("dashboard.usage.queryResults")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.usage.queryResultsDesc")}
        </p>
      </div>

      {filteredData.length > 0 ? (
        <UsageQueryTable logs={filteredData} t={t} />
      ) : (
        <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          {requestIdFilter
            ? t("dashboard.usage.noUsageForRequestId")
            : t("dashboard.usage.noUsageFound")}
        </p>
      )}
    </div>
  );
}

function UsageQueryTable({
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
              {t("dashboard.usage.colApiKeyPrefix")}
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
            return <UsageQueryRow key={row.id} row={row} kind={kind} t={t} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsageQueryRow({
  row,
  kind,
  t,
}: {
  row: MeUsageLogEntry;
  kind: UsageKind;
  t: (key: string) => string;
}) {
  const tone = usageStatusTone(row.status);
  const statusLabel = usageStatusLabel(row.status, t);

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
        {formatDate(row.created_at)}
      </td>
      <td className="py-2.5 pr-3">
        <Badge variant="outline" className="whitespace-nowrap">
          {kind === "image"
            ? t("dashboard.usage.kindImage")
            : t("dashboard.usage.kindChat")}
        </Badge>
      </td>
      <td className="max-w-[9rem] py-2.5 pr-3 font-mono text-xs break-all sm:max-w-none">
        {getModelLabel(row.model)}
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
        {row.prefix ?? "—"}
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap">
        {tone === "success" ? (
          <Badge variant="success">{statusLabel}</Badge>
        ) : tone === "muted" ? (
          <Badge variant="secondary">{statusLabel}</Badge>
        ) : (
          <Badge variant="destructive">{statusLabel}</Badge>
        )}
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
        {shortRequestId(row.request_id)}
      </td>
      <td className="hidden max-w-[8rem] truncate py-2.5 pr-0 font-mono text-xs text-muted-foreground lg:table-cell">
        {row.error_code ?? "—"}
      </td>
    </tr>
  );
}
