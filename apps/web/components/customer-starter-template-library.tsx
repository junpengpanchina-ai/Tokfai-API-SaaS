"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Layers, Search } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterStarterTemplates,
  getStarterTemplateCopyText,
  sortStarterTemplatesFeatured,
  STARTER_DOC_LABEL_KEYS,
  STARTER_TEMPLATES,
  starterTemplateDocHref,
  type StarterTemplateApi,
  type StarterTemplateIndustry,
  type StarterTemplateLanguage,
  type StarterTemplatePattern,
  type StarterTemplateCategory,
} from "@/lib/customer-starter-templates";
import { useI18n } from "@/lib/i18n/i18n-provider";

type CustomerStarterTemplateLibraryProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  compact?: boolean;
  hideHeader?: boolean;
  hideFilters?: boolean;
  sectionTitleKey?: string;
  sectionDescriptionKey?: string;
  presetCategories?: StarterTemplateCategory[];
  presetFeaturedOnly?: boolean;
  presetIndustry?: StarterTemplateIndustry;
};

function TemplateCard({
  template,
  apiKey,
  copiedId,
  onCopy,
  idPrefix,
  t,
}: {
  template: ReturnType<typeof filterStarterTemplates>[number];
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix: string;
  t: (key: string) => string;
}) {
  const copyText = getStarterTemplateCopyText(template, apiKey);
  const isOneLine =
    template.copyKind.includes("curl-oneline") || template.copyKind === "powershell-chat-oneline";

  return (
    <article
      id={template.id}
      className="min-w-0 rounded-lg border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        {template.featured ? (
          <Badge variant="secondary" className="text-xs">Featured</Badge>
        ) : null}
        <Badge variant="outline" className="font-mono text-xs">{template.endpoint}</Badge>
        <Badge variant="outline" className="font-mono text-xs">{template.model}</Badge>
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">{t(template.titleKey)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t(template.useCaseKey)}</p>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("integration.starterTemplates.whenToUse")}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {template.whenToUseKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("integration.starterTemplates.endpointModel")}:{" "}
        </span>
        {template.endpoint} · {template.model}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t(template.inputShapeKey)}</p>
      {template.safetyBoundaryKey ? (
        <p className="mt-3 rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm text-muted-foreground dark:border-amber-900/40 dark:bg-amber-950/20">
          <span className="font-medium text-foreground">
            {t("integration.starterTemplates.safetyBoundary")}:{" "}
          </span>
          {t(template.safetyBoundaryKey)}
        </p>
      ) : null}
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("integration.starterTemplates.expectedOutput")}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {template.expectedOutputKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("integration.starterTemplates.reconcile")}
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {template.reconcileStepKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("integration.starterTemplates.retryAdvice")}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {template.retryAdviceKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-${template.id}-copy`}
          value={copyText}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.starterTemplates.copyTemplate")}
          copiedLabel={t("integration.copied")}
          primary={template.id === "one-line-chat-curl"}
        />
        {template.relatedDocs.map((hash) => {
          const labelKey = STARTER_DOC_LABEL_KEYS[hash];
          if (!labelKey) return null;
          return (
            <Button key={hash} asChild size="sm" variant="outline">
              <Link href={starterTemplateDocHref(hash)}>
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                {t(labelKey)}
              </Link>
            </Button>
          );
        })}
      </div>
      {isOneLine ? (
        <pre
          className="mt-3 max-h-24 overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 p-2 font-mono text-xs"
        >
          {copyText}
        </pre>
      ) : (
        <pre
          className="mt-3 max-h-48 overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-all"
        >
          {copyText.slice(0, 480)}{copyText.length > 480 ? "…" : ""}
        </pre>
      )}
    </article>
  );
}

export function CustomerStarterTemplateLibrary({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "starter-templates",
  compact = false,
  hideHeader = false,
  hideFilters = false,
  sectionTitleKey,
  sectionDescriptionKey,
  presetCategories,
  presetFeaturedOnly = false,
  presetIndustry,
}: CustomerStarterTemplateLibraryProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<StarterTemplateLanguage | "all">("all");
  const [api, setApi] = useState<StarterTemplateApi | "all">("all");
  const [industry, setIndustry] = useState<StarterTemplateIndustry | "all">("all");
  const [pattern, setPattern] = useState<StarterTemplatePattern | "all">("all");

  const filtered = useMemo(() => {
    let list = STARTER_TEMPLATES;
    if (presetFeaturedOnly) {
      list = list.filter((item) => item.featured);
    }
    if (presetCategories?.length) {
      list = list.filter((item) => presetCategories.includes(item.category));
    }
    if (presetIndustry) {
      list = list.filter((item) => item.industry === presetIndustry);
    }
    const result = filterStarterTemplates(
      list,
      { query, language, api, industry: presetIndustry ? "all" : industry, pattern },
      t
    );
    return sortStarterTemplatesFeatured(result);
  }, [
    query,
    language,
    api,
    industry,
    pattern,
    presetCategories,
    presetFeaturedOnly,
    presetIndustry,
    t,
  ]);

  const showHeader = !compact && !hideHeader;
  const showFilters = !compact && !hideFilters;

  return (
    <div className="min-w-0 flex flex-col gap-4">
      {showHeader ? (
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <Layers className="h-5 w-5 text-primary" />
            {sectionTitleKey ? t(sectionTitleKey) : t("integration.starterTemplates.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sectionDescriptionKey
              ? t(sectionDescriptionKey)
              : t("integration.starterTemplates.subtitle")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("integration.starterTemplates.storeKeyBackend")}
          </p>
        </div>
      ) : sectionTitleKey ? (
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{t(sectionTitleKey)}</h3>
          {sectionDescriptionKey ? (
            <p className="mt-1 text-sm text-muted-foreground">{t(sectionDescriptionKey)}</p>
          ) : null}
        </div>
      ) : null}

      {showFilters ? (
        <>
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("integration.troubleshooting.searchPlaceholder")}
              className="pl-9"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("integration.starterTemplates.filterLanguage")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "filterAll"],
                  ["curl", "filterCurl"],
                  ["powershell", "filterPowerShell"],
                  ["node", "filterNode"],
                  ["python", "filterPython"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={language === value ? "default" : "outline"}
                  onClick={() => setLanguage(value)}
                >
                  {t(`integration.starterTemplates.${label}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("integration.starterTemplates.filterApi")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "filterAll"],
                  ["chat", "filterChat"],
                  ["responses", "filterResponses"],
                  ["image", "filterImage"],
                  ["batch", "filterBatch"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={api === value ? "default" : "outline"}
                  onClick={() => setApi(value)}
                >
                  {t(`integration.starterTemplates.${label}`)}
                </Button>
              ))}
            </div>
          </div>

          {!presetIndustry ? (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("integration.starterTemplates.filterIndustry")}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "filterAll"],
                    ["hospital", "filterHospital"],
                    ["auto", "filterAuto"],
                    ["ecommerce", "filterEcommerce"],
                    ["support", "filterSupport"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={industry === value ? "default" : "outline"}
                    onClick={() => setIndustry(value)}
                  >
                    {t(`integration.starterTemplates.${label}`)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("integration.starterTemplates.filterPattern")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "filterAll"],
                  ["retry", "filterRetry"],
                  ["batch", "filterBatch"],
                  ["traffic-governor", "filterTrafficGovernor"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={pattern === value ? "default" : "outline"}
                  onClick={() => setPattern(value)}
                >
                  {t(`integration.starterTemplates.${label}`)}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4">
        {filtered.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            {t("integration.starterTemplates.noResults")}
          </p>
        ) : (
          filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
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
