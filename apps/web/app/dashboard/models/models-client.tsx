"use client";

import Link from "next/link";
import {
  CreditCard,
  ImageIcon,
  KeyRound,
  MessageSquare,
  Terminal,
  BookOpen,
  Info,
  Route,
  Activity,
} from "lucide-react";

import { ApiServiceReadinessBanner } from "@/components/api-service-readiness-banner";
import {
  DashboardCodeBlock,
  DashboardCopyButton,
  DashboardCopyConfigAction,
  useDashboardCopyToClipboard,
} from "@/lib/dashboard-safe/copy-block";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";
import { ResponsiveTableScroll } from "@/components/responsive-table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chatCurlOneLineSafe } from "@/lib/dashboard-safe/curl-one-line";
import { useDashboardApiKey } from "@/lib/dashboard-safe/use-dashboard-api-key";
import type { ModelsClientData, ModelsTableRow } from "@/lib/dashboard-safe/dtos/models";
import {
  TOKFAI_RECOMMENDED_MODEL,
  TOKFAI_SMART_MODEL_ALIASES,
} from "@/lib/dashboard-safe/constants";

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${TOKFAI_RECOMMENDED_MODEL}",
    "messages": [
      {"role": "user", "content": "Hello Tokfai"}
    ]
  }'`;

const USAGE_TIP_IDS = [
  "dailyChat",
  "complexTasks",
  "imageGeneration",
  "costSensitive",
] as const;

const USAGE_TIP_ICONS = {
  dailyChat: MessageSquare,
  complexTasks: Terminal,
  imageGeneration: ImageIcon,
  costSensitive: CreditCard,
} as const;

const HOW_TO_ESTIMATE_KEYS = [
  "howToEstimateItem1",
  "howToEstimateItem2",
  "howToEstimateItem3",
  "howToEstimateItem4",
] as const;

export function ModelsClient({
  modelsData,
}: {
  modelsData: ModelsClientData;
}) {
  const { t, formatMessage, locale } = useDashboardLabels();
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const apiKey = useDashboardApiKey();

  const { stats, rows, packageRows, defaultImage, hasCatalogPricing } = modelsData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.models.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.models.subtitle")}
        </p>
      </div>

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 shrink-0" />
            {t("dashboard.models.priceDisclaimerTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{t("dashboard.models.priceDisclaimer")}</p>
          <p>{t("dashboard.models.priceDisclaimerBudget")}</p>
          <p className="font-medium text-foreground/90">
            {t("dashboard.models.salesTip")}
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 shrink-0" />
            {t("dashboard.models.smartRoutingTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.models.smartRoutingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {TOKFAI_SMART_MODEL_ALIASES.map((aliasId) => (
            <div key={aliasId} className="rounded-md border bg-background/80 px-3 py-2.5">
              <p className="font-mono text-xs font-medium text-foreground">{aliasId}</p>
              <p className="mt-1 text-muted-foreground">
                {t(`dashboard.models.smartRoutingAlias.${aliasId}`)}
              </p>
            </div>
          ))}
          <p className="text-muted-foreground">{t("dashboard.models.smartRoutingRealModelNote")}</p>
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.startFromModelTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.models.recommendedStartingModel")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("dashboard.models.startFromModelAutoFast")}</li>
            <li>{t("dashboard.models.startFromModelAutoPro")}</li>
            <li>{t("dashboard.models.startFromModelAutoCheap")}</li>
            <li>{t("dashboard.models.highTrafficBatchGovernor")}</li>
            <li>{t("dashboard.models.verificationUnavailableNote")}</li>
            <li>{t("dashboard.models.starterTemplateHint")}</li>
            <li>
              <Link
                href="/dashboard/payload-builder"
                className="underline"
              >
                {t("dashboard.models.buildPayloadAutoFast")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/payload-builder"
                className="underline"
              >
                {t("dashboard.models.buildPayloadAutoPro")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/payload-builder"
                className="underline"
              >
                {t("dashboard.models.buildPayloadAutoCheap")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/payload-builder"
                className="underline"
              >
                {t("dashboard.models.buildPayloadImage")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/starter-templates"
                className="underline"
              >
                {t("dashboard.models.buildTemplateAutoFast")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/starter-templates"
                className="underline"
              >
                {t("dashboard.models.buildTemplateAutoPro")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/starter-templates"
                className="underline"
              >
                {t("dashboard.models.buildTemplateAutoCheap")}
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/starter-templates"
                className="underline"
              >
                {t("dashboard.models.buildTemplateImage")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard/starter-templates#one-line-chat-curl" className="underline">
                {t("dashboard.models.starterTemplateAutoFast")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard/starter-templates#hospital-chart-summary" className="underline">
                {t("dashboard.models.starterTemplateAutoPro")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard/starter-templates#ecommerce-sku-batch" className="underline">
                {t("dashboard.models.starterTemplateAutoCheap")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard/starter-templates#one-line-image-curl" className="underline">
                {t("dashboard.models.starterTemplateImage")}
              </Link>
            </li>
          </ul>
          <ApiServiceReadinessBanner compact />
          <div className="flex flex-wrap gap-2">
            <DashboardCopyConfigAction
              id="models-curl-auto-fast"
              value={chatCurlOneLineSafe(apiKey, "auto-fast")}
              copiedId={copiedId}
              onCopy={copyText}
              label={t("dashboard.models.copyCurlWithModel")}
              copiedLabel={t("quickstart.copied")}
              primary
            />
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/integration-workbench">
                <Terminal className="mr-1.5 h-4 w-4" />
                {t("dashboard.models.openIntegrationWorkbench")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/payload-builder">
                {t("dashboard.models.buildPayloadWithModel")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/starter-templates">
                {t("dashboard.models.buildTemplateWithModel")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/starter-templates">
                {t("integration.starterTemplates.openLibrary")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/troubleshooting">
                {t("integration.troubleshooting.openTroubleshooting")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#usage-credits">
                {t("dashboard.models.openUsageCreditsGuide")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("dashboard.models.productionGuidanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("dashboard.models.productionGuidanceAutoFast")}</li>
            <li>{t("dashboard.models.productionGuidanceAutoPro")}</li>
            <li>{t("dashboard.models.productionGuidanceAutoCheap")}</li>
            <li>{t("dashboard.models.productionGuidanceExplicit")}</li>
            <li>{t("dashboard.models.productionGuidanceBatchNote")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.scaleSafelyTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("dashboard.models.highTrafficOnline500Note")}</li>
            <li>{t("dashboard.models.highTrafficCapacityPlanner")}</li>
            <li>{t("dashboard.models.highTrafficUseBatch")}</li>
            <li>{t("dashboard.models.highTrafficReconcile")}</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#capacity-planner">
                {t("dashboard.models.capacityPlannerLink")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#traffic-governor">
                {t("integration.trafficGovernor.scaleSafelyTitle")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.goLiveReadinessTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("dashboard.models.goLiveChooseModelPlan")}</li>
            <li>{t("dashboard.models.goLiveAutoFastFirst")}</li>
            <li>{t("dashboard.models.goLiveAutoProQuality")}</li>
            <li>{t("dashboard.models.goLiveAutoCheapEcommerce")}</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#go-live-tracker">
                {t("dashboard.models.goLiveOpenTracker")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#capacity-planner">
                {t("dashboard.models.capacityPlannerLink")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.highTrafficIntegrationTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t("dashboard.models.highTrafficChatConcurrency")}</li>
            <li>{t("dashboard.models.highTrafficImageConcurrency")}</li>
            <li>{t("dashboard.models.highTrafficBatchItems")}</li>
            <li>{t("dashboard.models.highTrafficReconcile")}</li>
            <li>{t("dashboard.models.highTrafficNoInfiniteRetry")}</li>
            <li>{t("dashboard.models.highTrafficUseBatch")}</li>
            <li>{t("dashboard.models.highTrafficOnline500Note")}</li>
            <li>{t("dashboard.models.highTrafficClientQueue")}</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#large-volume-batch-queue">
                {t("dashboard.models.footerHighTrafficBatch")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#500-online-readiness">
                {t("integration.nav500OnlineReadiness")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#retry-and-backoff">
                {t("integration.navRetryBackoff")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#traffic-governor">
                {t("integration.navTrafficGovernor")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/docs#capacity-planner">
                {t("integration.navCapacityPlanner")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStat
          label={t("dashboard.models.overviewTotal")}
          value={String(stats.totalAvailable)}
        />
        <OverviewStat
          label={t("dashboard.models.overviewChat")}
          value={String(stats.chatCount)}
        />
        <OverviewStat
          label={t("dashboard.models.overviewImage")}
          value={String(stats.imageCount)}
        />
        <OverviewStat
          label={t("dashboard.models.overviewDefault")}
          value={stats.defaultModelId}
          mono
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.models.howToEstimateTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {HOW_TO_ESTIMATE_KEYS.map((key) => (
              <li key={key}>{t(`dashboard.models.${key}`)}</li>
            ))}
          </ul>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">
              <CreditCard className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.viewCreditsLedger")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.models.tableTitle")}</CardTitle>
          <CardDescription>
            {t("dashboard.models.tableDesc")}
            {hasCatalogPricing
              ? null
              : ` ${t("dashboard.models.listDisclaimer")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTableScroll>
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colModelId")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colType")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colStatus")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.recommendedUseCase")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.inputPrice")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.outputPrice")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colShortEstimate")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colLongEstimate")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colApproxRmb")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ModelTableRow
                    key={row.id}
                    row={row}
                    copiedId={copiedId}
                    onCopy={copyText}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.models.packageEstimateTitle")}</CardTitle>
          <CardDescription>
            {formatMessage(t("dashboard.models.packageEstimateDesc"), {
              model: stats.defaultModelId,
              imageModel: defaultImage,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ResponsiveTableScroll>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colPackagePlan")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colPackageCredits")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colPackageUsageFit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {packageRows.map((plan) => (
                  <tr key={plan.planId} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {plan.planLabel}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {plan.amountLabel}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {plan.credits.toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {plan.usageFitLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableScroll>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.models.packageEstimateRoughNote")}
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("dashboard.models.usageTipsTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {USAGE_TIP_IDS.map((id) => {
            const Icon = USAGE_TIP_ICONS[id];
            return (
              <Card key={id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md border bg-muted/50 p-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base leading-snug">
                      {t(`dashboard.models.usageTip.${id}.title`)}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {t(`dashboard.models.usageTip.${id}.body`)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.models.exampleTitle")}</CardTitle>
          <CardDescription>{t("dashboard.models.exampleDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardCodeBlock
            id="models-curl-chat"
            label="curl"
            value={CHAT_COMPLETIONS_CURL}
            copied={copiedId === "models-curl-chat"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.footerActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/integration-workbench">
              <Terminal className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerStartIntegration")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/api-keys">
              <KeyRound className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerApiKeys")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#quick-start">
              <Terminal className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerQuickStart")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#industry-examples">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerIndustryTemplates")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#batch-api">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerHighTrafficBatch")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#capacity-and-rate-limits">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerCapacityGuide")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#production-use">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerProductionUse")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs#rate-limits-large-volume">
              <Terminal className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerRateLimits")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">
              <Activity className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerUsage")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/docs">
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerDocs")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">
              <CreditCard className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerCredits")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/playground">
              <Terminal className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerPlayground")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("dashboard.models.highTrafficBatchNote")}
      </p>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          mono
            ? "mt-1 font-mono text-sm font-medium text-foreground"
            : "mt-1 text-2xl font-semibold tracking-tight text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function ModelTableRow({
  row,
  copiedId,
  onCopy,
  t,
}: {
  row: ModelsTableRow;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  t: (key: string) => string;
}) {
  const copyId = `model-id-${row.id}`;

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1">
          <code className="font-mono text-xs">{row.id}</code>
          <DashboardCopyButton
            copied={copiedId === copyId}
            onCopy={() => onCopy(copyId, row.id)}
            copyLabel={t("dashboard.models.copyModelId")}
            copiedLabel={t("dashboard.models.copied")}
            size="icon"
          />
        </div>
      </td>
      <td className="py-2 pr-4">
        <TypeBadge type={row.type} t={t} />
      </td>
      <td className="py-2 pr-4">
        <StatusBadge status={row.status} t={t} />
      </td>
      <td className="max-w-[12rem] py-2 pr-4 text-muted-foreground">
        <MultilineCell text={row.useCase} />
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
        {row.inputPrice}
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
        {row.outputPrice}
      </td>
      <td className="max-w-[14rem] py-2 pr-4 text-xs text-muted-foreground">
        {row.shortEstimate}
      </td>
      <td className="max-w-[14rem] py-2 pr-4 text-xs text-muted-foreground">
        <MultilineCell text={row.longEstimate} />
      </td>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{row.approxRmb}</td>
    </tr>
  );
}

function MultilineCell({ text }: { text: string }) {
  const lines = text.split("\n");
  if (lines.length === 1) return <>{text}</>;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function TypeBadge({
  type,
  t,
}: {
  type: ModelsTableRow["type"];
  t: (key: string) => string;
}) {
  const labelKey =
    type === "chat"
      ? "dashboard.models.typeChat"
      : type === "image"
        ? "dashboard.models.typeImage"
        : type === "video"
          ? "dashboard.models.typeMultimodal"
          : "dashboard.models.typeUnknown";

  return <Badge variant="outline">{t(labelKey)}</Badge>;
}

function StatusBadge({
  status,
  t,
}: {
  status: ModelsTableRow["status"];
  t: (key: string) => string;
}) {
  if (status === "available") {
    return <Badge variant="success">{t("dashboard.models.statusAvailable")}</Badge>;
  }
  if (status === "coming_soon") {
    return <Badge variant="secondary">{t("dashboard.models.statusComingSoon")}</Badge>;
  }
  return <Badge variant="warning">{t("dashboard.models.statusPaused")}</Badge>;
}
