"use client";

import Link from "next/link";

import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  INDUSTRY_TEMPLATE_PACKS,
  INDUSTRY_TEMPLATES,
  buildTemplateCurlOneLine,
  buildTemplatePowerShellCurlOneLine,
  getTemplateInputJson,
  type IndustryTemplateDef,
} from "@/lib/customer-industry-templates";
import { useI18n } from "@/lib/i18n/i18n-provider";

type IndustryTemplateCardProps = {
  template: IndustryTemplateDef;
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function IndustryTemplateCard({
  template,
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "industry-template",
}: IndustryTemplateCardProps) {
  const { t } = useI18n();
  const prefix = `${idPrefix}-${template.id}`;

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">{t(template.useCaseKey)}</h4>
        <Badge variant="outline" className="font-mono text-[10px]">
          {template.endpoint}
        </Badge>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {template.model}
        </Badge>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.useCaseLabel")}
          </dt>
          <dd className="text-muted-foreground">{t(template.useCaseKey)}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.inputLabel")}
          </dt>
          <dd className="mt-1">
            <code className="block max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
              {getTemplateInputJson(template.id)}
            </code>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(template.inputExampleKey)}
            </p>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.expectedResponseLabel")}
          </dt>
          <dd className="text-muted-foreground">{t(template.expectedResponseKey)}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.reconcileLabel")}
          </dt>
          <dd className="text-muted-foreground">{t(template.reconcileKey)}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.billingLabel")}
          </dt>
          <dd className="text-muted-foreground">{t(template.billingKey)}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.boundaryLabel")}
          </dt>
          <dd className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {t(template.boundaryKey)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">
            {t("integration.industryTemplates.nextStepLabel")}
          </dt>
          <dd className="text-muted-foreground">{t(template.nextStepKey)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <OneLineCurlCopyFields
          apiKey={apiKey}
          bashLabel={t(template.curlLabelKey)}
          bashCurl={buildTemplateCurlOneLine(template.id, apiKey)}
          powershellCurl={buildTemplatePowerShellCurlOneLine(template.id, apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={prefix}
          showKeyNote={false}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
        </Button>
      </div>
    </div>
  );
}

type IndustryTemplatePackPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function IndustryTemplatePackPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "industry-pack",
}: IndustryTemplatePackPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      {INDUSTRY_TEMPLATE_PACKS.map((pack) => (
        <div key={pack.id} id={`industry-pack-${pack.id}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">{t(pack.titleKey)}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`integration.industry.${pack.id}.purpose`)}
          </p>
          <div className="flex flex-col gap-4">
            {pack.templateIds.map((templateId) => (
              <IndustryTemplateCard
                key={templateId}
                template={INDUSTRY_TEMPLATES[templateId]}
                apiKey={apiKey}
                copiedId={copiedId}
                onCopy={onCopy}
                idPrefix={`${idPrefix}-${pack.id}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
