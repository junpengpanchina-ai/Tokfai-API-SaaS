"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDebug } from "@/lib/admin/server";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminDebugCard({ debug }: { debug: AdminDebug }) {
  const { t } = useI18n();
  const title = debug.isForbidden
    ? t("admin.common.accessDenied")
    : t("admin.debug.adminError");
  const description = debug.isForbidden
    ? t("admin.common.notAuthorized")
    : debug.message;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <DebugRow label={t("admin.debug.statusCode")} value={debug.statusCode} />
          <DebugRow label={t("admin.debug.errorMessage")} value={debug.message} />
          <DebugRow label={t("admin.debug.apiBaseUrl")} value={debug.dmitBaseUrl} />
          <DebugRow
            label={t("admin.debug.hasSessionToken")}
            value={debug.hasAccessToken ? "yes" : "no"}
          />
          <DebugRow
            label={t("admin.debug.currentUserEmail")}
            value={debug.userEmail ?? "—"}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
    </div>
  );
}
