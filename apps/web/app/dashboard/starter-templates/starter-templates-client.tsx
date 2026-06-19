"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { CustomerStarterTemplateLibrary } from "@/components/customer-starter-template-library";
import { StarterTemplateConfigurator } from "@/components/starter-template-configurator";
import { Button } from "@/components/ui/button";
import {
  parseConfiguratorSearchParams,
  TEMPLATE_CONFIGURATOR_PATH,
} from "@/lib/customer-template-configurator";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useQuickStartApiKey } from "@/lib/use-quick-start-api-key";

export function StarterTemplatesPageClient() {
  const { t } = useI18n();
  const apiKey = useQuickStartApiKey();
  const { copiedId, copyText } = useCopyToClipboard();
  const searchParams = useSearchParams();

  const configuratorInitial = useMemo(
    () => parseConfiguratorSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("integration.starterTemplates.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("integration.starterTemplates.subtitle")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={TEMPLATE_CONFIGURATOR_PATH}>
              {t("integration.templateConfigurator.buildTemplate")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">{t("integration.templateConfigurator.openUsage")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">{t("integration.templateConfigurator.openCredits")}</Link>
          </Button>
        </div>
      </div>

      <StarterTemplateConfigurator
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-starter-configurator"
        initialInput={configuratorInitial}
      />

      <CustomerStarterTemplateLibrary
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-starter-featured"
        hideHeader
        hideFilters
        sectionTitleKey="integration.templateConfigurator.sectionRecommended"
        sectionDescriptionKey="integration.templateConfigurator.sectionRecommendedDesc"
        presetFeaturedOnly
      />

      <CustomerStarterTemplateLibrary
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-starter-industry"
        hideHeader
        hideFilters
        sectionTitleKey="integration.templateConfigurator.sectionIndustry"
        presetCategories={["industry"]}
      />

      <CustomerStarterTemplateLibrary
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-starter-patterns"
        hideHeader
        hideFilters
        sectionTitleKey="integration.templateConfigurator.sectionPatterns"
        presetCategories={["retry", "batch", "traffic-governor"]}
      />

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("integration.templateConfigurator.sectionReconcile")}
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("integration.starterTemplates.reconcileStep1")}</li>
          <li>{t("integration.starterTemplates.reconcileStep2")}</li>
          <li>{t("integration.starterTemplates.reconcileStep3")}</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">{t("integration.templateConfigurator.openUsage")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">{t("integration.templateConfigurator.openCredits")}</Link>
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("integration.templateConfigurator.sectionSafety")}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("integration.industryTemplates.hospital.boundary")}</li>
          <li>{t("integration.industryTemplates.automotive.boundary")}</li>
          <li>{t("integration.industryTemplates.ecommerce.boundary")}</li>
          <li>{t("integration.industryTemplates.support.boundary")}</li>
        </ul>
      </section>
    </div>
  );
}
