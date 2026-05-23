import { z } from "zod";

import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";

const MODEL_PATCH_FIELDS = ["enabled", "visible"] as const;

const PRICING_PATCH_FIELDS = [
  "input_per_1k",
  "output_per_1k",
  "billable",
  "markup_multiplier",
] as const;

const ModelPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
  })
  .strict();

const PricingPatchSchema = z
  .object({
    input_per_1k: z.number().nonnegative().optional(),
    output_per_1k: z.number().nonnegative().optional(),
    billable: z.boolean().optional(),
    markup_multiplier: z.number().positive().optional(),
  })
  .strict();

export type AdminModelListItem = {
  id: string;
  display_name: string | null;
  provider: string | null;
  model_type: string | null;
  enabled: boolean | null;
  visible: boolean | null;
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
      error: "invalid_pricing_fields",
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

  const now = new Date().toISOString();

  if (Object.keys(parsed.model).length > 0) {
    const { error: modelError } = await supabase()
      .from("models")
      .update({ ...parsed.model, updated_at: now })
      .eq("id", id);

    if (modelError) {
      throw ApiError.internal(
        `Failed to update model: ${modelError.message}`,
        "admin_model_update_failed"
      );
    }
  }

  if (Object.keys(parsed.pricing).length > 0) {
    const { error: pricingError } = await supabase()
      .from("model_pricing")
      .upsert(
        {
          model_id: id,
          ...parsed.pricing,
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

  return { ok: true };
}
