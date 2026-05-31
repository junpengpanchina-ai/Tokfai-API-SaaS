"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminModelForm } from "@/components/admin/admin-model-form";
import { AdminModelsSummary } from "@/components/admin-models-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AdminApiError,
  archiveAdminModel,
  createAdminModel,
  fetchAdminModels,
  restoreAdminModel,
  updateAdminModel,
  type AdminModelListItem,
} from "@/lib/admin/client";
import {
  adminModelToFormValues,
  emptyAdminModelFormValues,
  filterAdminModels,
  formValuesToCreateBody,
  formValuesToUpdateBody,
  summarizeAdminModels,
  type AdminModelFormValues,
  type AdminModelStatusFilter,
  type AdminModelTypeFilter,
} from "@/lib/admin/models";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type PanelMode = "list" | "create" | "edit";

function formatModelError(error: unknown, t: (key: string) => string) {
  if (error instanceof AdminApiError && error.isSessionExpired) {
    return {
      code: error.code ?? "missing_access_token",
      message: t("admin.common.sessionExpired"),
    };
  }
  if (error instanceof AdminApiError) {
    return {
      code: error.code ?? "unknown_error",
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return { code: "unknown_error", message: error.message };
  }
  return { code: "unknown_error", message: t("admin.models.manage.loadFailed") };
}

export function AdminModelsManagePanel() {
  const { t } = useI18n();
  const [models, setModels] = useState<AdminModelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AdminModelTypeFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<AdminModelStatusFilter>("all");
  const [panelMode, setPanelMode] = useState<PanelMode>("list");
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<AdminModelFormValues>(
    emptyAdminModelFormValues()
  );
  const [formError, setFormError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionModelId, setActionModelId] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAdminModels();
      setModels(rows);
    } catch (error) {
      setLoadError(formatModelError(error, t).message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const filteredModels = useMemo(
    () => filterAdminModels(models, search, typeFilter, statusFilter),
    [models, search, typeFilter, statusFilter]
  );

  const summaryStats = useMemo(() => summarizeAdminModels(models), [models]);

  function openCreateForm() {
    setPanelMode("create");
    setEditingModelId(null);
    setFormValues(emptyAdminModelFormValues());
    setFormError(null);
  }

  function openEditForm(model: AdminModelListItem) {
    setPanelMode("edit");
    setEditingModelId(model.id);
    setFormValues(adminModelToFormValues(model));
    setFormError(null);
  }

  function closeForm() {
    setPanelMode("list");
    setEditingModelId(null);
    setFormError(null);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createAdminModel(formValuesToCreateBody(formValues));
      closeForm();
      await loadModels();
    } catch (error) {
      setFormError(formatModelError(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingModelId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateAdminModel(editingModelId, formValuesToUpdateBody(formValues));
      closeForm();
      await loadModels();
    } catch (error) {
      setFormError(formatModelError(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(modelId: string) {
    setActionModelId(modelId);
    try {
      await archiveAdminModel(modelId);
      if (editingModelId === modelId) closeForm();
      await loadModels();
    } catch (error) {
      setLoadError(formatModelError(error, t).message);
    } finally {
      setActionModelId(null);
    }
  }

  async function handleRestore(modelId: string) {
    setActionModelId(modelId);
    try {
      await restoreAdminModel(modelId);
      await loadModels();
    } catch (error) {
      setLoadError(formatModelError(error, t).message);
    } finally {
      setActionModelId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {t("admin.models.manage.title")}
              </CardTitle>
              <CardDescription>{t("admin.models.manage.subtitle")}</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={openCreateForm}>
              {t("admin.models.manage.addModel")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.models.manage.loadFailedTitle")}
            </CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadModels()}>
              {t("admin.common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AdminModelsSummary
        stats={{
          total: summaryStats.total,
          chat: summaryStats.chat,
          image: summaryStats.image,
          available: summaryStats.available,
          comingSoon: models.filter((m) => m.status === "coming_soon").length,
        }}
      />

      {panelMode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.models.manage.createTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminModelForm
              mode="create"
              values={formValues}
              onChange={setFormValues}
              onSubmit={handleCreateSubmit}
              onCancel={closeForm}
              submitting={submitting}
              error={formError}
            />
          </CardContent>
        </Card>
      ) : null}

      {panelMode === "edit" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.models.manage.editTitle")}
            </CardTitle>
            <CardDescription>{editingModelId}</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminModelForm
              mode="edit"
              values={formValues}
              onChange={setFormValues}
              onSubmit={handleEditSubmit}
              onCancel={closeForm}
              submitting={submitting}
              error={formError}
            />
          </CardContent>
        </Card>
      ) : null}

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
                onChange={(value) => setTypeFilter(value as AdminModelTypeFilter)}
                options={[
                  { value: "all", label: t("admin.models.filterAllTypes") },
                  { value: "chat", label: t("admin.models.typeChat") },
                  { value: "image", label: t("admin.models.typeImage") },
                  { value: "other", label: t("admin.models.manage.typeOther") },
                ]}
              />
            </FilterField>
            <FilterField label={t("admin.models.filterStatus")}>
              <NativeSelect
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter(value as AdminModelStatusFilter)
                }
                options={[
                  { value: "all", label: t("admin.models.filterAllStatuses") },
                  { value: "available", label: t("admin.models.statusAvailable") },
                  {
                    value: "coming_soon",
                    label: t("admin.models.statusComingSoon"),
                  },
                  { value: "disabled", label: t("admin.models.manage.statusDisabled") },
                  { value: "archived", label: t("admin.models.manage.statusArchived") },
                ]}
              />
            </FilterField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("admin.models.manage.tableTitle")}</CardTitle>
            <CardDescription>
              {t("admin.models.manage.tableDesc").replace(
                "{count}",
                String(filteredModels.length)
              )}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadModels()}
          >
            {loading ? t("admin.common.refreshing") : t("admin.common.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.models.manage.loading")}
            </p>
          ) : filteredModels.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("admin.models.tableModelName")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.tableModelId")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.tableType")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.tableStatus")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.manage.tableBilling")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.manage.tablePricing")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.models.manage.tableUpdated")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.map((model) => (
                    <tr key={model.id} className="border-b align-top last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        {model.display_name ?? "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {model.id}
                      </td>
                      <td className="py-3 pr-4">{model.model_type ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={model.status} t={t} />
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {model.billing_type ?? "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {model.billing_type === "image"
                          ? `${model.image_credits_per_generation ?? "—"} / gen`
                          : `in=${model.input_credits_per_million_tokens ?? "—"} / out=${model.output_credits_per_million_tokens ?? "—"} / 1M`}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDateTime(model.updated_at)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(model)}
                          >
                            {t("admin.models.manage.edit")}
                          </Button>
                          {model.status === "archived" ||
                          (!model.enabled && !model.visible) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={actionModelId === model.id}
                              onClick={() => void handleRestore(model.id)}
                            >
                              {t("admin.models.manage.restore")}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={actionModelId === model.id}
                              onClick={() => void handleArchive(model.id)}
                            >
                              {t("admin.models.manage.archive")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("admin.models.emptyFilters")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: AdminModelListItem["status"];
  t: (key: string) => string;
}) {
  if (status === "available") {
    return <Badge variant="success">{t("admin.models.statusAvailable")}</Badge>;
  }
  if (status === "coming_soon") {
    return <Badge variant="warning">{t("admin.models.statusComingSoon")}</Badge>;
  }
  if (status === "disabled") {
    return <Badge variant="secondary">{t("admin.models.manage.statusDisabled")}</Badge>;
  }
  return <Badge variant="outline">{t("admin.models.manage.statusArchived")}</Badge>;
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

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
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
