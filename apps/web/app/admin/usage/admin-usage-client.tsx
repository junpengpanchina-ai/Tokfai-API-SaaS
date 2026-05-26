"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminStatCard } from "@/components/admin/admin-stat-card";
import {
  AdminUsageLogsTable,
  type AdminUsageLogRow,
} from "@/components/admin/admin-usage-logs-table";
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
  computeUsageLogStats,
  getUsageRequestType,
  isUsageSuccess,
} from "@/lib/admin/usage";
import { formatInt } from "@/lib/format";
import { getDmitBaseUrl } from "@/lib/dmit/client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

export type AdminUsageLog = AdminUsageLogRow;

type UsageResponse = {
  data?: AdminUsageLog[];
};

type StatusFilter = "all" | "succeeded" | "failed";
type TypeFilter = "all" | "chat" | "image";

export function AdminUsageClient({
  accessToken,
  initialLogs,
  initialError,
}: {
  accessToken: string;
  initialLogs: AdminUsageLog[];
  initialError: string | null;
}) {
  const { t } = useI18n();
  const [logs, setLogs] = useState(initialLogs);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getDmitBaseUrl()}/admin/usage`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = (await parseJson(response)) as UsageResponse & {
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, response.status));
      }

      setLogs(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("admin.usage.loadFailed")
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    setLogs(initialLogs);
    setError(initialError);
  }, [initialLogs, initialError]);

  const stats = useMemo(() => computeUsageLogStats(logs), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((row) => {
      if (statusFilter === "succeeded" && !isUsageSuccess(row.status)) {
        return false;
      }
      if (statusFilter === "failed" && isUsageSuccess(row.status)) {
        return false;
      }

      const requestType = getUsageRequestType(row.model);
      if (typeFilter === "chat" && requestType !== "chat") {
        return false;
      }
      if (typeFilter === "image" && requestType !== "image") {
        return false;
      }

      return true;
    });
  }, [logs, statusFilter, typeFilter]);

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.usage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.usage.subtitle")}
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.usage.couldNotLoad")}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadLogs()}
            >
              {t("admin.common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard
          label={t("admin.usage.totalRequests")}
          value={formatInt(stats.totalRequests)}
        />
        <AdminStatCard label={t("admin.usage.succeeded")} value={formatInt(stats.succeeded)} />
        <AdminStatCard label={t("admin.usage.failed")} value={formatInt(stats.failed)} />
        <AdminStatCard
          label={t("admin.usage.imageRequests")}
          value={formatInt(stats.imageRequests)}
        />
        <AdminStatCard
          label={t("admin.usage.chatRequests")}
          value={formatInt(stats.chatRequests)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.usage.filtersTitle")}</CardTitle>
          <CardDescription>{t("admin.usage.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <FilterSelect
              label={t("admin.usage.filterStatus")}
              value={statusFilter}
              options={[
                { value: "all", label: t("admin.common.all") },
                { value: "succeeded", label: t("admin.usage.filterSucceeded") },
                { value: "failed", label: t("admin.usage.filterFailed") },
              ]}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
            />
            <FilterSelect
              label={t("admin.usage.filterType")}
              value={typeFilter}
              options={[
                { value: "all", label: t("admin.common.all") },
                { value: "chat", label: t("admin.usage.filterChat") },
                { value: "image", label: t("admin.usage.filterImage") },
              ]}
              onChange={(value) => setTypeFilter(value as TypeFilter)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("admin.usage.tableTitle")}</CardTitle>
            <CardDescription>
              {formatMessage(t("admin.usage.showingCount"), {
                filtered: formatInt(filteredLogs.length),
                total: formatInt(logs.length),
              })}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadLogs()}
          >
            {loading ? t("admin.common.refreshing") : t("admin.common.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.usage.loading")}</p>
          ) : (
            <AdminUsageLogsTable rows={filteredLogs} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown; message?: unknown }).error;
    if (typeof maybeError === "string") return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return `Request failed (HTTP ${status}).`;
}
