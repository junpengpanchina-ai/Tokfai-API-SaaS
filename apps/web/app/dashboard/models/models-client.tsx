"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, ImageIcon, Info, MessageSquare, Terminal, Video, X } from "lucide-react";

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
  CHAT_MODELS,
  IMAGE_MODELS,
  type ModelCatalogEntry,
  type ModelType,
  VIDEO_MODELS,
  isChatModelEntry,
  isImageModelEntry,
} from "@/lib/model-catalog";
import {
  formatChatInputPricePerMillion,
  formatChatOutputPricePerMillion,
  formatDbChatInputCreditsPerMillion,
  formatDbChatOutputCreditsPerMillion,
  formatDbImageCreditsPerGeneration,
  formatStarterChatInputYuanExample,
  formatStarterChatOutputYuanExample,
  formatStarterImageYuanExample,
  catalogPricingByModelId,
  getImageModelUseCase,
  resolveDbChatCredits,
  resolveDbImageCredits,
} from "@/lib/model-pricing-display";
import { TOKFAI_MODELS_ENDPOINT } from "@/lib/tokfai-api";

export function ModelsClient({
  catalogPricing,
}: {
  catalogPricing: CatalogModelPricingItem[];
}) {
  const { t, locale } = useI18n();
  const pricingByModelId = catalogPricingByModelId(catalogPricing);

  const availableImageModels = IMAGE_MODELS.filter(
    (model) => model.status === "available"
  );
  const comingSoonImageModels = IMAGE_MODELS.filter(
    (model) => model.status === "coming_soon"
  );

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

      <ModelSection
        title={t("dashboard.models.chatSectionTitle")}
        description={t("dashboard.models.chatSectionDesc")}
        icon={MessageSquare}
        models={CHAT_MODELS}
        pricingByModelId={pricingByModelId}
        t={t}
        locale={locale}
      />

      <ModelSection
        title={t("dashboard.models.imageSectionTitle")}
        description={t("dashboard.models.imageSectionDesc")}
        icon={ImageIcon}
        models={availableImageModels}
        pricingByModelId={pricingByModelId}
        t={t}
        locale={locale}
      />

      {comingSoonImageModels.length > 0 ? (
        <ModelSection
          title={t("dashboard.models.imageComingSoonTitle")}
          description={t("dashboard.models.imageComingSoonDesc")}
          icon={ImageIcon}
          models={comingSoonImageModels}
          comingSoon
          pricingByModelId={pricingByModelId}
          t={t}
          locale={locale}
        />
      ) : null}

      <ModelSection
        title={t("dashboard.models.videoSectionTitle")}
        description={t("dashboard.models.videoSectionDesc")}
        icon={Video}
        models={VIDEO_MODELS}
        comingSoon
        pricingByModelId={pricingByModelId}
        t={t}
        locale={locale}
      />
    </div>
  );
}

function ModelSection({
  title,
  description,
  icon: Icon,
  models,
  comingSoon = false,
  pricingByModelId,
  t,
  locale,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  models: ModelCatalogEntry[];
  comingSoon?: boolean;
  pricingByModelId: Map<string, CatalogModelPricingItem>;
  t: (key: string) => string;
  locale: "en" | "zh";
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {comingSoon ? (
              <Badge variant="warning">{t("dashboard.models.comingSoon")}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            dbPricing={pricingByModelId.get(model.id) ?? null}
            t={t}
            locale={locale}
          />
        ))}
      </div>
    </section>
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
            {model.tags?.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PriceBlock model={model} dbPricing={dbPricing} t={t} locale={locale} />

        <dl className="grid gap-2 text-sm">
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
          {model.type === "image" ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("dashboard.models.recommendedUseCase")}
              </dt>
              <dd className="text-muted-foreground">
                {getImageModelUseCase(model.id, t)}
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

          {model.type === "chat" && model.status === "available" ? (
            <Button asChild size="sm">
              <Link href={`/dashboard/playground?model=${encodeURIComponent(model.id)}`}>
                <Terminal className="h-4 w-4" />
                {t("dashboard.models.tryChatPlayground")}
              </Link>
            </Button>
          ) : model.type === "image" && model.status === "available" && model.playground ? (
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
                  {t("dashboard.models.videoPlaygroundSoon")}
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  {t("dashboard.models.comingSoon")}
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
    const dbCredits = resolveDbImageCredits(dbPricing);
    const credits =
      dbCredits ?? (isImageModelEntry(model) ? model.pricing.creditsPerRequest : null);

    if (credits == null) return null;

    return (
      <ModelPricingPanel
        t={t}
        variant="image"
        consumptionLines={[formatDbImageCreditsPerGeneration(credits, locale)]}
        exampleIntro={t("dashboard.models.priceExampleStarterIntro")}
        exampleLines={[formatStarterImageYuanExample(credits, locale)]}
      />
    );
  }

  if (isChatModelEntry(model)) {
    const dbChat = resolveDbChatCredits(dbPricing);

    if (dbChat) {
      return (
        <ModelPricingPanel
          t={t}
          variant="chat"
          consumptionLines={[
            formatDbChatInputCreditsPerMillion(dbChat.inputPerMillion, locale),
            formatDbChatOutputCreditsPerMillion(dbChat.outputPerMillion, locale),
          ]}
          exampleIntro={t("dashboard.models.priceExampleStarterIntro")}
          exampleLines={[
            formatStarterChatInputYuanExample(dbChat.inputPerMillion, locale),
            formatStarterChatOutputYuanExample(dbChat.outputPerMillion, locale),
          ]}
        />
      );
    }

    return (
      <ModelPricingPanel
        t={t}
        variant="chat"
        consumptionLines={[t("dashboard.models.chatCreditsUsageGeneric")]}
        exampleIntro={t("dashboard.models.priceExampleUpstreamIntro")}
        exampleLines={[
          `${t("dashboard.models.inputPrice")}: ${formatChatInputPricePerMillion(model.pricing)}`,
          `${t("dashboard.models.outputPrice")}: ${formatChatOutputPricePerMillion(model.pricing)}`,
        ]}
        fallbackReference
      />
    );
  }

  return null;
}

function ModelPricingPanel({
  t,
  variant,
  consumptionLines,
  exampleIntro,
  exampleLines,
  fallbackReference = false,
}: {
  t: (key: string) => string;
  variant: "chat" | "image";
  consumptionLines: string[];
  exampleIntro: string;
  exampleLines: string[];
  fallbackReference?: boolean;
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  const successLabel =
    variant === "image"
      ? t("dashboard.models.billingRuleImageSuccess")
      : t("dashboard.models.billingRuleSuccess");

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/30">
        <div className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
          {t("dashboard.models.creditsConsumption")}
        </div>
        <ul className="mt-2 space-y-1.5 text-sm font-medium text-sky-950 dark:text-sky-50">
          {consumptionLines.map((line) => (
            <li key={line} className={fallbackReference ? "" : "font-mono leading-relaxed"}>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{successLabel}</Badge>
        <Badge variant="outline">{t("dashboard.models.billingRuleFailure")}</Badge>
      </div>

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
        <p className="mt-2 text-xs text-muted-foreground">{exampleIntro}</p>
        <ul
          className={`mt-2 space-y-1 text-sm ${
            fallbackReference ? "text-muted-foreground" : "font-mono text-foreground/90"
          }`}
        >
          {exampleLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <PriceExampleExplanationDialog
        open={explainOpen}
        onOpenChange={setExplainOpen}
        variant={variant}
        t={t}
      />
    </div>
  );
}

function PriceExampleExplanationDialog({
  open,
  onOpenChange,
  variant,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "chat" | "image";
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

  const explanationItems =
    variant === "chat"
      ? [
          t("dashboard.models.priceExampleExplainChat1"),
          t("dashboard.models.priceExampleExplainChat2"),
          t("dashboard.models.priceExampleExplainChat3"),
          t("dashboard.models.priceExampleExplainChat4"),
          t("dashboard.models.priceExampleExplainChat5"),
        ]
      : [
          t("dashboard.models.priceExampleExplainImage1"),
          t("dashboard.models.priceExampleExplainImage2"),
          t("dashboard.models.priceExampleExplainImage3"),
          t("dashboard.models.priceExampleExplainImage4"),
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
          {t("dashboard.models.priceExample")}
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
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {explanationItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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
