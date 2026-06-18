"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  Car,
  Headphones,
  KeyRound,
  Link2,
  ShoppingBag,
  Terminal,
  Wrench,
} from "lucide-react";

import { SafeRetryCopyPanel } from "@/components/safe-retry-copy-panel";
import { CustomerApiPathPanel } from "@/components/customer-api-path-panel";
import { CapacityReadinessPanel } from "@/components/capacity-model-panel";
import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import { Button } from "@/components/ui/button";
import {
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
  modelsCurlOneLine,
  modelsCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import {
  buildIndustryCurlOneLine,
  type IndustryPackId,
} from "@/lib/customer-industry-templates";
import { useI18n } from "@/lib/i18n/i18n-provider";

const WORKBENCH_TROUBLESHOOT_CODES = [
  "missing_token",
  "invalid_token",
  "insufficient_credits",
  "route_not_found",
  "stream_not_supported",
  "upstream_timeout",
] as const;

const WORKBENCH_INDUSTRY_IDS: IndustryPackId[] = [
  "hospital",
  "automotive",
  "ecommerce",
  "support",
];

const INDUSTRY_ICONS: Record<IndustryPackId, typeof Building2> = {
  hospital: Building2,
  automotive: Car,
  ecommerce: ShoppingBag,
  support: Headphones,
};

type IntegrationWorkbenchPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

function WorkbenchCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Terminal;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {title}
      </p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function IntegrationWorkbenchPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "integration-workbench",
}: IntegrationWorkbenchPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <WorkbenchCard icon={KeyRound} title={t("integration.workbench.verifyKeyTitle")}>
        <p className="text-sm text-muted-foreground">
          {t("integration.workbench.verifyKeyNote")}
        </p>
        <OneLineCurlCopyFields
          apiKey={apiKey}
          bashLabel={t("integration.workbench.verifyChatCurlLabel")}
          bashCurl={chatCurlOneLine(apiKey)}
          powershellCurl={chatCurlPowerShellOneLine(apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={`${idPrefix}-verify-chat`}
          liveKeyNoteKey="integration.workbench.sessionKeyNote"
        />
        <OneLineCurlCopyFields
          apiKey={apiKey}
          bashLabel={t("integration.workbench.verifyModelsCurlLabel")}
          bashCurl={modelsCurlOneLine(apiKey)}
          powershellCurl={modelsCurlPowerShellOneLine(apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={`${idPrefix}-verify-models`}
          showKeyNote={false}
        />
        <p className="text-xs text-muted-foreground">
          {t("integration.oneLineCurlSuccessFields")}
        </p>
      </WorkbenchCard>

      <WorkbenchCard icon={Link2} title={t("integration.workbench.connectTitle")}>
        <p className="text-sm text-muted-foreground">
          {t("integration.workbench.connectCurlFirst")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#cursor">{t("integration.navCursor")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#cherry-studio">
              {t("integration.navCherry")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#openai-sdk">{t("integration.navOpenAiSdk")}</Link>
          </Button>
        </div>
      </WorkbenchCard>

      <WorkbenchCard icon={Activity} title={t("integration.workbench.reconcileTitle")}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("integration.workbench.reconcileStep1")}</li>
          <li>{t("integration.workbench.reconcileStep2")}</li>
          <li>{t("integration.workbench.reconcileStep3")}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#usage-credits">
              {t("integration.linkUsageCreditsGuide")}
            </Link>
          </Button>
        </div>
      </WorkbenchCard>

      <WorkbenchCard icon={Wrench} title={t("integration.workbench.troubleshootTitle")}>
        <ul className="space-y-3 text-sm">
          {WORKBENCH_TROUBLESHOOT_CODES.map((code) => (
            <li key={code} className="rounded-md border bg-background/80 px-3 py-2">
              <p className="font-mono text-xs font-medium text-foreground">{code}</p>
              <p className="mt-1 text-muted-foreground">
                {t(`integration.workbench.troubleshoot.${code}`)}
              </p>
            </li>
          ))}
        </ul>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#error-codes">{t("integration.navErrors")}</Link>
        </Button>
      </WorkbenchCard>

      <WorkbenchCard icon={Terminal} title={t("integration.safeRetry.workbenchTitle")}>
        <SafeRetryCopyPanel
          apiKey={apiKey}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={`${idPrefix}-safe-retry`}
          showTitle={false}
          snippetIds={[
            "bash-safe-retry",
            "powershell-safe-retry",
            "node-safe-retry",
            "python-safe-retry",
          ]}
        />
      </WorkbenchCard>

      <WorkbenchCard icon={Terminal} title={t("integration.apiPath.chooseTitle")}>
        <CustomerApiPathPanel
          apiKey={apiKey}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={`${idPrefix}-api-path`}
          showTitle={false}
        />
      </WorkbenchCard>

      <WorkbenchCard icon={Building2} title={t("integration.workbench.industryTitle")}>
        <p className="text-sm text-muted-foreground">
          {t("integration.workbench.industryGatewayNote")}
        </p>
        {WORKBENCH_INDUSTRY_IDS.map((industryId) => {
          const Icon = INDUSTRY_ICONS[industryId];
          const curl = buildIndustryCurlOneLine(industryId, apiKey);
          return (
            <div
              key={industryId}
              className="rounded-md border bg-background/80 px-3 py-3"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {t(`integration.industryOverview.${industryId}.scenario`)}
              </p>
              <CopyableSnippetField
                label={t("integration.workbench.industryCurlLabel")}
                value={curl}
                copyId={`${idPrefix}-industry-${industryId}`}
                copiedId={copiedId}
                onCopy={onCopy}
                copyLabel={t("integration.copyOneLineCurl")}
                copiedLabel={t("integration.copied")}
                className="mt-2 [&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
              />
            </div>
          );
        })}
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#industry-examples">
            {t("integration.navIndustry")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#industry-pack-hospital">
            {t("integration.industryTemplates.viewHospitalPack")}
          </Link>
        </Button>
      </WorkbenchCard>

      <WorkbenchCard icon={Activity} title={t("integration.workbench.slowUpstreamTitle")}>
        <p className="text-sm text-muted-foreground">
          {t("integration.workbench.slowUpstreamNote")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#capacity-and-rate-limits">
              {t("integration.navCapacity")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#rate-limits-large-volume">
              {t("integration.workbench.retryGuideTitle")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#batch-api">
              {t("integration.workbench.batchVolumeTitle")}
            </Link>
          </Button>
        </div>
      </WorkbenchCard>

      <CapacityReadinessPanel idPrefix={`${idPrefix}-capacity-readiness`} />

      <div className="rounded-lg border border-amber-300/50 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          {t("integration.workbench.serviceUnavailableTitle")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("integration.workbench.serviceUnavailableIntro")}
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("integration.workbench.serviceUnavailableStatus")}</li>
          <li>{t("integration.workbench.serviceUnavailableRoute")}</li>
          <li>{t("integration.workbench.serviceUnavailableInvalid")}</li>
          <li>{t("integration.workbench.serviceUnavailableCredits")}</li>
          <li>{t("integration.workbench.serviceUnavailableUpstream")}</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("integration.workbench.serviceUnavailableSafe")}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link href="/dashboard/docs#service-unavailable">
            {t("integration.navServiceUnavailable")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
