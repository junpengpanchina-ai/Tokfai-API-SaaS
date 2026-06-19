"use client";

import Link from "next/link";
import { FileText, ListChecks } from "lucide-react";

import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import type { CapacityPlannerInput, CapacityPlannerOutput } from "@/lib/customer-capacity-planner";
import { buildCustomerIntegrationPlan } from "@/lib/customer-integration-plan";
import {
  buildGoLiveAcceptanceText,
  buildIntegrationPlanJson,
  buildIntegrationPlanMarkdown,
  buildIntegrationPlanPlainText,
} from "@/lib/customer-integration-plan-copy";
import { useI18n } from "@/lib/i18n/i18n-provider";

type IntegrationHandoffPanelProps = {
  input: CapacityPlannerInput;
  capacityPlan: CapacityPlannerOutput;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
};

export function IntegrationHandoffPanel({
  input,
  capacityPlan,
  copiedId,
  onCopy,
  idPrefix = "handoff-pack",
  showTitle = true,
}: IntegrationHandoffPanelProps) {
  const { t } = useI18n();
  const integrationPlan = buildCustomerIntegrationPlan(input);
  const plainText = buildIntegrationPlanPlainText(integrationPlan, input);
  const markdown = buildIntegrationPlanMarkdown(integrationPlan, input);
  const jsonConfig = buildIntegrationPlanJson(integrationPlan, input);
  const goLiveAcceptance = buildGoLiveAcceptanceText();

  return (
    <div id="integration-plan" className="flex flex-col gap-4 rounded-lg border-2 border-primary/20 bg-background/80 p-4">
      {showTitle ? (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            {t("integration.handoff.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("integration.handoff.note")}</p>
        </div>
      ) : null}

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-semibold text-foreground">{integrationPlan.title}</p>
        <p className="mt-2 text-muted-foreground">{integrationPlan.summary}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integration.handoff.architectureTitle")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {integrationPlan.recommendedArchitecture.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integration.handoff.endpointTitle")}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {integrationPlan.endpointSplit.map((row) => (
              <li key={row.endpoint} className="rounded border bg-background/80 px-2 py-1.5">
                <span className="font-mono text-xs text-foreground">{row.endpoint}</span>
                <p className="mt-0.5">{row.workload}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integration.handoff.concurrencyTitle")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Chat: {integrationPlan.concurrencyPlan.chatConcurrency}</li>
            <li>Image: {integrationPlan.concurrencyPlan.imageConcurrency}</li>
            <li>Batch: {integrationPlan.concurrencyPlan.batchItemsPerJob} items/job</li>
            <li>
              Poll: {integrationPlan.concurrencyPlan.batchPollIntervalSeconds}s
              {capacityPlan.batchFirstRecommended
                ? ` — ${t("integration.handoff.batchRecommended")}`
                : null}
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integration.handoff.retryTitle")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {integrationPlan.retryPlan.map((row) => (
              <li key={row.error}>
                <span className="font-mono text-xs">{row.error}</span> — {row.action}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("integration.handoff.reconcileTitle")}
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {integrationPlan.reconciliationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          {t("integration.handoff.goLiveTitle")}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {integrationPlan.acceptanceChecklist.slice(0, 6).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyableSnippetField
          label={t("integration.handoff.copyPlain")}
          value={plainText}
          copyId={`${idPrefix}-plain`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyConfig")}
          copiedLabel={t("integration.copied")}
          className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
        <CopyableSnippetField
          label={t("integration.handoff.copyMarkdown")}
          value={markdown}
          copyId={`${idPrefix}-markdown`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyConfig")}
          copiedLabel={t("integration.copied")}
          className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
        <CopyableSnippetField
          label={t("integration.handoff.copyJson")}
          value={jsonConfig}
          copyId={`${idPrefix}-json`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyConfig")}
          copiedLabel={t("integration.copied")}
          className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
        <CopyableSnippetField
          label={t("integration.handoff.copyGoLive")}
          value={goLiveAcceptance}
          copyId={`${idPrefix}-go-live`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyConfig")}
          copiedLabel={t("integration.copied")}
          className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#usage-credits">{t("integration.linkUsageCreditsGuide")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#retry-and-backoff">{t("integration.navRetryBackoff")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/docs#batch-worker">{t("integration.navBatchWorker")}</Link>
        </Button>
      </div>
    </div>
  );
}
