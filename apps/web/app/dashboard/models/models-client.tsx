"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, ImageIcon, Info, MessageSquare, Sparkles, Terminal, Video, Zap, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { CatalogModelPricingItem } from "@/lib/dmit/client";
import {
  DASHBOARD_USE_CASES,
  filterDashboardModelsByCategory,
  groupImageModelsByDisplayGroup,
  MODEL_CATEGORY_TABS,
  type ModelCatalogEntry,
  type ModelCategory,
  type ModelType,
  type DashboardUseCaseEntry,
  type DashboardUseCaseId,
  isCatalogModelPlaygroundAvailable,
  isChatModelEntry,
  isImageModelEntry,
} from "@/lib/model-catalog";
import {
  formatChatInputYuanExample,
  formatChatInputYuanExampleFromRange,
  formatChatOutputYuanExample,
  formatChatOutputYuanExampleFromRange,
  formatDbChatInputCreditsPerMillion,
  formatDbChatOutputCreditsPerMillion,
  formatDbImageCreditsPerGeneration,
  formatImageYuanExample,
  catalogPricingByModelId,
  formatModelTraitLabels,
  getChatModelUseCase,
  getImageModelUseCase,
  resolveDbChatCredits,
  resolveDbImageCredits,
} from "@/lib/model-pricing-display";
import { TOKFAI_MODELS_ENDPOINT, TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";

export function ModelsClient({
  catalogPricing,
}: {
  catalogPricing: CatalogModelPricingItem[];
}) {
  const { t, locale } = useI18n();
  const pricingByModelId = catalogPricingByModelId(catalogPricing);
  const [activeCategory, setActiveCategory] = useState<ModelCategory>("recommended");

  const filteredModels = filterDashboardModelsByCategory(activeCategory);
  const categoryDescription = t(`dashboard.models.categoryDesc.${activeCategory}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("dashboard.models.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.models.subtitle")}
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_MODELS_ENDPOINT}</Badge>
      </div>

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("dashboard.models.billingNoticeTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t("dashboard.models.billingNoticeItem1")}</li>
            <li>{t("dashboard.models.billingNoticeItem2")}</li>
            <li>{t("dashboard.models.billingNoticeItem3")}</li>
            <li>{t("dashboard.models.billingNoticeItem4")}</li>
            <li>{t("dashboard.models.billingNoticeItem5")}</li>
            <li>{t("dashboard.models.billingNoticeItem6")}</li>
          </ul>
        </CardContent>
      </Card>

      <UseCaseSection t={t} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={t("dashboard.models.categoryTabsLabel")}
          >
            {MODEL_CATEGORY_TABS.map((category) => {
              const isActive = activeCategory === category;
              return (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(category)}
                >
                  {t(`dashboard.models.category.${category}`)}
                </Button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">{categoryDescription}</p>
        </div>

        {filteredModels.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("dashboard.models.categoryEmpty")}
            </CardContent>
          </Card>
        ) : activeCategory === "image" ? (
          <ImageGroupedModelList
            models={filteredModels}
            pricingByModelId={pricingByModelId}
            t={t}
            locale={locale}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                dbPricing={pricingByModelId.get(model.id) ?? null}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UseCaseSection({ t }: { t: (key: string) => string }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("dashboard.models.chooseByUseCase")}
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DASHBOARD_USE_CASES.map((useCase) => (
          <UseCaseCard key={useCase.id} useCase={useCase} t={t} />
        ))}
      </div>
    </section>
  );
}

const USE_CASE_ICONS: Record<DashboardUseCaseId, typeof MessageSquare> = {
  chat_general: MessageSquare,
  fast_low_cost_chat: Zap,
  text_to_image: ImageIcon,
  high_quality_image: Sparkles,
};

function UseCaseCard({
  useCase,
  t,
}: {
  useCase: DashboardUseCaseEntry;
  t: (key: string) => string;
}) {
  const Icon = USE_CASE_ICONS[useCase.id];
  const playgroundHref =
    useCase.playground === "chat"
      ? `/dashboard/playground?model=${encodeURIComponent(useCase.defaultModelId)}`
      : `/dashboard/image-playground?model=${encodeURIComponent(useCase.defaultModelId)}`;
  const playgroundLabel =
    useCase.playground === "chat"
      ? t("dashboard.models.useCaseOpenChatPlayground")
      : t("dashboard.models.useCaseOpenImagePlayground");

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md border bg-muted/50 p-2">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-snug">
              {t(`dashboard.models.useCase.${useCase.id}.title`)}
            </CardTitle>
            <CardDescription className="mt-1.5 text-sm">
              {t(`dashboard.models.useCase.${useCase.id}.description`)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3 pt-0">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("dashboard.models.useCaseRecommended")}
          </span>
          <span className="font-mono text-xs text-foreground/90">
            {useCase.recommendedModelIds.join(" · ")}
          </span>
        </div>
        <Button asChild size="sm" className="w-full">
          <Link href={playgroundHref}>
            {useCase.playground === "chat" ? (
              <Terminal className="h-4 w-4" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {playgroundLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageGroupedModelList({
  models,
  pricingByModelId,
  t,
  locale,
}: {
  models: ModelCatalogEntry[];
  pricingByModelId: Map<string, CatalogModelPricingItem>;
  t: (key: string) => string;
  locale: "en" | "zh";
}) {
  const grouped = groupImageModelsByDisplayGroup(models);

  return (
    <div className="flex flex-col gap-8">
      {grouped.map(({ group, models: groupModels }) => (
        <div key={group} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold tracking-tight">
            {t(`dashboard.models.imageGroup.${group}`)}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {groupModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                dbPricing={pricingByModelId.get(model.id) ?? null}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelCard({
  model,
  dbPricing,
  t,
  locale,
}: {
  model: ModelCatalogEntry;
  dbPricing: CatalogModelPricingItem | null;
  t: (key: string) => string;
  locale: "en" | "zh";
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  async function handleCopyModelId() {
    try {
      await navigator.clipboard.writeText(model.id);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("idle");
    }
  }

  const typeLabel = MODEL_TYPE_LABELS[model.type](t);
  const useCase =
    model.type === "image"
      ? getImageModelUseCase(model.id, t)
      : model.type === "chat"
        ? getChatModelUseCase(model.id, t)
        : null;
  const traitLabels = model.traits
    ? formatModelTraitLabels(model.traits, t)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{model.displayName}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">
              {model.id}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{typeLabel}</Badge>
            <StatusBadge status={model.status} t={t} />
            {model.id === TOKFAI_RECOMMENDED_MODEL ? (
              <Badge variant="default">{t("dashboard.models.recommendedTag")}</Badge>
            ) : null}
            {model.tags?.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        {traitLabels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {traitLabels.map((trait) => (
              <Badge key={trait.axis} variant="outline" className="text-xs font-normal">
                {trait.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PriceBlock model={model} dbPricing={dbPricing} t={t} locale={locale} />

        <dl className="grid gap-2 text-sm">
          {useCase && useCase !== "—" ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("dashboard.models.recommendedUseCase")}
              </dt>
              <dd className="text-muted-foreground">{useCase}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("dashboard.models.description")}
            </dt>
            <dd className="text-muted-foreground">{model.description}</dd>
          </div>
          {model.supports && model.supports.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("dashboard.models.supports")}
              </dt>
              <dd className="text-muted-foreground">
                {model.supports.join(", ")}
              </dd>
            </div>
          ) : null}
          {model.playground ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("dashboard.models.playground")}
              </dt>
              <dd>{model.playground}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleCopyModelId}>
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                {t("dashboard.models.copied")}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                {t("dashboard.models.copyModelId")}
              </>
            )}
          </Button>

          {isCatalogModelPlaygroundAvailable(model) && model.type === "chat" ? (
            <Button asChild size="sm">
              <Link href={`/dashboard/playground?model=${encodeURIComponent(model.id)}`}>
                <Terminal className="h-4 w-4" />
                {t("dashboard.models.tryChatPlayground")}
              </Link>
            </Button>
          ) : isCatalogModelPlaygroundAvailable(model) && model.type === "image" ? (
            <Button asChild size="sm">
              <Link
                href={`/dashboard/image-playground?model=${encodeURIComponent(model.id)}`}
              >
                <ImageIcon className="h-4 w-4" />
                {t("dashboard.models.tryImagePlayground")}
              </Link>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" disabled>
              {model.type === "video" ? (
                <>
                  <Video className="h-4 w-4" />
                  {t("dashboard.models.videoModelComingSoon")}
                </>
              ) : (
                <>
                  {model.type === "chat" ? (
                    <Terminal className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {t("dashboard.models.modelNotCallable")}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PriceBlock({
  model,
  dbPricing,
  t,
  locale,
}: {
  model: ModelCatalogEntry;
  dbPricing: CatalogModelPricingItem | null;
  t: (key: string) => string;
  locale: "en" | "zh";
}) {
  if (isImageModelEntry(model)) {
    const dbCredits = resolveDbImageCredits(dbPricing, model.type);
    const credits =
      dbCredits ?? (isImageModelEntry(model) ? model.pricing.creditsPerRequest : null);

    if (credits == null) return null;

    const exampleLines = [
      formatImageYuanExample(credits, locale),
    ].filter((line): line is string => line != null);

    return (
      <ModelPricingPanel
        t={t}
        variant="image"
        consumptionLines={[formatDbImageCreditsPerGeneration(credits, locale)]}
        exampleLines={exampleLines}
      />
    );
  }

  if (isChatModelEntry(model)) {
    const dbChat = resolveDbChatCredits(dbPricing, model.type);

    if (dbChat) {
      const exampleLines = [
        formatChatInputYuanExample(dbChat.inputPerMillion, locale),
        formatChatOutputYuanExample(dbChat.outputPerMillion, locale),
      ].filter((line): line is string => line != null);

      return (
        <ModelPricingPanel
          t={t}
          variant="chat"
          consumptionLines={[
            formatDbChatInputCreditsPerMillion(dbChat.inputPerMillion, locale),
            formatDbChatOutputCreditsPerMillion(dbChat.outputPerMillion, locale),
          ]}
          exampleLines={exampleLines}
        />
      );
    }

    const exampleLines = [
      formatChatInputYuanExampleFromRange(model.pricing.inputPerMillionYuan, locale),
      formatChatOutputYuanExampleFromRange(model.pricing.outputPerMillionYuan, locale),
    ].filter((line): line is string => line != null);

    return (
      <ModelPricingPanel
        t={t}
        variant="chat"
        consumptionLines={[t("dashboard.models.chatCreditsUsageGeneric")]}
        exampleLines={exampleLines}
      />
    );
  }

  return null;
}

function ModelPricingPanel({
  t,
  variant,
  consumptionLines,
  exampleLines,
}: {
  t: (key: string) => string;
  variant: "chat" | "image";
  consumptionLines: string[];
  exampleLines: string[];
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  const successLabel =
    variant === "image"
      ? t("dashboard.models.billingRuleImageSuccess")
      : t("dashboard.models.billingRuleSuccess");
  const showPriceExample = exampleLines.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/30">
        <div className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
          {t("dashboard.models.creditsConsumption")}
        </div>
        <ul className="mt-2 space-y-1.5 text-sm font-medium text-sky-950 dark:text-sky-50">
          {consumptionLines.map((line) => (
            <li key={line} className="font-mono leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{successLabel}</Badge>
        <Badge variant="outline">{t("dashboard.models.billingRuleFailure")}</Badge>
      </div>

      {showPriceExample ? (
        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("dashboard.models.priceExample")}
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto shrink-0 px-0 py-0 text-xs font-normal text-primary"
              onClick={() => setExplainOpen(true)}
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
              {t("dashboard.models.viewExplanation")}
            </Button>
          </div>
          <ul className="mt-2 space-y-1 font-mono text-sm text-foreground/90">
            {exampleLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {showPriceExample ? (
        <PriceExampleExplanationDialog
          open={explainOpen}
          onOpenChange={setExplainOpen}
          t={t}
        />
      ) : null}
    </div>
  );
}

function PriceExampleExplanationDialog({
  open,
  onOpenChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: string) => string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const explanationParagraphs = [
    t("dashboard.models.priceExampleExplanationP1"),
    t("dashboard.models.priceExampleExplanationP2"),
    t("dashboard.models.priceExampleExplanationP3"),
  ];

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-0 shadow-lg backdrop:bg-black/50 open:flex open:flex-col"
      onClose={() => onOpenChange(false)}
      aria-labelledby="price-example-explanation-title"
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <h3
          id="price-example-explanation-title"
          className="text-sm font-semibold leading-snug"
        >
          {t("dashboard.models.priceExampleExplanationTitle")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onOpenChange(false)}
          aria-label={t("dashboard.models.closeExplanation")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-[min(60vh,24rem)] overflow-y-auto px-4 py-3">
        <div className="space-y-3 text-sm text-muted-foreground">
          {explanationParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
      <div className="border-t px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => onOpenChange(false)}
        >
          {t("dashboard.models.closeExplanation")}
        </Button>
      </div>
    </dialog>
  );
}

const MODEL_TYPE_LABELS: Record<ModelType, (t: (key: string) => string) => string> = {
  chat: (t) => t("dashboard.models.typeChat"),
  image: (t) => t("dashboard.models.typeImage"),
  video: (t) => t("dashboard.models.typeVideo"),
};

function StatusBadge({
  status,
  t,
}: {
  status: ModelCatalogEntry["status"];
  t: (key: string) => string;
}) {
  if (status === "available") {
    return <Badge variant="success">{t("dashboard.models.available")}</Badge>;
  }
  return <Badge variant="warning">{t("dashboard.models.comingSoon")}</Badge>;
}
