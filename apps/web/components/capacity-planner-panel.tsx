"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, Calculator, Terminal } from "lucide-react";

import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { chatCurlOneLine } from "@/lib/customer-curl-oneline";
import {
  buildRecommendedConfigSnippet,
  DEFAULT_PLANNER_INPUT,
  ONLINE_USER_PRESETS,
  PLANNER_INDUSTRIES,
  TRAFFIC_SHAPES,
  planCapacity,
  type CapacityPlannerInput,
  type PlannerIndustry,
  type TrafficShape,
} from "@/lib/customer-capacity-planner";
import { buildTrafficGovernorSnippet } from "@/lib/customer-traffic-governor-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type CapacityPlannerPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
};

export function CapacityPlannerPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "capacity-planner",
  showTitle = true,
}: CapacityPlannerPanelProps) {
  const { t } = useI18n();
  const [input, setInput] = useState<CapacityPlannerInput>(DEFAULT_PLANNER_INPUT);

  const plan = useMemo(() => planCapacity(input), [input]);
  const configSnippet = useMemo(
    () => buildRecommendedConfigSnippet(plan, input.industry),
    [plan, input.industry]
  );

  const update = <K extends keyof CapacityPlannerInput>(key: K, value: CapacityPlannerInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div id="capacity-planner" className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("integration.capacityPlanner.panelTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.capacityPlanner.panelNote")}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-industry`}>
            {t("integration.capacityPlanner.industryLabel")}
          </Label>
          <select
            id={`${idPrefix}-industry`}
            className={SELECT_CLASS}
            value={input.industry}
            onChange={(e) => update("industry", e.target.value as PlannerIndustry)}
          >
            {PLANNER_INDUSTRIES.map((id) => (
              <option key={id} value={id}>
                {t(`integration.capacityPlanner.industry.${id}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-online-users`}>
            {t("integration.capacityPlanner.onlineUsersLabel")}
          </Label>
          <input
            id={`${idPrefix}-online-users`}
            type="number"
            min={1}
            max={10000}
            className={SELECT_CLASS}
            value={input.onlineUsers}
            onChange={(e) => update("onlineUsers", Number(e.target.value))}
          />
          <div className="flex flex-wrap gap-2">
            {ONLINE_USER_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={input.onlineUsers === preset ? "default" : "outline"}
                onClick={() => update("onlineUsers", preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-traffic-shape`}>
            {t("integration.capacityPlanner.workloadLabel")}
          </Label>
          <select
            id={`${idPrefix}-traffic-shape`}
            className={SELECT_CLASS}
            value={input.trafficShape}
            onChange={(e) => update("trafficShape", e.target.value as TrafficShape)}
          >
            {TRAFFIC_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {t(`integration.capacityPlanner.trafficShape.${shape}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-latency`}>
            {t("integration.capacityPlanner.latencyLabel")}
          </Label>
          <select
            id={`${idPrefix}-latency`}
            className={SELECT_CLASS}
            value={input.latencyPreference}
            onChange={(e) =>
              update("latencyPreference", e.target.value as CapacityPlannerInput["latencyPreference"])
            }
          >
            <option value="fast">{t("integration.capacityPlanner.latency.fast")}</option>
            <option value="balanced">{t("integration.capacityPlanner.latency.balanced")}</option>
            <option value="quality">{t("integration.capacityPlanner.latency.quality")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-volume`}>
            {t("integration.capacityPlanner.volumeLabel")}
          </Label>
          <select
            id={`${idPrefix}-volume`}
            className={SELECT_CLASS}
            value={input.volumePreference}
            onChange={(e) =>
              update("volumePreference", e.target.value as CapacityPlannerInput["volumePreference"])
            }
          >
            <option value="small">{t("integration.capacityPlanner.volume.small")}</option>
            <option value="medium">{t("integration.capacityPlanner.volume.medium")}</option>
            <option value="large">{t("integration.capacityPlanner.volume.large")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={input.hasImages}
              onChange={(e) => update("hasImages", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t("integration.capacityPlanner.hasImagesLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={input.needsBatch}
              onChange={(e) => update("needsBatch", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t("integration.capacityPlanner.needsBatchLabel")}
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border-2 border-primary/20 bg-background/80 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calculator className="h-4 w-4 shrink-0 text-primary" />
            {t("integration.capacityPlanner.outputArchitectureTitle")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{t(plan.architectureKey)}</p>
          <p className="mt-2 text-sm font-medium text-foreground">{t(plan.recommendedPatternKey)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(plan.industryNoteKey)}</p>
        </div>

        <div className="rounded-lg border-2 border-primary/20 bg-background/80 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4 shrink-0 text-primary" />
            {t("integration.capacityPlanner.outputConcurrencyTitle")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>
              {formatMessage(t("integration.capacityPlanner.chatConcurrencyLine"), {
                range: plan.chatConcurrencyLabel,
              })}
            </li>
            <li>
              {formatMessage(t("integration.capacityPlanner.imageConcurrencyLine"), {
                range: plan.imageConcurrencyLabel,
              })}
            </li>
            <li>
              {formatMessage(t("integration.capacityPlanner.batchItemsLine"), {
                range: plan.batchItemsLabel,
              })}
            </li>
            <li>
              {formatMessage(t("integration.capacityPlanner.batchPollLine"), {
                seconds: plan.batchPollIntervalSeconds,
              })}
            </li>
          </ul>
        </div>

        <div className="rounded-lg border-2 border-primary/20 bg-background/80 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.capacityPlanner.outputModelTitle")}
          </p>
          <p className="mt-2 font-mono text-sm text-foreground">{plan.recommendedModel}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t(plan.batchWorkerKey)}</p>
        </div>

        <div className="rounded-lg border-2 border-primary/20 bg-background/80 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.capacityPlanner.outputRetryTitle")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatMessage(t(plan.retrySummaryKey), { count: plan.retryMaxAttempts })}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {plan.warningNoteKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-semibold text-foreground">
          {t("integration.capacityPlanner.reconcileTitle")}
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {plan.reconcilePathKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border-2 border-primary/20 bg-background/80 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Terminal className="h-4 w-4 shrink-0 text-primary" />
          {t("integration.capacityPlanner.copyTemplatesTitle")}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <CopyableSnippetField
            label={t("integration.capacityPlanner.copyConfigLabel")}
            value={configSnippet}
            copyId={`${idPrefix}-config`}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={t("integration.copyConfig")}
            copiedLabel={t("integration.copied")}
            className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
          />
          <div className="flex flex-wrap gap-2">
            <CopyableSnippetField
              label={t("integration.capacityPlanner.copyChatCurl")}
              value={chatCurlOneLine(apiKey)}
              copyId={`${idPrefix}-chat-curl`}
              copiedId={copiedId}
              onCopy={onCopy}
              copyLabel={t("integration.copyOneLineCurl")}
              copiedLabel={t("integration.copied")}
              className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
            />
            <CopyableSnippetField
              label={t("dashboard.apiKeys.copyNodeTrafficGovernor")}
              value={buildTrafficGovernorSnippet("node-traffic-governor", apiKey)}
              copyId={`${idPrefix}-node-governor`}
              copiedId={copiedId}
              onCopy={onCopy}
              copyLabel={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
              className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
            />
            <CopyableSnippetField
              label={t("dashboard.apiKeys.copyPythonTrafficGovernor")}
              value={buildTrafficGovernorSnippet("python-traffic-governor", apiKey)}
              copyId={`${idPrefix}-python-governor`}
              copiedId={copiedId}
              onCopy={onCopy}
              copyLabel={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
              className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
            />
            <CopyableSnippetField
              label={t("dashboard.apiKeys.copyNodeBatchWorker")}
              value={buildTrafficGovernorSnippet("node-batch-worker", apiKey)}
              copyId={`${idPrefix}-node-batch`}
              copiedId={copiedId}
              onCopy={onCopy}
              copyLabel={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
              className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
            />
            <CopyableSnippetField
              label={t("dashboard.apiKeys.copyPythonBatchWorker")}
              value={buildTrafficGovernorSnippet("python-batch-worker", apiKey)}
              copyId={`${idPrefix}-python-batch`}
              copiedId={copiedId}
              onCopy={onCopy}
              copyLabel={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
              className="min-w-[200px] [&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#retry-and-backoff">
                {t("integration.navRetryBackoff")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#usage-credits">
                {t("integration.linkUsageCreditsGuide")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
