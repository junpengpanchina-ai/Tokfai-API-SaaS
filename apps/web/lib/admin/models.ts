import type { AdminModelListItem } from "@/lib/admin/client";

export type AdminModelStatus = AdminModelListItem["status"];
export type AdminModelTypeFilter = "all" | "chat" | "image" | "video" | "other";
export type AdminModelStatusFilter = "all" | AdminModelStatus;

export function normalizeAdminModelType(
  modelType: string | null | undefined
): "chat" | "image" | "video" | "other" {
  const normalized = (modelType ?? "").toLowerCase();
  if (normalized === "chat") return "chat";
  if (normalized === "image") return "image";
  if (normalized === "video") return "video";
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
    video: models.filter((m) => normalizeAdminModelType(m.model_type) === "video")
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
  billing_type: "chat" | "image";
  input_credits_per_million_tokens: string;
  output_credits_per_million_tokens: string;
  image_credits_per_generation: string;
  upstream_cost_note: string;
  markup_ratio: string;
  pricing_enabled: boolean;
  pricing_visible: boolean;
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
    billing_type: "chat",
    input_credits_per_million_tokens: "0",
    output_credits_per_million_tokens: "0",
    image_credits_per_generation: "0",
    upstream_cost_note: "",
    markup_ratio: "1",
    pricing_enabled: false,
    pricing_visible: false,
  };
}

/** Admin edit: billing_type → model_type → chat default. */
export function resolveAdminBillingType(model: {
  billing_type?: string | null;
  model_type?: string | null;
}): "chat" | "image" {
  if (model.billing_type === "image") return "image";
  if (model.billing_type === "chat") return "chat";
  if (normalizeAdminModelType(model.model_type) === "image") return "image";
  return "chat";
}

export function adminModelToFormValues(
  model: AdminModelListItem
): AdminModelFormValues {
  const billingType = resolveAdminBillingType(model);

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
    billing_type: billingType,
    input_credits_per_million_tokens: String(
      model.input_credits_per_million_tokens ?? 0
    ),
    output_credits_per_million_tokens: String(
      model.output_credits_per_million_tokens ?? 0
    ),
    image_credits_per_generation: String(model.image_credits_per_generation ?? 0),
    upstream_cost_note: model.upstream_cost_note ?? "",
    markup_ratio: String(model.markup_ratio ?? 1),
    pricing_enabled: Boolean(model.pricing_enabled),
    pricing_visible: Boolean(model.pricing_visible),
  };
}

function sharedModelPricingFields(values: AdminModelFormValues) {
  return {
    billing_type: values.billing_type,
    upstream_cost_note: values.upstream_cost_note.trim() || null,
    markup_ratio: Number(values.markup_ratio),
    pricing_enabled: values.pricing_enabled,
    pricing_visible: values.pricing_visible,
  };
}

function chatPricingFields(values: AdminModelFormValues) {
  return {
    input_credits_per_million_tokens: Number(
      values.input_credits_per_million_tokens
    ),
    output_credits_per_million_tokens: Number(
      values.output_credits_per_million_tokens
    ),
  };
}

function imagePricingFields(values: AdminModelFormValues) {
  return {
    image_credits_per_generation: Number(values.image_credits_per_generation),
  };
}

export function formValuesToCreateBody(values: AdminModelFormValues) {
  const base = {
    id: values.id.trim(),
    display_name: values.display_name.trim(),
    provider: values.provider.trim() || "tokfai",
    model_type: values.model_type,
    enabled: values.enabled,
    visible: values.visible,
    sort_order: values.sort_order,
    ...sharedModelPricingFields(values),
  };

  if (values.billing_type === "image") {
    return { ...base, ...imagePricingFields(values) };
  }

  return { ...base, ...chatPricingFields(values) };
}

export function formValuesToUpdateBody(values: AdminModelFormValues) {
  const base = {
    display_name: values.display_name.trim(),
    provider: values.provider.trim() || "tokfai",
    model_type: values.model_type,
    enabled: values.enabled,
    visible: values.visible,
    sort_order: values.sort_order,
    ...sharedModelPricingFields(values),
  };

  if (values.billing_type === "image") {
    return { ...base, ...imagePricingFields(values) };
  }

  return { ...base, ...chatPricingFields(values) };
}
