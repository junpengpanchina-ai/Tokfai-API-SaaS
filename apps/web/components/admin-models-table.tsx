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
  emptyLabel = "No models match the current filters.",
}: AdminModelsTableProps) {
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
                <th className="px-4 py-2 pr-4 font-medium">Model name</th>
                <th className="py-2 pr-4 font-medium">Model ID</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Billing unit</th>
                <th className="py-2 pr-4 font-medium">Input price</th>
                <th className="py-2 pr-4 font-medium">Output price</th>
                <th className="py-2 pr-4 font-medium">Credits / generation</th>
                <th className="py-2 pr-4 font-medium">Reference price (CNY)</th>
                <th className="py-2 pr-4 font-medium">Tags</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Frontend</th>
                <th className="py-2 pr-4 font-medium">Playground</th>
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
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function AdminModelRow({ model }: { model: ModelCatalogEntry }) {
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
          ? formatImageCreditsPerRequest(model.pricing, "en")
          : "—"}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        <ReferencePriceCell model={model} />
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

function ReferencePriceCell({ model }: { model: ModelCatalogEntry }) {
  if (isChatModelEntry(model)) {
    const input = formatYuanRange(model.pricing.inputPerMillionYuan);
    const output = formatYuanRange(model.pricing.outputPerMillionYuan);
    return (
      <span className="whitespace-nowrap">
        input {input} / 1M, output {output} / 1M
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
      <span>{formatImageReferenceYuanPerRequest(model.pricing, "en")}</span>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

function TypeBadge({ type }: { type: ModelCatalogEntry["type"] }) {
  return (
    <Badge variant="outline" className="font-mono text-[11px] uppercase">
      {type}
    </Badge>
  );
}

function StatusBadge({ status }: { status: AdminCatalogDisplayStatus }) {
  if (status === "available") {
    return <Badge variant="success">available</Badge>;
  }
  if (status === "coming_soon") {
    return <Badge variant="warning">coming soon</Badge>;
  }
  return <Badge variant="secondary">hidden</Badge>;
}

function FrontendBadge({ visible }: { visible: boolean }) {
  return visible ? (
    <Badge variant="success">Visible</Badge>
  ) : (
    <Badge variant="outline">Hidden</Badge>
  );
}

function PlaygroundBadge({ label }: { label: AdminCatalogPlaygroundLabel }) {
  if (label === "Not available") {
    return <span className="text-muted-foreground">Not available</span>;
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
