"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Wrench } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildApiReadinessMessages,
  checkApiReadiness,
  type ApiReadiness,
} from "@/lib/customer-api-readiness";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ApiServiceReadinessBannerProps = {
  className?: string;
  /** When set, available state offers one-line curl as primary action. */
  curlOneLine?: string;
  copiedId?: string | null;
  onCopy?: (id: string, value: string) => void;
  curlCopyId?: string;
  compact?: boolean;
};

function readinessBadge(readiness: ApiReadiness, t: (key: string) => string) {
  if (readiness.status === "checking") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("integration.apiReadiness.checking")}
      </Badge>
    );
  }
  if (readiness.status === "available") {
    return <Badge variant="success">{t("integration.apiReadiness.badgeReady")}</Badge>;
  }
  return <Badge variant="warning">{t("integration.apiReadiness.badgePrepare")}</Badge>;
}

export function ApiReadinessMiniBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  const [readiness, setReadiness] = useState<ApiReadiness>({ status: "checking" });
  const messages = useMemo(() => buildApiReadinessMessages(t), [t]);

  useEffect(() => {
    let cancelled = false;
    checkApiReadiness(messages).then((result) => {
      if (!cancelled) setReadiness(result);
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  return <div className={className}>{readinessBadge(readiness, t)}</div>;
}

export function ApiServiceReadinessBanner({
  className,
  curlOneLine,
  copiedId = null,
  onCopy,
  curlCopyId = "api-readiness-curl",
  compact = false,
}: ApiServiceReadinessBannerProps) {
  const { t } = useI18n();
  const [readiness, setReadiness] = useState<ApiReadiness>({ status: "checking" });
  const messages = useMemo(() => buildApiReadinessMessages(t), [t]);

  useEffect(() => {
    let cancelled = false;
    checkApiReadiness(messages).then((result) => {
      if (!cancelled) setReadiness(result);
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const borderClass =
    readiness.status === "available"
      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30"
      : readiness.status === "unavailable"
        ? "border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30"
        : "border-border bg-muted/30";

  const title =
    readiness.status === "checking"
      ? t("integration.apiReadiness.title")
      : readiness.status === "available"
        ? readiness.label
        : readiness.label;

  const description =
    readiness.status === "checking"
      ? t("integration.apiReadiness.checking")
      : readiness.status === "available"
        ? readiness.description
        : readiness.description;

  const canCopyCurl =
    curlOneLine && onCopy && copiedId !== undefined;

  if (compact) {
    return (
      <div
        className={`min-w-0 rounded-lg border p-3 text-sm ${borderClass} ${className ?? ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {readinessBadge(readiness, t)}
          <span className="font-medium text-foreground">{title}</span>
        </div>
        <p className="mt-2 text-muted-foreground">{description}</p>
        {readiness.status === "unavailable" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("integration.apiReadiness.verifyLater")}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/dashboard/integration-workbench">
              {t("integration.apiReadiness.openWorkbench")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-w-0 rounded-lg border p-4 sm:p-5 ${borderClass} ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {readinessBadge(readiness, t)}
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          {readiness.status === "unavailable" ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {readiness.recommendedAction}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("integration.apiReadiness.verifyLater")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("integration.apiReadiness.verifyFailsHint")}
              </p>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {curlOneLine && onCopy && copiedId !== undefined ? (
          <CopyConfigAction
            id={curlCopyId}
            value={curlOneLine}
            copiedId={copiedId}
            onCopy={onCopy}
            label={t("integration.apiReadiness.copyCurl")}
            copiedLabel={t("integration.copied")}
            primary
          />
        ) : null}
        {readiness.status === "unavailable" ? (
          <Button type="button" size="sm" variant={canCopyCurl ? "outline" : "default"} asChild>
            <Link href="/dashboard/integration-workbench">
              <Wrench className="mr-1.5 h-4 w-4" />
              {t("integration.apiReadiness.continuePreparing")}
            </Link>
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href="/dashboard/integration-workbench">
            {t("integration.apiReadiness.openWorkbench")}
          </Link>
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href="/dashboard/docs#usage-credits">
            {t("integration.apiReadiness.openUsageCredits")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
