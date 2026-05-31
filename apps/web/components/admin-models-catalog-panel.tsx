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
  VIDEO_MODELS,
  getAdminCatalogDisplayStatus,
  type AdminCatalogDisplayStatus,
  type ModelCatalogEntry,
  type ModelType,
} from "@/lib/model-catalog";

type TypeFilter = "all" | ModelType;
type StatusFilter = "all" | AdminCatalogDisplayStatus;

export function AdminModelsCatalogPanel() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const typeFilterOptions = useMemo(
    () =>
      [
        { value: "all" as TypeFilter, labelKey: "admin.models.filterAllTypes" },
        { value: "chat" as TypeFilter, labelKey: "admin.models.typeChat" },
        { value: "image" as TypeFilter, labelKey: "admin.models.typeImage" },
        { value: "video" as TypeFilter, labelKey: "admin.models.typeVideo" },
      ] as const,
    []
  );

  const statusFilterOptions = useMemo(
    () =>
      [
        { value: "all" as StatusFilter, labelKey: "admin.models.filterAllStatuses" },
        { value: "available" as StatusFilter, labelKey: "admin.models.statusAvailable" },
        {
          value: "coming_soon" as StatusFilter,
          labelKey: "admin.models.statusComingSoon",
        },
        { value: "hidden" as StatusFilter, labelKey: "admin.models.statusHidden" },
      ] as const,
    []
  );

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
      video: VIDEO_MODELS.length,
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
          <CardTitle className="text-base">{t("admin.models.searchFilters")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField label={t("admin.models.searchLabel")}>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("admin.models.searchPlaceholder")}
                className="font-mono text-xs"
              />
            </FilterField>

            <FilterField label={t("admin.models.filterType")}>
              <NativeSelect
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as TypeFilter)}
                options={typeFilterOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
              />
            </FilterField>

            <FilterField label={t("admin.models.filterStatus")}>
              <NativeSelect
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={statusFilterOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
              />
            </FilterField>
          </div>
        </CardContent>
      </Card>

      {showChatSection ? (
        <AdminModelsTable
          title={t("admin.models.chatSectionTitle")}
          description={t("admin.models.chatSectionDesc")}
          models={chatModels}
        />
      ) : null}

      {showImageSection ? (
        <AdminModelsTable
          title={t("admin.models.imageSectionTitle")}
          description={t("admin.models.imageSectionDesc")}
          models={imageModels}
        />
      ) : null}

      {showVideoSection ? (
        <AdminModelsTable
          title={t("admin.models.videoSectionTitle")}
          description={t("admin.models.videoSectionDesc")}
          models={videoModels}
        />
      ) : null}

      {!showChatSection && !showImageSection && !showVideoSection ? (
        <AdminModelsTable title={t("admin.models.modelsSectionTitle")} models={[]} />
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
