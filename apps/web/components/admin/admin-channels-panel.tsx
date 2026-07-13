"use client";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminReadonlyNotice } from "@/components/admin/admin-readonly-notice";
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
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

function channelDisplayName(
  row: AdminChannelRow,
  index: number,
  t: (key: string) => string
): string {
  if (row.priority <= 1 || index === 0) {
    return t("admin.channels.primaryChannel");
  }
  if (index === 1 || row.priority === 2) {
    return t("admin.channels.backupChannel");
  }
  return t("admin.channels.channelRole").replace("{n}", String(index + 1));
}

export function AdminChannelsPanel({
  channels,
  debug,
}: {
  channels: AdminChannelRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const sorted = [...channels].sort((a, b) => a.priority - b.priority);

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
            <Badge variant="secondary">{t("admin.common.readOnlySnapshot")}</Badge>
          </div>
          <CardDescription>{t("admin.channels.tableDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminReadonlyNotice
            titleKey="admin.channels.readonlyTitle"
            bodyKey="admin.channels.readonlyBody"
          />
          <div className="overflow-x-auto">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.channels.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colChannel")}
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
                  {sorted.map((row, index) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {channelDisplayName(row, index, t)}
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

          {sorted.length > 0 ? (
            <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">
                {t("admin.channels.technicalDetails")}
              </summary>
              <div className="mt-3 space-y-3">
                <Badge variant="outline">internal-only</Badge>
                {sorted.map((row, index) => (
                  <div
                    key={`tech-${row.id}`}
                    className="rounded border bg-background px-3 py-2 font-mono"
                  >
                    <p>
                      {channelDisplayName(row, index, t)} · id: {row.id}
                    </p>
                    <p>
                      {t("admin.channels.colProvider")}: {row.provider_name}
                    </p>
                    <p className="break-all">
                      {t("admin.channels.colBaseUrl")}: {row.base_url}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
