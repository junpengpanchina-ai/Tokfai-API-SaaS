"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Terminal,
} from "lucide-react";

import { CapacityPlannerPanel } from "@/components/capacity-planner-panel";
import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  buildIntegrationPlanJson,
  buildIntegrationPlanMarkdown,
  buildIntegrationPlanPlainText,
} from "@/lib/customer-integration-plan-copy";
import { buildCustomerIntegrationPlan } from "@/lib/customer-integration-plan";
import {
  buildGoLiveTrackerCopies,
} from "@/lib/customer-go-live-copy";
import {
  COMMAND_CENTER_STEP_IDS,
  COMMAND_CENTER_STORAGE_KEY,
  DEFAULT_COMMAND_CENTER_STATE,
  INTEGRATION_COMMAND_CENTER_STEPS,
  buildPlannerInputFromCommandCenter,
  commandCenterSummary,
  nextIncompleteStep,
  nextStepId,
  stepAnchorId,
  type CommandCenterPersistedState,
  type CommandCenterStepId,
} from "@/lib/customer-integration-command-center";
import {
  PLANNER_INDUSTRIES,
  TRAFFIC_SHAPES,
  planCapacity,
  type PlannerIndustry,
  type RecommendedModelId,
  type TrafficShape,
} from "@/lib/customer-capacity-planner";
import { buildSafeClientSnippet } from "@/lib/customer-safe-client-snippets";
import { chatCurlOneLine, chatCurlPowerShellOneLine } from "@/lib/customer-curl-oneline";
import { buildTrafficGovernorSnippet } from "@/lib/customer-traffic-governor-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type IntegrationCommandCenterProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showEmbeddedPlanner?: boolean;
};

function loadState(): CommandCenterPersistedState {
  if (typeof window === "undefined") return DEFAULT_COMMAND_CENTER_STATE;
  try {
    const raw = window.localStorage.getItem(COMMAND_CENTER_STORAGE_KEY);
    if (!raw) return DEFAULT_COMMAND_CENTER_STATE;
    const parsed = JSON.parse(raw) as CommandCenterPersistedState;
    return {
      ...DEFAULT_COMMAND_CENTER_STATE,
      ...parsed,
      completedStepIds: parsed.completedStepIds ?? [],
    };
  } catch {
    return DEFAULT_COMMAND_CENTER_STATE;
  }
}

function saveState(state: CommandCenterPersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMMAND_CENTER_STORAGE_KEY, JSON.stringify(state));
}

export function IntegrationCommandCenter({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "command-center",
  showEmbeddedPlanner = true,
}: IntegrationCommandCenterProps) {
  const { t } = useI18n();
  const [state, setState] = useState<CommandCenterPersistedState>(DEFAULT_COMMAND_CENTER_STATE);

  useEffect(() => {
    setState(loadState());
  }, []);

  const persist = useCallback((patch: Partial<CommandCenterPersistedState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  const plannerInput = useMemo(
    () => buildPlannerInputFromCommandCenter(state),
    [state]
  );
  const summary = useMemo(() => commandCenterSummary(plannerInput), [plannerInput]);
  const integrationPlan = useMemo(
    () => buildCustomerIntegrationPlan(plannerInput),
    [plannerInput]
  );
  const trackerCopies = useMemo(
    () => buildGoLiveTrackerCopies(plannerInput, {}),
    [plannerInput]
  );

  const activeStep =
    INTEGRATION_COMMAND_CENTER_STEPS.find((s) => s.id === state.activeStepId) ??
    INTEGRATION_COMMAND_CENTER_STEPS[0];
  const nextOpenStep = nextIncompleteStep(state.completedStepIds);
  const curlOneLine = chatCurlOneLine(apiKey, state.recommendedModel);

  const markComplete = (stepId: CommandCenterStepId) => {
    persist({
      completedStepIds: state.completedStepIds.includes(stepId)
        ? state.completedStepIds
        : [...state.completedStepIds, stepId],
    });
  };

  const goToStep = (stepId: CommandCenterStepId) => {
    persist({ activeStepId: stepId });
    const el = document.getElementById(stepAnchorId(stepId));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToPlanner = () => {
    document.getElementById("capacity-planner")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToTracker = () => {
    document.getElementById("go-live-tracker")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div id="integration-workbench" className="min-w-0 flex flex-col gap-6">
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{t("integration.commandCenter.gatewayHint")}</p>
        <div className="mt-3 flex min-w-0 flex-col gap-3">
          <OneLineCurlCopyFields
            apiKey={apiKey}
            bashLabel={t("integration.commandCenter.ctaCopyCurl")}
            bashCurl={curlOneLine}
            powershellCurl={chatCurlPowerShellOneLine(apiKey, state.recommendedModel)}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={`${idPrefix}-header-curl`}
            liveKeyNoteKey="integration.workbench.sessionKeyNote"
            pasteNoteKey="integration.oneLineCurlPasteAnywhere"
            primaryCopy={true}
            compact={true}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/dashboard/api-keys#create-api-key">
              <KeyRound className="mr-1.5 h-4 w-4" />
              {t("integration.ctaCreateKey")}
            </Link>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => goToStep("plan-capacity")}>
            {t("integration.commandCenter.ctaPlanCapacity")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => goToStep("go-live-tracker")}>
            {t("integration.commandCenter.ctaGoLiveTracker")}
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-2">
          <nav
            aria-label={t("integration.commandCenter.progressLabel")}
            className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1"
          >
            {INTEGRATION_COMMAND_CENTER_STEPS.map((step, index) => {
              const done = state.completedStepIds.includes(step.id);
              const active = state.activeStepId === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : done
                        ? "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="font-mono text-[10px]">{index + 1}</span>
                  )}
                  <span className="max-w-[8rem] truncate sm:max-w-none">
                    {t(step.titleKey)}
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            id={stepAnchorId(activeStep.id)}
            className="min-w-0 rounded-lg border bg-card p-4 shadow-sm ring-2 ring-primary/25"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatMessage(t("integration.commandCenter.stepLabel"), {
                    current: COMMAND_CENTER_STEP_IDS.indexOf(activeStep.id) + 1,
                    total: COMMAND_CENTER_STEP_IDS.length,
                  })}
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {t(activeStep.titleKey)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{t(activeStep.goalKey)}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => markComplete(activeStep.id)}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t("integration.commandCenter.markDone")}
              </Button>
            </div>

            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("integration.commandCenter.expectedOutput")}
            </p>
            <p className="mt-1 text-sm text-foreground">{t(activeStep.expectedOutputKey)}</p>

            {!activeStep.reconcileHintKey ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(activeStep.nextActionKey)}
              </p>
            ) : null}

            {activeStep.reconcileHintKey ? (
              <details className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                  {t("integration.commandCenter.moreDetails")}
                </summary>
                <p className="mt-2">{t(activeStep.reconcileHintKey)}</p>
                <p className="mt-2">{t(activeStep.nextActionKey)}</p>
              </details>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {activeStep.id === "create-api-key" ? (
                  <>
                    <Button asChild size="sm">
                      <Link href="/dashboard/api-keys#create-api-key">
                        <KeyRound className="mr-1.5 h-4 w-4" />
                        {t("integration.ctaCreateKey")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#api-key">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "verify-curl" ? (
                  <>
                    <OneLineCurlCopyFields
                      apiKey={apiKey}
                      bashLabel={t("integration.copyOneLineCurl")}
                      bashCurl={curlOneLine}
                      powershellCurl={chatCurlPowerShellOneLine(apiKey, state.recommendedModel)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      idPrefix={`${idPrefix}-step-curl`}
                      liveKeyNoteKey="integration.workbench.sessionKeyNote"
                      pasteNoteKey="integration.oneLineCurlPasteAnywhere"
                      primaryCopy={true}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#chat-api">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "choose-workload" ? (
                  <div className="grid w-full gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label>{t("integration.capacityPlanner.industryLabel")}</Label>
                      <select
                        className={SELECT_CLASS}
                        value={state.industry}
                        onChange={(e) =>
                          persist({ industry: e.target.value as PlannerIndustry })
                        }
                      >
                        {PLANNER_INDUSTRIES.map((id) => (
                          <option key={id} value={id}>
                            {t(`integration.capacityPlanner.industry.${id}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>{t("integration.capacityPlanner.trafficShapeLabel")}</Label>
                      <select
                        className={SELECT_CLASS}
                        value={state.trafficShape}
                        onChange={(e) =>
                          persist({ trafficShape: e.target.value as TrafficShape })
                        }
                      >
                        {TRAFFIC_SHAPES.map((shape) => (
                          <option key={shape} value={shape}>
                            {t(`integration.capacityPlanner.trafficShape.${shape}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2 sm:col-span-2">
                      <Label>{t("integration.commandCenter.modelPlanLabel")}</Label>
                      <select
                        className={SELECT_CLASS}
                        value={state.recommendedModel}
                        onChange={(e) =>
                          persist({
                            recommendedModel: e.target.value as RecommendedModelId,
                          })
                        }
                      >
                        <option value="auto-fast">
                          {t("integration.commandCenter.modelAutoFast")}
                        </option>
                        <option value="auto-pro">
                          {t("integration.commandCenter.modelAutoPro")}
                        </option>
                        <option value="auto-cheap">
                          {t("integration.commandCenter.modelAutoCheap")}
                        </option>
                      </select>
                    </div>
                  </div>
                ) : null}

                {activeStep.id === "plan-capacity" ? (
                  <>
                    <Button type="button" size="sm" onClick={scrollToPlanner}>
                      {t("integration.commandCenter.openCapacityPlanner")}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#capacity-planner">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "generate-plan" ? (
                  <>
                    <CopyConfigAction
                      id={`${idPrefix}-plan-plain`}
                      value={buildIntegrationPlanPlainText(integrationPlan, plannerInput)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.handoff.copyPlain")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-plan-markdown`}
                      value={buildIntegrationPlanMarkdown(integrationPlan, plannerInput)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.handoff.copyMarkdown")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-plan-json`}
                      value={buildIntegrationPlanJson(integrationPlan, plannerInput)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.handoff.copyJson")}
                      copiedLabel={t("integration.copied")}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#integration-plan">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "copy-templates" ? (
                  <>
                    <CopyConfigAction
                      id={`${idPrefix}-node-traffic`}
                      value={buildTrafficGovernorSnippet("node-traffic-governor", apiKey)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.commandCenter.copyNodeTraffic")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-python-traffic`}
                      value={buildTrafficGovernorSnippet("python-traffic-governor", apiKey)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.commandCenter.copyPythonTraffic")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-node-batch`}
                      value={buildTrafficGovernorSnippet("node-batch-worker", apiKey)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.commandCenter.copyNodeBatch")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-python-batch`}
                      value={buildTrafficGovernorSnippet("python-batch-worker", apiKey)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.commandCenter.copyPythonBatch")}
                      copiedLabel={t("integration.copied")}
                    />
                    <CopyConfigAction
                      id={`${idPrefix}-node-retry`}
                      value={buildSafeClientSnippet("node-safe-retry", apiKey)}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.commandCenter.copyRetryTemplate")}
                      copiedLabel={t("integration.copied")}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#traffic-governor">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "go-live-tracker" ? (
                  <>
                    <Button type="button" size="sm" onClick={scrollToTracker}>
                      {t("integration.commandCenter.ctaGoLiveTracker")}
                    </Button>
                    <CopyConfigAction
                      id={`${idPrefix}-evidence-pack`}
                      value={trackerCopies.evidencePack}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.goLiveTracker.copyEvidencePack")}
                      copiedLabel={t("integration.copied")}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#go-live-tracker">
                        {t("integration.commandCenter.openDocs")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {activeStep.id === "reconcile-usage-credits" ? (
                  <>
                    <Button asChild size="sm">
                      <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
                    </Button>
                    <CopyConfigAction
                      id={`${idPrefix}-final-report`}
                      value={trackerCopies.finalReport}
                      copiedId={copiedId}
                      onCopy={onCopy}
                      label={t("integration.goLiveTracker.copyFinalReport")}
                      copiedLabel={t("integration.copied")}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/docs#usage-credits">
                        {t("integration.linkUsageCreditsGuide")}
                      </Link>
                    </Button>
                  </>
                ) : null}

                {nextStepId(activeStep.id) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => goToStep(nextStepId(activeStep.id)!)}
                  >
                    <ChevronRight className="mr-1 h-4 w-4" />
                    {t("integration.commandCenter.nextStep")}
                  </Button>
                ) : null}
            </div>
          </div>
        </div>

        <aside className="order-1 flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/30 p-4 lg:order-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t("integration.commandCenter.summaryTitle")}
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("integration.commandCenter.summaryModel")}
              </dt>
              <dd className="font-mono text-foreground">{summary.recommendedModel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("integration.commandCenter.summaryChatConcurrency")}
              </dt>
              <dd>{summary.chatConcurrency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("integration.commandCenter.summaryImageConcurrency")}
              </dt>
              <dd>{summary.imageConcurrency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("integration.commandCenter.summaryBatch")}
              </dt>
              <dd>
                {summary.batchItems} items/job
                {summary.batchFirst ? ` — ${t("integration.handoff.batchRecommended")}` : ""}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {formatMessage(t("integration.commandCenter.summaryProgress"), {
              done: state.completedStepIds.length,
              total: COMMAND_CENTER_STEP_IDS.length,
            })}
          </p>
          {nextOpenStep ? (
            <div className="rounded-md border bg-background/80 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("integration.commandCenter.summaryNextAction")}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {t(nextOpenStep.titleKey)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="mt-1 h-auto p-0"
                onClick={() => goToStep(nextOpenStep.id)}
              >
                {t("integration.commandCenter.continueStep")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {t("integration.commandCenter.allStepsDone")}
            </p>
          )}
          <p className="rounded-md border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
            {t("integration.commandCenter.reconcileHint")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/dashboard/usage">
                <Terminal className="mr-1.5 h-4 w-4" />
                {t("integration.linkUsage")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
            </Button>
          </div>
        </aside>
      </div>

      {showEmbeddedPlanner ? (
        <div className="min-w-0 rounded-lg border-2 border-primary/15 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.commandCenter.embeddedPlannerTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.commandCenter.embeddedPlannerNote")}
          </p>
          <div className="mt-4">
            <CapacityPlannerPanel
              apiKey={apiKey}
              copiedId={copiedId}
              onCopy={onCopy}
              idPrefix={`${idPrefix}-planner`}
              showTitle={false}
              plannerInput={plannerInput}
              onPlannerInputChange={(next) => {
                persist({
                  industry: next.industry,
                  trafficShape: next.trafficShape,
                  onlineUsers: next.onlineUsers,
                  recommendedModel: planCapacity(next).recommendedModel,
                });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
