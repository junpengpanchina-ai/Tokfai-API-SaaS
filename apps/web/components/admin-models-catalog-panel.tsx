"use client";

import { useMemo, useState } from "react";

import { AdminFutureControlsCard } from "@/components/admin/admin-future-controls-card";
import { AdminModelsSummary, type AdminModelsSummaryStats } from "@/components/admin-models-summary";
import { AdminModelsTable } from "@/components/admin-models-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  ALL_CATALOG_MODELS,
  CHAT_MODELS,
  IMAGE_MODELS,
  getAdminCatalogDisplayStatus,
  type AdminCatalogDisplayStatus,
  type ModelCatalogEntry,
  type ModelType,
} from "@/lib/model-catalog";

type TypeFilter = "all" | ModelType;
type StatusFilter = "all" | AdminCatalogDisplayStatus;

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "chat", label: "chat" },
  { value: "image", label: "image" },
  { value: "video", label: "video" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "available" },
  { value: "coming_soon", label: "coming soon" },
  { value: "hidden", label: "hidden" },
];

export function AdminModelsCatalogPanel() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const summaryStats = useMemo<AdminModelsSummaryStats>(() => {
    const available = ALL_CATALOG_MODELS.filter(
      (model) => getAdminCatalogDisplayStatus(model) === "available"
    ).length;
    const comingSoon = ALL_CATALOG_MODELS.filter(
      (model) => getAdminCatalogDisplayStatus(model) === "coming_soon"
    ).length;

    return {
      total: ALL_CATALOG_MODELS.length,
      chat: CHAT_MODELS.length,
      image: IMAGE_MODELS.length,
      available,
      comingSoon,
    };
  }, []);

  const filteredModels = useMemo(
    () => filterCatalogModels(search, typeFilter, statusFilter),
    [search, typeFilter, statusFilter]
  );

  const chatModels = filteredModels.filter((model) => model.type === "chat");
  const imageModels = filteredModels.filter((model) => model.type === "image");
  const videoModels = filteredModels.filter((model) => model.type === "video");

  const showChatSection = typeFilter === "all" || typeFilter === "chat";
  const showImageSection = typeFilter === "all" || typeFilter === "image";
  const showVideoSection =
    (typeFilter === "all" || typeFilter === "video") && videoModels.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.models.catalogOverview")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t("admin.models.catalogDesc")}</p>
        </CardContent>
      </Card>

      <AdminModelsSummary stats={summaryStats} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search & filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField label="Search model name or model ID">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. gemini-3.1-pro"
                className="font-mono text-xs"
              />
            </FilterField>

            <FilterField label="Type">
              <NativeSelect
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as TypeFilter)}
                options={TYPE_FILTER_OPTIONS}
              />
            </FilterField>

            <FilterField label="Status">
              <NativeSelect
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={STATUS_FILTER_OPTIONS}
              />
            </FilterField>
          </div>
        </CardContent>
      </Card>

      {showChatSection ? (
        <AdminModelsTable
          title="Chat Models"
          description="Token-based chat models from the frontend catalog."
          models={chatModels}
        />
      ) : null}

      {showImageSection ? (
        <AdminModelsTable
          title="Image Models"
          description="Per-generation image models from the frontend catalog."
          models={imageModels}
        />
      ) : null}

      {showVideoSection ? (
        <AdminModelsTable
          title="Video Models"
          description="Video models reserved for future Playground support."
          models={videoModels}
        />
      ) : null}

      {!showChatSection && !showImageSection && !showVideoSection ? (
        <AdminModelsTable title="Models" models={[]} />
      ) : null}

      <AdminFutureControlsCard
        titleKey="admin.models.futureControlsTitle"
        descriptionKey="admin.models.futureControlsDesc"
        controlLabelKeys={[
          "admin.models.editDisplayPrice",
          "admin.models.editModelStatus",
          "admin.models.toggleFrontendVisibility",
          "admin.models.editTagsCopy",
        ]}
      />
    </div>
  );
}

function filterCatalogModels(
  search: string,
  typeFilter: TypeFilter,
  statusFilter: StatusFilter
): ModelCatalogEntry[] {
  const query = search.trim().toLowerCase();

  return ALL_CATALOG_MODELS.filter((model) => {
    if (typeFilter !== "all" && model.type !== typeFilter) {
      return false;
    }

    const displayStatus = getAdminCatalogDisplayStatus(model);
    if (statusFilter !== "all" && displayStatus !== statusFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      model.displayName.toLowerCase().includes(query) ||
      model.id.toLowerCase().includes(query)
    );
  });
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function NativeSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
