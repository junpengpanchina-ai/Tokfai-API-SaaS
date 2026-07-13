"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminErrorLogRow } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type LogFilters = {
  request_id: string;
  route: string;
  status: string;
  code: string;
};

function buildLogsQuery(filters: LogFilters): string {
  const params = new URLSearchParams();
  const requestId = filters.request_id.trim();
  const route = filters.route.trim();
  const status = filters.status.trim();
  const code = filters.code.trim();

  if (requestId) params.set("request_id", requestId);
  if (route) params.set("route", route);
  if (status) params.set("status", status);
  if (code) params.set("code", code);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function AdminLogsPanel({
  logs,
  debug,
  initialFilters = {
    request_id: "",
    route: "",
    status: "",
    code: "",
  },
}: {
  logs: AdminErrorLogRow[];
  debug: AdminDebug | null;
  initialFilters?: LogFilters;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [filters, setFilters] = useState<LogFilters>(initialFilters);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function patchFilters(patch: Partial<LogFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function applyFilter() {
    router.push(`/admin/logs${buildLogsQuery(filters)}`);
  }

  function clearFilters() {
    setFilters({
      request_id: "",
      route: "",
      status: "",
      code: "",
    });
    router.push("/admin/logs");
  }

  async function copyRequestId(requestId: string, rowId: string) {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopiedId(rowId);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.logs.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.logs.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.logs.filtersTitle")}</CardTitle>
          <CardDescription>{t("admin.logs.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={filters.request_id}
            onChange={(event) => patchFilters({ request_id: event.target.value })}
            placeholder={t("admin.logs.requestIdPlaceholder")}
            className="max-w-xs"
          />
          <Input
            value={filters.route}
            onChange={(event) => patchFilters({ route: event.target.value })}
            placeholder={t("admin.logs.routePlaceholder")}
            className="max-w-xs"
          />
          <Input
            value={filters.status}
            onChange={(event) => patchFilters({ status: event.target.value })}
            placeholder={t("admin.logs.statusPlaceholder")}
            className="max-w-[10rem]"
          />
          <Input
            value={filters.code}
            onChange={(event) => patchFilters({ code: event.target.value })}
            placeholder={t("admin.logs.codePlaceholder")}
            className="max-w-[10rem]"
          />
          <Button type="button" variant="secondary" onClick={applyFilter}>
            {t("admin.logs.applyFilter")}
          </Button>
          <Button type="button" variant="outline" onClick={clearFilters}>
            {t("admin.logs.clearFilters")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.logs.tableTitle")}</CardTitle>
          <CardDescription>
            {t("admin.logs.showingCount").replace("{count}", String(logs.length))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.logs.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colRequestId")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colRoute")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colCode")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colMessage")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colCreated")}
                    </th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.request_id ?? "—"}</span>
                          {row.request_id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                copyRequestId(row.request_id!, row.id)
                              }
                            >
                              {copiedId === row.id
                                ? t("dashboard.apiKeys.copied")
                                : t("admin.logs.copyRequestId")}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{row.route ?? "—"}</td>
                      <td className="py-2 pr-4">{row.code ?? "—"}</td>
                      <td className="max-w-[240px] truncate py-2 pr-4">
                        {row.message ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="py-2">
                        <details className="text-xs">
                          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                            {t("admin.logs.technicalDetails")}
                          </summary>
                          <div className="mt-2 space-y-1 font-mono text-muted-foreground">
                            <p>
                              {t("admin.logs.colUpstream")}:{" "}
                              {row.upstream_status ?? "—"}
                            </p>
                            <p>
                              {t("admin.logs.colLatency")}:{" "}
                              {row.latency_ms != null
                                ? `${formatInt(row.latency_ms)} ms`
                                : "—"}
                            </p>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
