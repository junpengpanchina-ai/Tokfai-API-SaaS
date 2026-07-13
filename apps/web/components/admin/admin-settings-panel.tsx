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
import type { AdminSettingsView } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

function boolLabel(value: boolean, t: (key: string) => string): string {
  return value ? t("admin.settings.yes") : t("admin.settings.no");
}

export function AdminSettingsPanel({
  settings,
  debug,
}: {
  settings: AdminSettingsView | null;
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.settings.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.settings.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.settings.panelTitle")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlyConfig")}</Badge>
          </div>
          <CardDescription>{t("admin.settings.panelDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminReadonlyNotice
            titleKey="admin.settings.readonlyTitle"
            bodyKey="admin.settings.readonlyBody"
          />

          {settings ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.siteName")}
                </dt>
                <dd className="mt-1 font-medium">{settings.site_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.defaultSignupCredits")}
                </dt>
                <dd className="mt-1 font-medium">
                  {settings.default_signup_credits ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.apiBaseUrl")}
                </dt>
                <dd className="mt-1 font-mono text-sm">{settings.api_base_url}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.paymentsEnabled")}
                </dt>
                <dd className="mt-1 font-medium">
                  {boolLabel(settings.payments_enabled, t)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.registrationEnabled")}
                </dt>
                <dd className="mt-1 font-medium">
                  {boolLabel(settings.registration_enabled, t)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.maintenanceMode")}
                </dt>
                <dd className="mt-1 font-medium">
                  {boolLabel(settings.maintenance_mode, t)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  {t("admin.settings.updatedAt")}
                </dt>
                <dd className="mt-1 font-medium">
                  {formatDateTime(settings.updated_at)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin.settings.loadFailed")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
