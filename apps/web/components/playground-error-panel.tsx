"use client";

import Link from "next/link";
import { AlertTriangle, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  troubleshootingCaseByErrorCode,
  TROUBLESHOOTING_DASHBOARD_PATH,
} from "@/lib/customer-troubleshooting";
import {
  classifyPlaygroundError,
  playgroundRiskHintKey,
} from "@/lib/playground-risk-errors";

export type PlaygroundErrorPanelError = {
  status: number;
  code?: string | null;
  message: string;
  requestId?: string | null;
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
  const hintKey = playgroundRiskHintKey(scope, kind, error.code);
  const troubleshootHref = error.code
    ? `${TROUBLESHOOTING_DASHBOARD_PATH}?code=${encodeURIComponent(error.code)}`
    : TROUBLESHOOTING_DASHBOARD_PATH;
  const matchedCase = error.code ? troubleshootingCaseByErrorCode(error.code) : undefined;

  async function copyRequestId() {
    if (!error.requestId) return;
    try {
      await navigator.clipboard.writeText(error.requestId);
    } catch {
      // ignore clipboard errors
    }
  }

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

      <dl className="space-y-1 text-xs text-muted-foreground">
        {error.code ? (
          <div>
            <span className="font-medium">{t("dashboard.playground.errorCode")}: </span>
            <span className="font-mono text-foreground">{error.code}</span>
          </div>
        ) : null}
        {error.requestId ? (
          <div className="break-all">
            <span className="font-medium">
              {t("dashboard.playground.errorRequestId")}:{" "}
            </span>
            <span className="font-mono text-foreground">{error.requestId}</span>
          </div>
        ) : null}
      </dl>

      {hintKey ? (
        <p className="text-sm text-muted-foreground">{t(hintKey)}</p>
      ) : null}
      {matchedCase ? (
        <p className="text-sm text-muted-foreground">
          {t(matchedCase.likelyCauseKey)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href={troubleshootHref}>
            {t("dashboard.playground.openTroubleshootingGuide")}
          </Link>
        </Button>
        {error.code ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/dashboard/docs#error-codes">
              {t("dashboard.playground.viewErrorCodesDocs")}
            </Link>
          </Button>
        ) : null}
        {error.requestId ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => copyRequestId()}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              {t("dashboard.playground.copyRequestId")}
            </Button>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/dashboard/usage">
                {t("dashboard.playground.viewUsage")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/dashboard/credits">
                {t("dashboard.playground.viewCredits")}
              </Link>
            </Button>
          </>
        ) : null}
      </div>

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

      {(kind === "upstream" ||
        (kind === "validation" && error.code === "model_not_available")) &&
      scope === "playground" ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href="/dashboard/models">{t("dashboard.playground.viewModels")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
