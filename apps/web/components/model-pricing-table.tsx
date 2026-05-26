"use client";

import type { Locale } from "@/lib/i18n/messages";
import {
  CHAT_MODELS,
  IMAGE_MODELS,
  type ModelCatalogEntry,
  isChatModelEntry,
  isImageModelEntry,
} from "@/lib/model-catalog";
import {
  formatChatInputPricePerMillion,
  formatChatOutputPricePerMillion,
  formatImageCreditsPerRequest,
  getChatBillingUnitLabel,
  getImageModelUseCase,
} from "@/lib/model-pricing-display";

type ModelPricingTableProps = {
  locale: Locale;
  t: (key: string) => string;
  labels: {
    chatTitle: string;
    imageTitle: string;
    imageIntro?: string;
    colModel: string;
    colModelId: string;
    colInput: string;
    colOutput: string;
    colPrice: string;
    colBillingUnit: string;
    colUseCase: string;
    colTags: string;
    comingSoon: string;
  };
};

export function ModelPricingTables({ locale, t, labels }: ModelPricingTableProps) {
  const availableImageModels = IMAGE_MODELS.filter(
    (model) => model.status === "available"
  );
  const comingSoonImageModels = IMAGE_MODELS.filter(
    (model) => model.status === "coming_soon"
  );

  return (
    <div className="flex flex-col gap-10">
      <PricingSection title={labels.chatTitle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{labels.colModel}</th>
              <th className="py-2 pr-4 font-medium">{labels.colModelId}</th>
              <th className="py-2 pr-4 font-medium">{labels.colInput}</th>
              <th className="py-2 pr-4 font-medium">{labels.colOutput}</th>
              <th className="py-2 pr-4 font-medium">{labels.colBillingUnit}</th>
              <th className="py-2 pr-4 font-medium">{labels.colTags}</th>
            </tr>
          </thead>
          <tbody>
            {CHAT_MODELS.map((model) => (
              <ChatPricingRow key={model.id} model={model} locale={locale} />
            ))}
          </tbody>
        </table>
      </PricingSection>

      <PricingSection
        title={labels.imageTitle}
        description={labels.imageIntro}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{labels.colModel}</th>
              <th className="py-2 pr-4 font-medium">{labels.colModelId}</th>
              <th className="py-2 pr-4 font-medium">{labels.colPrice}</th>
              <th className="py-2 pr-4 font-medium">{labels.colTags}</th>
              <th className="py-2 pr-4 font-medium">{labels.colUseCase}</th>
            </tr>
          </thead>
          <tbody>
            {availableImageModels.map((model) => (
              <ImagePricingRow
                key={model.id}
                model={model}
                locale={locale}
                t={t}
              />
            ))}
            {comingSoonImageModels.map((model) => (
              <ImagePricingRow
                key={model.id}
                model={model}
                locale={locale}
                t={t}
                comingSoonLabel={labels.comingSoon}
                comingSoon
              />
            ))}
          </tbody>
        </table>
      </PricingSection>
    </div>
  );
}

function PricingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background px-4">
        {children}
      </div>
    </section>
  );
}

function ChatPricingRow({
  model,
  locale,
}: {
  model: ModelCatalogEntry;
  locale: Locale;
}) {
  if (!isChatModelEntry(model)) {
    return null;
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4 align-top font-medium">{model.displayName}</td>
      <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
        {model.id}
      </td>
      <td className="py-3 pr-4 align-top font-mono text-xs">
        {formatChatInputPricePerMillion(model.pricing)}
      </td>
      <td className="py-3 pr-4 align-top font-mono text-xs">
        {formatChatOutputPricePerMillion(model.pricing)}
      </td>
      <td className="py-3 pr-4 align-top text-muted-foreground">
        {getChatBillingUnitLabel(locale)}
      </td>
      <td className="py-3 pr-4 align-top">
        <TagList tags={model.tags} />
      </td>
    </tr>
  );
}

function ImagePricingRow({
  model,
  locale,
  t,
  comingSoon = false,
  comingSoonLabel = "Coming soon",
}: {
  model: ModelCatalogEntry;
  locale: Locale;
  t: (key: string) => string;
  comingSoon?: boolean;
  comingSoonLabel?: string;
}) {
  if (!isImageModelEntry(model)) {
    return null;
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{model.displayName}</span>
          {comingSoon ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              {comingSoonLabel}
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
        {model.id}
      </td>
      <td className="py-3 pr-4 align-top font-mono text-xs font-medium text-foreground">
        {formatImageCreditsPerRequest(model.pricing, locale)}
      </td>
      <td className="py-3 pr-4 align-top">
        <TagList tags={model.tags} />
      </td>
      <td className="py-3 pr-4 align-top text-muted-foreground">
        {getImageModelUseCase(model.id, t)}
      </td>
    </tr>
  );
}

function TagList({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
