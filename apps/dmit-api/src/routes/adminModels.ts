import { z } from "zod";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

const MODEL_PATCH_FIELDS = [
  "enabled",
  "visible",
  "display_name",
  "provider",
  "model_type",
  "sort_order",
] as const;

const PRICING_PATCH_FIELDS = [
  "billing_mode",
  "input_per_1k",
  "output_per_1k",
  "billable",
  "markup_multiplier",
] as const;

const PER_1K_MAX = 0.1;
const MARKUP_MULTIPLIER_MAX = 20;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export type AdminModelStatus =
  | "available"
  | "disabled"
  | "coming_soon"
  | "archived";

export type AdminModelListItem = {
  id: string;
  display_name: string | null;
  provider: string | null;
  model_type: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  status: AdminModelStatus;
  sort_order: number | null;
  billing_mode: string | null;
  input_per_1k: number | null;
  output_per_1k: number | null;
  billable: boolean | null;
  markup_multiplier: number | null;
  updated_at: string | null;
};

type ModelDbRow = {
  id: string;
  display_name: string | null;
  provider: string | null;
  model_type: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  sort_order: number | string | null;
  updated_at: string | null;
  model_pricing:
    | ModelPricingDbRow
    | ModelPricingDbRow[]
    | null
    | undefined;
};

type ModelPricingDbRow = {
  billing_mode: string | null;
  input_per_1k: number | string | null;
  output_per_1k: number | string | null;
  billable: boolean | null;
  markup_multiplier: number | string | null;
  updated_at: string | null;
};

type AdminModelWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
};

const ADMIN_MODEL_RESOURCE_TYPE = "models";

function resolveModelResourceId(
  id: string | undefined,
  body?: Record<string, unknown>
): string {
  if (id?.trim()) return id.trim();
  const bodyId = body?.id;
  if (typeof bodyId === "string" && bodyId.trim()) return bodyId.trim();
  return "unknown";
}

function collectChangedFieldNames(
  model: z.infer<typeof ModelPatchSchema>,
  pricing: z.infer<typeof PricingPatchSchema>
): string[] {
  return [...Object.keys(model), ...Object.keys(pricing)];
}

function resolveModelAuditAction(
  body: Record<string, unknown>,
  modelPatch: z.infer<typeof ModelPatchSchema>
): "models.update" | "models.restore" {
  if (body.action === "restore") return "models.restore";
  if (modelPatch.enabled === true && modelPatch.visible === true) {
    return "models.restore";
  }
  return "models.update";
}

async function auditAdminModelWrite(
  ctx: AdminModelWriteContext,
  args: {
    action: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    resultPayload: Record<string, unknown>;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: ADMIN_MODEL_RESOURCE_TYPE,
    resourceId: args.resourceId,
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: args.resultPayload,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

const ModelPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    display_name: z.string().trim().min(1).max(120).optional(),
    provider: z.string().trim().max(64).optional(),
    model_type: z.enum(["chat", "image", "video", "other"]).optional(),
    sort_order: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

const PricingPatchSchema = z
  .object({
    billing_mode: z.enum(["token", "per_image"]).optional(),
    input_per_1k: z.number().min(0).max(PER_1K_MAX).optional(),
    output_per_1k: z.number().min(0).max(PER_1K_MAX).optional(),
    billable: z.boolean().optional(),
    markup_multiplier: z.number().min(0).max(MARKUP_MULTIPLIER_MAX).optional(),
  })
  .strict();

const CreateModelSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(MODEL_ID_PATTERN, "invalid_model_id"),
    display_name: z.string().trim().min(1).max(120),
    provider: z.string().trim().max(64).optional(),
    model_type: z.enum(["chat", "image", "video", "other"]),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(100_000).optional(),
    billing_mode: z.enum(["token", "per_image"]),
    input_per_1k: z.number().min(0).max(PER_1K_MAX).optional(),
    output_per_1k: z.number().min(0).max(PER_1K_MAX).optional(),
    billable: z.boolean().optional(),
    markup_multiplier: z.number().min(0).max(MARKUP_MULTIPLIER_MAX).optional(),
  })
  .strict();

const MODEL_LIST_SELECT = `
  id,
  display_name,
  provider,
  model_type,
  enabled,
  visible,
  sort_order,
  updated_at,
  model_pricing (
    billing_mode,
    input_per_1k,
    output_per_1k,
    billable,
    markup_multiplier,
    updated_at
  )
`;

export function deriveAdminModelStatus(
  enabled: boolean | null | undefined,
  visible: boolean | null | undefined
): AdminModelStatus {
  const isEnabled = Boolean(enabled);
  const isVisible = Boolean(visible);

  if (isEnabled && isVisible) return "available";
  if (!isEnabled && isVisible) return "coming_soon";
  if (isEnabled && !isVisible) return "disabled";
  return "archived";
}

function toNumberOrNull(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIntOrNull(value: number | string | null | undefined): number | null {
  const n = toNumberOrNull(value);
  return n === null ? null : Math.trunc(n);
}

function pickPricingRow(
  pricing: ModelDbRow["model_pricing"]
): ModelPricingDbRow | null {
  if (!pricing) return null;
  if (Array.isArray(pricing)) return pricing[0] ?? null;
  return pricing;
}

function resolveUpdatedAt(
  modelUpdatedAt: string | null | undefined,
  pricingUpdatedAt: string | null | undefined
): string | null {
  if (!modelUpdatedAt && !pricingUpdatedAt) return null;
  if (!modelUpdatedAt) return pricingUpdatedAt ?? null;
  if (!pricingUpdatedAt) return modelUpdatedAt;
  return Date.parse(modelUpdatedAt) >= Date.parse(pricingUpdatedAt)
    ? modelUpdatedAt
    : pricingUpdatedAt;
}

export function flattenAdminModelRow(row: ModelDbRow): AdminModelListItem {
  const pricing = pickPricingRow(row.model_pricing);

  return {
    id: row.id,
    display_name: row.display_name,
    provider: row.provider,
    model_type: row.model_type,
    enabled: row.enabled,
    visible: row.visible,
    status: deriveAdminModelStatus(row.enabled, row.visible),
    sort_order: toIntOrNull(row.sort_order),
    billing_mode: pricing?.billing_mode ?? null,
    input_per_1k: toNumberOrNull(pricing?.input_per_1k),
    output_per_1k: toNumberOrNull(pricing?.output_per_1k),
    billable: pricing?.billable ?? null,
    markup_multiplier: toNumberOrNull(pricing?.markup_multiplier),
    updated_at: resolveUpdatedAt(row.updated_at, pricing?.updated_at),
  };
}

export async function listAdminModels(): Promise<AdminModelListItem[]> {
  const { data, error } = await supabase()
    .from("models")
    .select(MODEL_LIST_SELECT)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw ApiError.internal(
      `Failed to list models: ${error.message}`,
      "admin_models_list_failed"
    );
  }

  return ((data ?? []) as ModelDbRow[]).map(flattenAdminModelRow);
}

export async function getAdminModelById(
  id: string
): Promise<AdminModelListItem | null> {
  const { data, error } = await supabase()
    .from("models")
    .select(MODEL_LIST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load model: ${error.message}`,
      "admin_model_load_failed"
    );
  }

  if (!data) return null;
  return flattenAdminModelRow(data as ModelDbRow);
}

async function countModelUsageLogs(modelId: string): Promise<number> {
  const { count, error } = await supabase()
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("model", modelId);

  if (error) {
    throw ApiError.internal(
      `Failed to count model usage: ${error.message}`,
      "admin_model_usage_count_failed"
    );
  }

  return count ?? 0;
}

function partitionPatchBody(body: Record<string, unknown>):
  | {
      ok: true;
      model: z.infer<typeof ModelPatchSchema>;
      pricing: z.infer<typeof PricingPatchSchema>;
    }
  | { ok: false; error: string; detail?: unknown } {
  const modelBody: Record<string, unknown> = {};
  const pricingBody: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (key === "action") continue;
    if ((MODEL_PATCH_FIELDS as readonly string[]).includes(key)) {
      modelBody[key] = value;
      continue;
    }
    if ((PRICING_PATCH_FIELDS as readonly string[]).includes(key)) {
      pricingBody[key] = value;
      continue;
    }
    return { ok: false, error: "unknown_field", detail: { field: key } };
  }

  const modelParsed = ModelPatchSchema.safeParse(modelBody);
  if (!modelParsed.success) {
    return {
      ok: false,
      error: "invalid_model_fields",
      detail: modelParsed.error.flatten(),
    };
  }

  const pricingParsed = PricingPatchSchema.safeParse(pricingBody);
  if (!pricingParsed.success) {
    return {
      ok: false,
      error: "invalid_pricing_value",
      detail: pricingParsed.error.flatten(),
    };
  }

  if (
    Object.keys(modelParsed.data).length === 0 &&
    Object.keys(pricingParsed.data).length === 0
  ) {
    return { ok: false, error: "empty_patch" };
  }

  return {
    ok: true,
    model: modelParsed.data,
    pricing: pricingParsed.data,
  };
}

async function applyModelPatch(
  id: string,
  model: z.infer<typeof ModelPatchSchema>,
  pricing: z.infer<typeof PricingPatchSchema>
): Promise<void> {
  const now = new Date().toISOString();

  if (Object.keys(model).length > 0) {
    const { error: modelError } = await supabase()
      .from("models")
      .update({ ...model, updated_at: now })
      .eq("id", id);

    if (modelError) {
      throw ApiError.internal(
        `Failed to update model: ${modelError.message}`,
        "admin_model_update_failed"
      );
    }
  }

  if (Object.keys(pricing).length > 0) {
    const { error: pricingError } = await supabase()
      .from("model_pricing")
      .upsert(
        {
          model_id: id,
          ...pricing,
          updated_at: now,
        },
        { onConflict: "model_id" }
      );

    if (pricingError) {
      throw ApiError.internal(
        `Failed to upsert model pricing: ${pricingError.message}`,
        "admin_model_pricing_upsert_failed"
      );
    }
  }
}

export async function createAdminModel(
  body: Record<string, unknown>,
  ctx: AdminModelWriteContext
): Promise<
  | { ok: true; model: AdminModelListItem }
  | { ok: false; status: 400 | 409; error: string; detail?: unknown }
> {
  const parsed = CreateModelSchema.safeParse(body);
  if (!parsed.success) {
    await auditAdminModelWrite(ctx, {
      action: "models.create",
      resourceId: resolveModelResourceId(undefined, body),
      requestPayload: body,
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: resolveModelResourceId(undefined, body),
        error: "invalid_model_fields",
      },
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_model_fields",
      detail: parsed.error.flatten(),
    };
  }

  const input = parsed.data;
  const {
    id,
    billing_mode,
    input_per_1k,
    output_per_1k,
    billable,
    markup_multiplier,
    ...modelFields
  } = input;

  const { data: existing, error: existingError } = await supabase()
    .from("models")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to verify model id: ${existingError.message}`,
      "admin_model_verify_failed"
    );
  }

  if (existing) {
    await auditAdminModelWrite(ctx, {
      action: "models.create",
      resourceId: id,
      requestPayload: input,
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: "model_already_exists",
      },
    });
    return { ok: false, status: 409, error: "model_already_exists" };
  }

  const now = new Date().toISOString();
  const enabled = modelFields.enabled ?? false;
  const visible = modelFields.visible ?? false;

  const { error: insertError } = await supabase().from("models").insert({
    id,
    display_name: modelFields.display_name,
    provider: modelFields.provider ?? "tokfai",
    model_type: modelFields.model_type,
    enabled,
    visible,
    sort_order: modelFields.sort_order ?? 1000,
    owned_by: "tokfai",
    updated_at: now,
  });

  if (insertError) {
    throw ApiError.internal(
      `Failed to create model: ${insertError.message}`,
      "admin_model_create_failed"
    );
  }

  const { error: pricingError } = await supabase().from("model_pricing").insert({
    model_id: id,
    billing_mode,
    input_per_1k: input_per_1k ?? (billing_mode === "per_image" ? 0.001 : 0),
    output_per_1k: output_per_1k ?? 0,
    billable: billable ?? false,
    markup_multiplier: markup_multiplier ?? 1,
    updated_at: now,
  });

  if (pricingError) {
    await supabase().from("models").delete().eq("id", id);
    throw ApiError.internal(
      `Failed to create model pricing: ${pricingError.message}`,
      "admin_model_pricing_create_failed"
    );
  }

  const model = await getAdminModelById(id);
  if (!model) {
    throw ApiError.internal("Created model could not be loaded.", "admin_model_load_failed");
  }

  await auditAdminModelWrite(ctx, {
    action: "models.create",
    resourceId: id,
    requestPayload: input,
    status: "succeeded",
    resultPayload: {
      ok: true,
      model_id: id,
      status: model.status,
      changed_fields: Object.keys(input),
    },
  });

  return { ok: true, model };
}

export async function updateAdminModel(
  id: string,
  body: Record<string, unknown>,
  ctx: AdminModelWriteContext
): Promise<
  | { ok: true; model: AdminModelListItem; action: "models.update" | "models.restore" }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const parsed = partitionPatchBody(body);
  const auditAction = resolveModelAuditAction(body, parsed.ok ? parsed.model : {});

  if (!parsed.ok) {
    await auditAdminModelWrite(ctx, {
      action: auditAction,
      resourceId: id,
      requestPayload: body,
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: parsed.error,
      },
    });
    return {
      ok: false,
      status: 400,
      error: parsed.error,
      detail: parsed.detail,
    };
  }

  const existing = await getAdminModelById(id);
  if (!existing) {
    await auditAdminModelWrite(ctx, {
      action: auditAction,
      resourceId: id,
      requestPayload: body,
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: "model_not_found",
      },
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  const action = resolveModelAuditAction(body, parsed.model);
  const changedFields = collectChangedFieldNames(parsed.model, parsed.pricing);

  await applyModelPatch(id, parsed.model, parsed.pricing);

  const model = await getAdminModelById(id);
  if (!model) {
    await auditAdminModelWrite(ctx, {
      action,
      resourceId: id,
      requestPayload: body,
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: "model_not_found",
        changed_fields: changedFields,
      },
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  await auditAdminModelWrite(ctx, {
    action,
    resourceId: id,
    requestPayload: body,
    status: "succeeded",
    resultPayload: {
      ok: true,
      model_id: id,
      status: model.status,
      changed_fields: changedFields,
    },
  });

  return { ok: true, model, action };
}

/** @deprecated Use updateAdminModel — kept for internal importers. */
export async function patchAdminModel(
  id: string,
  body: Record<string, unknown>
): Promise<
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const parsed = partitionPatchBody(body);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.error,
      detail: parsed.detail,
    };
  }

  const { data: existing, error: existingError } = await supabase()
    .from("models")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to verify model: ${existingError.message}`,
      "admin_model_verify_failed"
    );
  }

  if (!existing) {
    return { ok: false, status: 404, error: "model_not_found" };
  }

  await applyModelPatch(id, parsed.model, parsed.pricing);
  return { ok: true };
}

export async function archiveAdminModel(
  id: string,
  ctx: AdminModelWriteContext
): Promise<
  | { ok: true; model: AdminModelListItem; usage_log_count: number }
  | { ok: false; status: 404; error: string }
> {
  const existing = await getAdminModelById(id);
  if (!existing) {
    await auditAdminModelWrite(ctx, {
      action: "models.archive",
      resourceId: id,
      requestPayload: { soft_delete: true },
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: "model_not_found",
      },
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  const usageLogCount = await countModelUsageLogs(id);
  const changedFields = ["enabled", "visible"];

  await applyModelPatch(
    id,
    { enabled: false, visible: false },
    {}
  );

  const model = await getAdminModelById(id);
  if (!model) {
    await auditAdminModelWrite(ctx, {
      action: "models.archive",
      resourceId: id,
      requestPayload: { soft_delete: true },
      status: "failed",
      resultPayload: {
        ok: false,
        model_id: id,
        error: "model_not_found",
        changed_fields: changedFields,
        usage_log_count: usageLogCount,
      },
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  await auditAdminModelWrite(ctx, {
    action: "models.archive",
    resourceId: id,
    requestPayload: { soft_delete: true },
    status: "succeeded",
    resultPayload: {
      ok: true,
      model_id: id,
      status: model.status,
      changed_fields: changedFields,
      usage_log_count: usageLogCount,
      archived: true,
    },
  });

  return { ok: true, model, usage_log_count: usageLogCount };
}

export async function restoreAdminModel(
  id: string,
  ctx: AdminModelWriteContext
): Promise<
  | { ok: true; model: AdminModelListItem }
  | { ok: false; status: 400 | 404; error: string }
> {
  const requestPayload = { enabled: true, visible: true, action: "restore" };
  const result = await updateAdminModel(id, requestPayload, ctx);

  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }

  return { ok: true, model: result.model };
}
