"use client";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminDisabledWriteActions } from "@/components/admin/admin-disabled-write-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminChannelRow } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminChannelsPanel({
  channels,
  debug,
}: {
  channels: AdminChannelRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.channels.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.channels.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.channels.tableTitle")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
          </div>
          <CardDescription>{t("admin.channels.tableDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDisabledWriteActions
            actionKeys={[
              "admin.channels.toggleChannel",
              "admin.channels.testChannel",
            ]}
          />
          <div className="mt-4 overflow-x-auto">
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.channels.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colProvider")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colBaseUrl")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colStatus")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colPriority")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colWeight")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colTimeout")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colSuccessRate")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colLastError")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.provider_name}</td>
                      <td className="max-w-[200px] truncate py-2 pr-4 font-mono text-xs">
                        {row.base_url}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={row.enabled ? "default" : "secondary"}
                        >
                          {row.enabled
                            ? t("admin.channels.statusActive")
                            : t("admin.channels.statusDisabled")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">{row.priority}</td>
                      <td className="py-2 pr-4">{row.weight}</td>
                      <td className="py-2 pr-4">
                        {row.timeout_ms != null
                          ? `${formatInt(row.timeout_ms)} ms`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.success_rate != null
                          ? `${row.success_rate}%`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">{row.last_error ?? "—"}</td>
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
