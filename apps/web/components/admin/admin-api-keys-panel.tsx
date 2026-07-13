"use client";

import { useMemo, useState } from "react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminReadonlyNotice } from "@/components/admin/admin-readonly-notice";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminApiKeyRow } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminApiKeysPanel({
  apiKeys,
  debug,
}: {
  apiKeys: AdminApiKeyRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const [emailQuery, setEmailQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked">(
    "all"
  );

  const filtered = useMemo(() => {
    const q = emailQuery.trim().toLowerCase();
    return apiKeys.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (row.owner_email ?? "").toLowerCase().includes(q) ||
        row.prefix.toLowerCase().includes(q) ||
        row.user_id.toLowerCase().includes(q)
      );
    });
  }, [apiKeys, emailQuery, statusFilter]);

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.apiKeys.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.apiKeys.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.apiKeys.filtersTitle")}</CardTitle>
          <CardDescription>{t("admin.apiKeys.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            value={emailQuery}
            onChange={(event) => setEmailQuery(event.target.value)}
            placeholder={t("admin.apiKeys.searchPlaceholder")}
            className="max-w-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">{t("admin.common.all")}</option>
            <option value="active">{t("admin.apiKeys.statusActive")}</option>
            <option value="revoked">{t("admin.apiKeys.statusRevoked")}</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.apiKeys.tableTitle")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlySnapshot")}</Badge>
          </div>
          <CardDescription>
            {t("admin.apiKeys.showingCount").replace(
              "{count}",
              String(filtered.length)
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminReadonlyNotice
            titleKey="admin.apiKeys.readonlyTitle"
            bodyKey="admin.apiKeys.readonlyBody"
          />
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.apiKeys.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.apiKeys.colOwner")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.apiKeys.colPrefix")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.apiKeys.colStatus")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.apiKeys.colCreated")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.apiKeys.colLastUsed")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.apiKeys.colTotalUsage")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.owner_email ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.prefix}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            row.status === "active" ? "default" : "destructive"
                          }
                        >
                          {row.status === "active"
                            ? t("admin.apiKeys.statusActive")
                            : t("admin.apiKeys.statusRevoked")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(row.created_at)}</td>
                      <td className="py-2 pr-4">
                        {formatDateTime(row.last_used_at)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {formatInt(row.total_usage)}
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
