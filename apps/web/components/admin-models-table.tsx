"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatChatInputPricePerMillion,
  formatChatOutputPricePerMillion,
  formatImageCreditsPerRequest,
  formatImageReferenceYuanPerRequest,
  formatYuanRange,
} from "@/lib/model-pricing-display";
import {
  getAdminCatalogDisplayStatus,
  getAdminCatalogPlaygroundLabel,
  isCatalogFrontendVisible,
  isChatModelEntry,
  isImageModelEntry,
  type AdminCatalogDisplayStatus,
  type AdminCatalogPlaygroundLabel,
  type ModelCatalogEntry,
} from "@/lib/model-catalog";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage, type Locale } from "@/lib/i18n/messages";

type AdminModelsTableProps = {
  title: string;
  description?: string;
  models: ModelCatalogEntry[];
  emptyLabel?: string;
};

export function AdminModelsTable({
  title,
  description,
  models,
  emptyLabel,
}: AdminModelsTableProps) {
  const { t } = useI18n();
  const resolvedEmptyLabel = emptyLabel ?? t("admin.models.emptyFilters");

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {models.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-[72rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 pr-4 font-medium">
                  {t("admin.models.tableModelName")}
                </th>
                <th className="py-2 pr-4 font-medium">{t("admin.models.tableModelId")}</th>
                <th className="py-2 pr-4 font-medium">{t("admin.models.tableType")}</th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableBillingUnit")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableInputPrice")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableOutputPrice")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableCreditsPerGen")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableReferencePrice")}
                </th>
                <th className="py-2 pr-4 font-medium">{t("admin.models.tableTags")}</th>
                <th className="py-2 pr-4 font-medium">{t("admin.models.tableStatus")}</th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tableFrontend")}
                </th>
                <th className="py-2 pr-4 font-medium">
                  {t("admin.models.tablePlayground")}
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <AdminModelRow key={model.id} model={model} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {resolvedEmptyLabel}
        </div>
      )}
    </section>
  );
}

function AdminModelRow({ model }: { model: ModelCatalogEntry }) {
  const { locale } = useI18n();
  const displayStatus = getAdminCatalogDisplayStatus(model);
  const frontendVisible = isCatalogFrontendVisible(model);
  const playground = getAdminCatalogPlaygroundLabel(model);

  return (
    <tr className="border-b align-top last:border-0">
      <td className="px-4 py-3 pr-4 font-medium">{model.displayName}</td>
      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
        {model.id}
      </td>
      <td className="py-3 pr-4">
        <TypeBadge type={model.type} />
      </td>
      <td className="py-3 pr-4 font-mono text-xs">{model.billingUnit}</td>
      <td className="py-3 pr-4 font-mono text-xs">
        {isChatModelEntry(model)
          ? formatChatInputPricePerMillion(model.pricing)
          : "—"}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        {isChatModelEntry(model)
          ? formatChatOutputPricePerMillion(model.pricing)
          : "—"}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        {isImageModelEntry(model)
          ? formatImageCreditsPerRequest(model.pricing, locale as Locale)
          : "—"}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        <ReferencePriceCell model={model} locale={locale as Locale} />
      </td>
      <td className="py-3 pr-4">
        <TagList tags={model.tags} />
      </td>
      <td className="py-3 pr-4">
        <StatusBadge status={displayStatus} />
      </td>
      <td className="py-3 pr-4">
        <FrontendBadge visible={frontendVisible} />
      </td>
      <td className="py-3 pr-4">
        <PlaygroundBadge label={playground} />
      </td>
    </tr>
  );
}

function ReferencePriceCell({
  model,
  locale,
}: {
  model: ModelCatalogEntry;
  locale: Locale;
}) {
  const { t } = useI18n();

  if (isChatModelEntry(model)) {
    const input = formatYuanRange(model.pricing.inputPerMillionYuan);
    const output = formatYuanRange(model.pricing.outputPerMillionYuan);
    return (
      <span className="whitespace-nowrap">
        {formatMessage(t("admin.models.refPriceChat"), { input, output })}
      </span>
    );
  }

  if (isImageModelEntry(model)) {
    if (
      model.pricing.referenceYuanPerRequest.min === 0 &&
      model.pricing.referenceYuanPerRequest.max === 0
    ) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <span>{formatImageReferenceYuanPerRequest(model.pricing, locale)}</span>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

function TypeBadge({ type }: { type: ModelCatalogEntry["type"] }) {
  const { t } = useI18n();
  const labelKey =
    type === "chat"
      ? "admin.models.typeChat"
      : type === "image"
        ? "admin.models.typeImage"
        : "admin.models.typeVideo";

  return (
    <Badge variant="outline" className="font-mono text-[11px] uppercase">
      {t(labelKey)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: AdminCatalogDisplayStatus }) {
  const { t } = useI18n();

  if (status === "available") {
    return <Badge variant="success">{t("admin.models.statusAvailable")}</Badge>;
  }
  if (status === "coming_soon") {
    return <Badge variant="warning">{t("admin.models.statusComingSoon")}</Badge>;
  }
  return <Badge variant="secondary">{t("admin.models.statusHidden")}</Badge>;
}

function FrontendBadge({ visible }: { visible: boolean }) {
  const { t } = useI18n();

  return visible ? (
    <Badge variant="success">{t("admin.models.frontendVisible")}</Badge>
  ) : (
    <Badge variant="outline">{t("admin.models.frontendHidden")}</Badge>
  );
}

function PlaygroundBadge({ label }: { label: AdminCatalogPlaygroundLabel }) {
  const { t } = useI18n();

  if (label === "Not available") {
    return (
      <span className="text-muted-foreground">
        {t("admin.models.playgroundNotAvailable")}
      </span>
    );
  }
  if (label === "Chat Playground") {
    return <Badge variant="secondary">{t("admin.models.playgroundChat")}</Badge>;
  }
  if (label === "Image Playground") {
    return <Badge variant="secondary">{t("admin.models.playgroundImage")}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
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
