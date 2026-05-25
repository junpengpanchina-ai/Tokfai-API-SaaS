"use client";

import { AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function ApiKeysErrorView({
  message,
  method,
  url,
  httpStatus,
  code,
}: {
  message: string;
  method: string;
  url: string;
  httpStatus?: number;
  code?: string;
}) {
  const { t } = useI18n();

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
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs text-muted-foreground">
          method={method} url={url}
          <br />
          status={httpStatus ?? "n/a"} code={code ?? "n/a"}
          <br />
          message={message}
        </CardContent>
      </Card>
    </div>
  );
}
