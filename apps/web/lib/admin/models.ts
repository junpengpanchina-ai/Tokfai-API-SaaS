import type { AdminModelListItem } from "@/lib/admin/client";

export type AdminModelStatus = AdminModelListItem["status"];
export type AdminModelTypeFilter = "all" | "chat" | "image" | "other";
export type AdminModelStatusFilter = "all" | AdminModelStatus;

export function normalizeAdminModelType(
  modelType: string | null | undefined
): "chat" | "image" | "other" {
  const normalized = (modelType ?? "").toLowerCase();
  if (normalized === "chat") return "chat";
  if (normalized === "image") return "image";
  return "other";
}

export function filterAdminModels(
  models: AdminModelListItem[],
  search: string,
  typeFilter: AdminModelTypeFilter,
  statusFilter: AdminModelStatusFilter
): AdminModelListItem[] {
  const query = search.trim().toLowerCase();

  return models.filter((model) => {
    const modelType = normalizeAdminModelType(model.model_type);

    if (typeFilter !== "all" && modelType !== typeFilter) {
      return false;
    }

    if (statusFilter !== "all" && model.status !== statusFilter) {
      return false;
    }

    if (!query) return true;

    return (
      model.id.toLowerCase().includes(query) ||
      (model.display_name ?? "").toLowerCase().includes(query) ||
      (model.provider ?? "").toLowerCase().includes(query)
    );
  });
}

export function summarizeAdminModels(models: AdminModelListItem[]) {
  return {
    total: models.length,
    chat: models.filter((m) => normalizeAdminModelType(m.model_type) === "chat")
      .length,
    image: models.filter((m) => normalizeAdminModelType(m.model_type) === "image")
      .length,
    available: models.filter((m) => m.status === "available").length,
    archived: models.filter((m) => m.status === "archived").length,
  };
}

export type AdminModelFormValues = {
  id: string;
  display_name: string;
  provider: string;
  model_type: "chat" | "image" | "video" | "other";
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  billing_mode: "token" | "per_image";
  input_per_1k: string;
  output_per_1k: string;
  billable: boolean;
  markup_multiplier: string;
};

export function emptyAdminModelFormValues(): AdminModelFormValues {
  return {
    id: "",
    display_name: "",
    provider: "tokfai",
    model_type: "chat",
    enabled: false,
    visible: false,
    sort_order: 1000,
    billing_mode: "token",
    input_per_1k: "0",
    output_per_1k: "0",
    billable: false,
    markup_multiplier: "1",
  };
}

export function adminModelToFormValues(
  model: AdminModelListItem
): AdminModelFormValues {
  return {
    id: model.id,
    display_name: model.display_name ?? "",
    provider: model.provider ?? "tokfai",
    model_type:
      model.model_type === "chat" ||
      model.model_type === "image" ||
      model.model_type === "video" ||
      model.model_type === "other"
        ? model.model_type
        : "other",
    enabled: Boolean(model.enabled),
    visible: Boolean(model.visible),
    sort_order: model.sort_order ?? 1000,
    billing_mode: model.billing_mode === "per_image" ? "per_image" : "token",
    input_per_1k: String(model.input_per_1k ?? 0),
    output_per_1k: String(model.output_per_1k ?? 0),
    billable: Boolean(model.billable),
    markup_multiplier: String(model.markup_multiplier ?? 1),
  };
}

export function formValuesToCreateBody(values: AdminModelFormValues) {
  return {
    id: values.id.trim(),
    display_name: values.display_name.trim(),
    provider: values.provider.trim() || "tokfai",
    model_type: values.model_type,
    enabled: values.enabled,
    visible: values.visible,
    sort_order: values.sort_order,
    billing_mode: values.billing_mode,
    input_per_1k: Number(values.input_per_1k),
    output_per_1k: Number(values.output_per_1k),
    billable: values.billable,
    markup_multiplier: Number(values.markup_multiplier),
  };
}

export function formValuesToUpdateBody(values: AdminModelFormValues) {
  return {
    display_name: values.display_name.trim(),
    provider: values.provider.trim() || "tokfai",
    model_type: values.model_type,
    enabled: values.enabled,
    visible: values.visible,
    sort_order: values.sort_order,
    billing_mode: values.billing_mode,
    input_per_1k: Number(values.input_per_1k),
    output_per_1k: Number(values.output_per_1k),
    billable: values.billable,
    markup_multiplier: Number(values.markup_multiplier),
  };
}
