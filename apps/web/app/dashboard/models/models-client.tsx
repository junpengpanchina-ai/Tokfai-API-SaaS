"use client";

import Link from "next/link";
import {
  CreditCard,
  ImageIcon,
  KeyRound,
  MessageSquare,
  Terminal,
  BookOpen,
} from "lucide-react";

import { CodeBlock, CopyButton, useCopyToClipboard } from "@/components/copy-code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { DASHBOARD_CATALOG_MODELS } from "@/lib/model-catalog";
import {
  buildModelsTableRows,
  summarizeModelsCatalog,
  type ModelsTableRow,
} from "@/lib/models-page";

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.1-pro",
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

export function ModelsClient({
  catalogPricing,
}: {
  catalogPricing: CatalogModelPricingItem[];
}) {
  const { t, locale } = useI18n();
  const { copiedId, copyText } = useCopyToClipboard();

  const stats = summarizeModelsCatalog(DASHBOARD_CATALOG_MODELS);
  const rows = buildModelsTableRows(
    DASHBOARD_CATALOG_MODELS,
    catalogPricing,
    t,
    locale
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("dashboard.models.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.models.subtitle")}
        </p>
      </div>

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
          <CardTitle>{t("dashboard.models.tableTitle")}</CardTitle>
          <CardDescription>
            {t("dashboard.models.tableDesc")}
            {catalogPricing.length === 0
              ? ` ${t("dashboard.models.listDisclaimer")}`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                    {t("dashboard.models.colUnit")}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t("dashboard.models.colNote")}
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
          </div>
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
          <CodeBlock
            id="models-curl-chat"
            label="curl"
            code={CHAT_COMPLETIONS_CURL}
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
            <Link href="/dashboard/api-keys">
              <KeyRound className="mr-1.5 h-4 w-4" />
              {t("dashboard.models.footerApiKeys")}
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
          <CopyButton
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
      <td className="max-w-[14rem] py-2 pr-4 text-muted-foreground">
        {row.useCase}
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
        {row.inputPrice}
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
        {row.outputPrice}
      </td>
      <td className="py-2 pr-4 text-muted-foreground">{row.unit}</td>
      <td className="max-w-[12rem] py-2 pr-4 text-xs text-muted-foreground">
        {row.note}
      </td>
    </tr>
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
