"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  classifyPlaygroundError,
  playgroundRiskHintKey,
} from "@/lib/playground-risk-errors";

export type PlaygroundErrorPanelError = {
  status: number;
  code?: string | null;
  message: string;
};

export function PlaygroundErrorPanel({
  scope,
  error,
  t,
}: {
  scope: "playground" | "imagePlayground";
  error: PlaygroundErrorPanelError;
  t: (key: string) => string;
}) {
  const kind = classifyPlaygroundError(error.status, error.code);
  const hintKey = playgroundRiskHintKey(scope, kind);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t("dashboard.playground.requestFailed")}
        {error.status > 0 ? (
          <Badge variant="outline" className="font-mono text-xs">
            HTTP {error.status}
          </Badge>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-foreground">{error.message}</p>

      {hintKey ? (
        <p className="text-sm text-muted-foreground">{t(hintKey)}</p>
      ) : null}

      {kind === "credits" ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="w-fit">
            <Link href="/dashboard/credits">
              {t("dashboard.playground.addCredits")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/pricing">{t("dashboard.playground.viewPricing")}</Link>
          </Button>
        </div>
      ) : null}

      {kind === "auth" ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href="/dashboard/api-keys">
            {t("dashboard.playground.manageApiKeys")}
          </Link>
        </Button>
      ) : null}

      {kind === "upstream" && scope === "playground" ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href="/dashboard/models">{t("dashboard.playground.viewModels")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
