"use client";

import { AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function ApiKeysErrorView({
  message,
  messageKey,
  method,
  url,
  httpStatus,
  code,
}: {
  message?: string;
  messageKey?: "auth" | "load" | "temp";
  method: string;
  url: string;
  httpStatus?: number;
  code?: string;
}) {
  const { t } = useDashboardLabels();
  const displayMessage =
    messageKey === "auth"
      ? t("dashboard.apiKeys.loadErrorAuthDesc")
      : messageKey === "load"
        ? t("dashboard.apiKeys.loadErrorTempDesc")
        : messageKey === "temp"
          ? t("dashboard.apiKeys.loadErrorTempDesc")
          : (message ?? t("dashboard.apiKeys.loadErrorTempDesc"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.apiKeys.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.apiKeys.subtitleMeta")}
        </p>
      </div>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t("dashboard.apiKeys.loadError")}
          </CardTitle>
          <CardDescription>{displayMessage}</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs text-muted-foreground">
          method={method} url={url}
          <br />
          status={httpStatus ?? "n/a"} code={code ?? "n/a"}
          <br />
          message={displayMessage}
        </CardContent>
      </Card>
    </div>
  );
}
