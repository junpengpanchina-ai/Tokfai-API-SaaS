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

export function AdminLogsPanel({
  logs,
  debug,
  initialRequestIdFilter = "",
}: {
  logs: AdminErrorLogRow[];
  debug: AdminDebug | null;
  initialRequestIdFilter?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [requestId, setRequestId] = useState(initialRequestIdFilter);

  function applyFilter() {
    const trimmed = requestId.trim();
    if (!trimmed) {
      router.push("/admin/logs");
      return;
    }
    router.push(`/admin/logs?request_id=${encodeURIComponent(trimmed)}`);
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
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            placeholder={t("admin.logs.requestIdPlaceholder")}
            className="max-w-sm"
          />
          <Button type="button" variant="secondary" onClick={applyFilter}>
            {t("admin.logs.applyFilter")}
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
                      {t("admin.logs.colUpstream")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colLatency")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.logs.colCreated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {row.request_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{row.route ?? "—"}</td>
                      <td className="py-2 pr-4">{row.code ?? "—"}</td>
                      <td className="max-w-[240px] truncate py-2 pr-4">
                        {row.message ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.upstream_status ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.latency_ms != null
                          ? `${formatInt(row.latency_ms)} ms`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {formatDateTime(row.created_at)}
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
