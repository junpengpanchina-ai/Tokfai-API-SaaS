"use client";

import Link from "next/link";
import { BookOpen, Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DashboardCopyConfigAction,
  useDashboardCopyToClipboard,
} from "@/lib/dashboard-safe/copy-block";
import {
  CONSUMER_MODEL_GROUPS,
  type ConsumerModelCapabilityTag,
  type ConsumerModelCard,
} from "@/lib/docs/consumer-model-groups";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";
import type { ModelsClientData } from "@/lib/dashboard-safe/dtos/models";

const TAG_LABEL_KEYS: Record<ConsumerModelCapabilityTag, string> = {
  recommended: "dashboard.models.tagRecommended",
  fast: "dashboard.models.tagFast",
  best_quality: "dashboard.models.tagBestQuality",
  low_cost: "dashboard.models.tagLowCost",
  image: "dashboard.models.tagImage",
  vision: "dashboard.models.tagVision",
  alias: "dashboard.models.tagAlias",
};

function docAnchorForModel(model: ConsumerModelCard): string {
  if (model.kind === "image") return "/docs#image-api";
  if (model.id === "gpt-5.5" || model.id.startsWith("gpt-5.5")) {
    return "/docs#responses-api";
  }
  return "/docs#chat-completions";
}

function supportLabel(
  supported: boolean,
  t: (key: string) => string
): string {
  return supported
    ? t("dashboard.models.supported")
    : t("dashboard.models.notSupported");
}

export function ModelsClient({
  modelsData,
}: {
  modelsData: ModelsClientData;
}) {
  const { t, locale } = useDashboardLabels();
  const zh = locale === "zh";

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.models.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("dashboard.models.capabilitiesSubtitle")}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {t("dashboard.models.apiKeyNotBoundHint")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">
              <Tags className="mr-1.5 h-3.5 w-3.5" />
              {t("dashboard.models.viewPricing")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/docs">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {t("dashboard.models.viewDocs")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("dashboard.models.statAvailable")}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.totalAvailable}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("dashboard.models.statChat")}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.chatCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("dashboard.models.statImage")}</CardDescription>
            <CardTitle className="text-2xl">
              {modelsData.stats.imageCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {CONSUMER_MODEL_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {zh ? group.title.zh : group.title.en}
            </h2>
            <p className="text-sm text-muted-foreground">
              {zh ? group.description.zh : group.description.en}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {group.models.map((model) => (
              <ModelCapabilityCard
                key={`${group.id}-${model.id}`}
                model={model}
                zh={zh}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModelCapabilityCard({
  model,
  zh,
}: {
  model: ConsumerModelCard;
  zh: boolean;
}) {
  const { t } = useDashboardLabels();
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const copyId = `model-id-${model.id}`;

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {zh ? model.displayName.zh : model.displayName.en}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                {model.id}
              </p>
              <DashboardCopyConfigAction
                id={copyId}
                value={model.id}
                copiedId={copiedId}
                onCopy={copyText}
                label={t("dashboard.models.copyModelId")}
                copiedLabel={t("dashboard.models.copied")}
              />
            </div>
          </div>
          <Badge variant="outline">{model.kind}</Badge>
        </div>
        <CardDescription>
          {zh ? model.oneLiner.zh : model.oneLiner.en}
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {model.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {t(TAG_LABEL_KEYS[tag])}
            </Badge>
          ))}
          {model.beginnerFriendly ? (
            <Badge variant="secondary">
              {t("dashboard.models.beginnerRecommended")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ul className="space-y-1">
          <li>
            {t("dashboard.models.recommendedEndpoint")}:{" "}
            <code className="text-foreground">{model.recommendedEndpoint}</code>
          </li>
          <li>
            {t("dashboard.models.bestFor")}:{" "}
            <span className="text-foreground">
              {zh ? model.bestFor.zh : model.bestFor.en}
            </span>
          </li>
          <li>
            Chat Completions:{" "}
            <span className="text-foreground">
              {supportLabel(model.supportsChatCompletions, t)}
            </span>
          </li>
          <li>
            Responses:{" "}
            <span className="text-foreground">
              {supportLabel(model.supportsResponses, t)}
            </span>
          </li>
          <li>
            Stream:{" "}
            <span className="text-foreground">
              {supportLabel(model.supportsStream, t)}
            </span>
          </li>
          <li>
            {t("dashboard.models.imageInput")}:{" "}
            <span className="text-foreground">
              {supportLabel(model.supportsImageInput, t)}
            </span>
          </li>
          <li>
            {t("dashboard.models.ownedBy")}:{" "}
            <code className="text-foreground">tokfai</code>
          </li>
          {model.routesTo ? (
            <li>
              {t("dashboard.models.routesTo")}:{" "}
              <code className="text-foreground">{model.routesTo}</code>
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing">{t("dashboard.models.viewPricing")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={docAnchorForModel(model)}>
              {t("dashboard.models.viewIntegrationExample")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
