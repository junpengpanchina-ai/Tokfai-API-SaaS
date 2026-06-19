"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Wand2 } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildGeneratedTemplate,
  DEFAULT_CONFIGURATOR_INPUT,
  recommendConfiguratorModel,
  resolveEffectiveConfiguratorApi,
  TEMPLATE_CONFIGURATOR_HASH,
  type ConfiguratorApi,
  type ConfiguratorIndustry,
  type ConfiguratorLanguage,
  type ConfiguratorModel,
  type ConfiguratorWorkloadSize,
  type TemplateConfiguratorInput,
} from "@/lib/customer-template-configurator";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

type StarterTemplateConfiguratorProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  initialInput?: Partial<TemplateConfiguratorInput>;
  compact?: boolean;
};

const INDUSTRIES: ConfiguratorIndustry[] = [
  "general",
  "hospital",
  "auto",
  "ecommerce",
  "support",
];

const APIS: ConfiguratorApi[] = ["chat", "responses", "image", "batch"];

const LANGUAGES: ConfiguratorLanguage[] = ["curl", "powershell", "node", "python"];

const WORKLOADS: ConfiguratorWorkloadSize[] = ["single", "small-batch", "large-batch"];

const MODELS: ConfiguratorModel[] = ["auto-fast", "auto-pro", "auto-cheap", "gpt-image-2"];

export function StarterTemplateConfigurator({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "template-configurator",
  initialInput,
  compact = false,
}: StarterTemplateConfiguratorProps) {
  const { t } = useI18n();
  const [industry, setIndustry] = useState<ConfiguratorIndustry>(
    initialInput?.industry ?? DEFAULT_CONFIGURATOR_INPUT.industry
  );
  const [api, setApi] = useState<ConfiguratorApi>(
    initialInput?.api ?? DEFAULT_CONFIGURATOR_INPUT.api
  );
  const [language, setLanguage] = useState<ConfiguratorLanguage>(
    initialInput?.language ?? DEFAULT_CONFIGURATOR_INPUT.language
  );
  const [workloadSize, setWorkloadSize] = useState<ConfiguratorWorkloadSize>(
    initialInput?.workloadSize ?? DEFAULT_CONFIGURATOR_INPUT.workloadSize
  );
  const [model, setModel] = useState<ConfiguratorModel>(
    initialInput?.model ?? DEFAULT_CONFIGURATOR_INPUT.model
  );

  useEffect(() => {
    if (initialInput?.industry) setIndustry(initialInput.industry);
    if (initialInput?.api) setApi(initialInput.api);
    if (initialInput?.language) setLanguage(initialInput.language);
    if (initialInput?.workloadSize) setWorkloadSize(initialInput.workloadSize);
    if (initialInput?.model) setModel(initialInput.model);
  }, [initialInput]);

  const recommendedModel = useMemo(
    () => recommendConfiguratorModel({ industry, api, workloadSize }),
    [industry, api, workloadSize]
  );

  useEffect(() => {
    if (api === "image") {
      setModel("gpt-image-2");
    }
  }, [api]);

  const input: TemplateConfiguratorInput = useMemo(
    () => ({
      industry,
      api,
      language,
      model: api === "image" ? "gpt-image-2" : model,
      workloadSize,
    }),
    [industry, api, language, model, workloadSize]
  );

  const generated = useMemo(
    () => buildGeneratedTemplate(input, apiKey, t),
    [input, apiKey, t]
  );

  const effectiveApi = resolveEffectiveConfiguratorApi(input);
  const isOneLine =
    language === "curl" || language === "powershell" || effectiveApi !== "batch";
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <section
      id={TEMPLATE_CONFIGURATOR_HASH}
      className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
    >
      {!compact ? (
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <Wand2 className="h-5 w-5 text-primary" />
            {t("integration.templateConfigurator.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.templateConfigurator.subtitle")}
          </p>
          {keyIsPlaceholder ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("integration.starterTemplates.storeKeyBackend")}
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              {t("integration.templateConfigurator.sessionKeyActive")}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("integration.templateConfigurator.industryLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={industry === value ? "default" : "outline"}
                onClick={() => setIndustry(value)}
              >
                {t(`integration.templateConfigurator.industry.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("integration.templateConfigurator.apiLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {APIS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={api === value ? "default" : "outline"}
                onClick={() => setApi(value)}
              >
                {t(`integration.starterTemplates.filter${value === "chat" ? "Chat" : value === "responses" ? "Responses" : value === "image" ? "Image" : "Batch"}`)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("integration.templateConfigurator.languageLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={language === value ? "default" : "outline"}
                onClick={() => setLanguage(value)}
              >
                {t(`integration.templateConfigurator.language.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("integration.templateConfigurator.workloadSize")}
          </p>
          <div className="flex flex-wrap gap-2">
            {WORKLOADS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={workloadSize === value ? "default" : "outline"}
                onClick={() => setWorkloadSize(value)}
                disabled={api === "image" || api === "responses"}
              >
                {t(`integration.templateConfigurator.workload.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        {api !== "image" ? (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("integration.templateConfigurator.modelRecommendation")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("integration.templateConfigurator.recommendedModel")}:{" "}
              <span className="font-mono text-foreground">{recommendedModel}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {MODELS.filter((m) => m !== "gpt-image-2").map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={model === value ? "default" : "outline"}
                  onClick={() => setModel(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("integration.templateConfigurator.modelRecommendation")}:{" "}
            <span className="font-mono text-foreground">gpt-image-2</span>
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{generated.title}</h3>
          <Badge variant="outline" className="font-mono text-xs">{generated.endpoint}</Badge>
          <Badge variant="outline" className="font-mono text-xs">{generated.model}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <CopyConfigAction
            id={`${idPrefix}-copy-generated`}
            value={generated.copyText}
            copiedId={copiedId}
            onCopy={onCopy}
            label={t("integration.templateConfigurator.copyGeneratedTemplate")}
            copiedLabel={t("integration.copied")}
            primary
          />
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">{t("integration.templateConfigurator.openUsage")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">{t("integration.templateConfigurator.openCredits")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/troubleshooting">
              {t("integration.templateConfigurator.openTroubleshooting")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#integration-plan">
              {t("integration.templateConfigurator.openIntegrationPlan")}
            </Link>
          </Button>
        </div>

        {isOneLine && language === "curl" ? (
          <pre
            className="mt-4 max-h-28 overflow-x-auto whitespace-nowrap rounded-md border bg-background p-3 font-mono text-xs"
          >
            {generated.copyText.split("\n").find((line) => line.startsWith("curl ")) ??
              generated.copyText}
          </pre>
        ) : (
          <pre
            className="mt-4 max-h-64 overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap break-all"
          >
            {generated.copyText}
          </pre>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("integration.templateConfigurator.expectedOutput")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {generated.expectedOutput.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("integration.templateConfigurator.reconcile")}
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {generated.reconcileSteps.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("integration.templateConfigurator.retryAdvice")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {generated.retryAdvice.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {generated.safetyBoundary.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("integration.templateConfigurator.safetyBoundary")}
              </p>
              <p className="mt-1 rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm text-muted-foreground dark:border-amber-900/40 dark:bg-amber-950/20">
                {generated.safetyBoundary.join(" ")}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
