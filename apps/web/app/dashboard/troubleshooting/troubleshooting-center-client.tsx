"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Search, Wrench } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/i18n-provider";

import {
  filterTroubleshootingByCategory,
  searchTroubleshootingCases,
  TROUBLESHOOTING_CATEGORIES,
  TROUBLESHOOTING_DOC_LABEL_KEYS,
  troubleshootingDocHref,
  type TroubleshootingCategory,
  type TroubleshootingCase,
} from "./troubleshooting-cases";
import { getTroubleshootingCopySnippet } from "./troubleshooting-display-helpers";

type TroubleshootingCenterClientProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  initialQuery?: string;
  initialCategory?: TroubleshootingCategory | "all";
  compact?: boolean;
};

function chargedLabel(
  charged: TroubleshootingCase["charged"],
  t: (key: string) => string
): string {
  switch (charged) {
    case "usually_no":
      return t("integration.troubleshooting.chargedUsuallyNo");
    case "success_only":
      return t("integration.troubleshooting.chargedSuccessOnly");
    case "check_usage_credits":
      return t("integration.troubleshooting.chargedCheckUsage");
  }
}

function TroubleshootingCaseCard({
  caseItem,
  apiKey,
  copiedId,
  onCopy,
  idPrefix,
  t,
}: {
  caseItem: TroubleshootingCase;
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix: string;
  t: (key: string) => string;
}) {
  const copyValue = caseItem.copySnippetId
    ? getTroubleshootingCopySnippet(caseItem.copySnippetId, apiKey)
    : "";

  return (
    <article
      id={caseItem.id}
      className="min-w-0 rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          {typeof caseItem.httpStatus === "number"
            ? `HTTP ${caseItem.httpStatus}`
            : caseItem.httpStatus}
        </Badge>
        <Badge variant="secondary" className="font-mono text-xs">
          {caseItem.errorCode}
        </Badge>
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">
        {t(caseItem.titleKey)}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("integration.troubleshooting.likelyCause")}:{" "}
        </span>
        {t(caseItem.likelyCauseKey)}
      </p>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("integration.troubleshooting.whatToDo")}
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          {caseItem.customerActionKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">
            {t("integration.troubleshooting.retry")}
          </dt>
          <dd className="font-medium text-foreground">
            {caseItem.shouldRetry
              ? t("integration.troubleshooting.retryYes")
              : t("integration.troubleshooting.retryNo")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t("integration.troubleshooting.charged")}
          </dt>
          <dd className="font-medium text-foreground">
            {chargedLabel(caseItem.charged, t)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {caseItem.copySnippetId && copyValue ? (
          <CopyConfigAction
            id={`${idPrefix}-${caseItem.id}-fix`}
            value={copyValue}
            copiedId={copiedId}
            onCopy={onCopy}
            label={t("integration.troubleshooting.copyFix")}
            copiedLabel={t("integration.copied")}
          />
        ) : null}
        {caseItem.relatedDocs.map((hash) => {
          const labelKey = TROUBLESHOOTING_DOC_LABEL_KEYS[hash];
          if (!labelKey) return null;
          return (
            <Button key={hash} asChild size="sm" variant="outline">
              <Link href={troubleshootingDocHref(hash)}>
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                {t(labelKey)}
              </Link>
            </Button>
          );
        })}
      </div>
    </article>
  );
}

export function TroubleshootingCenterClient({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "troubleshooting",
  initialQuery = "",
  initialCategory = "all",
  compact = false,
}: TroubleshootingCenterClientProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<TroubleshootingCategory | "all">(
    initialCategory
  );

  const filtered = useMemo(() => {
    const searched = searchTroubleshootingCases(query, t);
    return filterTroubleshootingByCategory(searched, category);
  }, [query, category, t]);

  return (
    <div className="min-w-0 flex flex-col gap-4">
      {!compact ? (
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <Wrench className="h-5 w-5 text-primary" />
            {t("integration.troubleshooting.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.troubleshooting.subtitle")}
          </p>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("integration.troubleshooting.searchPlaceholder")}
            className="pl-9"
            aria-label={t("integration.troubleshooting.searchPlaceholder")}
          />
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/dashboard/docs#usage-credits">
            {t("integration.troubleshooting.openUsageCredits")}
          </Link>
        </Button>
      </div>

      <nav
        className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1"
        aria-label={t("integration.troubleshooting.categoryNav")}
      >
        <Button
          type="button"
          size="sm"
          variant={category === "all" ? "default" : "outline"}
          onClick={() => setCategory("all")}
        >
          {t("integration.troubleshooting.categoryAll")}
        </Button>
        {TROUBLESHOOTING_CATEGORIES.map((cat) => (
          <Button
            key={cat}
            type="button"
            size="sm"
            variant={category === cat ? "default" : "outline"}
            onClick={() => setCategory(cat)}
          >
            {t(`integration.troubleshooting.category.${cat}`)}
          </Button>
        ))}
      </nav>

      <p className="text-xs text-muted-foreground">
        {t("integration.troubleshooting.useRequestId")}
      </p>

      <div className="flex min-w-0 flex-col gap-4">
        {filtered.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            {t("integration.troubleshooting.noResults")}
          </p>
        ) : (
          filtered.map((caseItem) => (
            <TroubleshootingCaseCard
              key={caseItem.id}
              caseItem={caseItem}
              apiKey={apiKey}
              copiedId={copiedId}
              onCopy={onCopy}
              idPrefix={idPrefix}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
