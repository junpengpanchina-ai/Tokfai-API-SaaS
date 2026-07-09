import { listAdminModels, updateAdminModel } from "./adminModels.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";

export type AdminPricingRow = {
  model_id: string;
  display_name: string | null;
  provider: string | null;
  modality: string | null;
  input_price: number | null;
  output_price: number | null;
  image_price: number | null;
  credits_multiplier: number | null;
  minimum_charge: number | null;
  effective_status: "active" | "disabled" | "archived";
};

type AdminPricingWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
};

/** Read-only pricing view derived from models + model_pricing. */
export async function listAdminPricing(): Promise<AdminPricingRow[]> {
  const models = await listAdminModels();

  return models.map((model) => ({
    model_id: model.id,
    display_name: model.display_name,
    provider: model.provider,
    modality: model.model_type,
    input_price: model.input_credits_per_million_tokens,
    output_price: model.output_credits_per_million_tokens,
    image_price: model.image_credits_per_generation,
    credits_multiplier: model.markup_ratio,
    minimum_charge: null,
    effective_status:
      model.status === "archived"
        ? "archived"
        : model.enabled && model.pricing_enabled !== false
          ? "active"
          : "disabled",
  }));
}

const PRICING_FIELD_ALIASES: Record<string, string> = {
  input_price: "input_credits_per_million_tokens",
  output_price: "output_credits_per_million_tokens",
  image_price: "image_credits_per_generation",
  credits_multiplier: "markup_ratio",
  pricing_enabled: "pricing_enabled",
  pricing_visible: "pricing_visible",
  input_credits_per_million_tokens: "input_credits_per_million_tokens",
  output_credits_per_million_tokens: "output_credits_per_million_tokens",
  image_credits_per_generation: "image_credits_per_generation",
  markup_ratio: "markup_ratio",
  billing_type: "billing_type",
  upstream_cost_note: "upstream_cost_note",
  enabled: "pricing_enabled",
  visible: "pricing_visible",
  billing_mode: "billing_mode",
  input_per_1k: "input_per_1k",
  output_per_1k: "output_per_1k",
  billable: "billable",
  markup_multiplier: "markup_multiplier",
};

/**
 * Update model pricing fields via the existing models write path.
 * Accepts New API–style aliases (input_price / output_price / …).
 */
export async function updateAdminPricing(
  modelId: string,
  body: Record<string, unknown>,
  ctx: AdminPricingWriteContext
): Promise<
  | { ok: true; pricing: AdminPricingRow }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const id = modelId.trim();
  if (!id) {
    return { ok: false, status: 400, error: "missing_model_id" };
  }

  const modelPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "model_id" || key === "action") continue;
    const mapped = PRICING_FIELD_ALIASES[key];
    if (!mapped) {
      return {
        ok: false,
        status: 400,
        error: "unknown_field",
        detail: { field: key },
      };
    }
    modelPatch[mapped] = value;
  }

  if (Object.keys(modelPatch).length === 0) {
    return { ok: false, status: 400, error: "empty_patch" };
  }

  const result = await updateAdminModel(id, modelPatch, ctx);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.error,
      detail: result.detail,
    };
  }

  const pricing: AdminPricingRow = {
    model_id: result.model.id,
    display_name: result.model.display_name,
    provider: result.model.provider,
    modality: result.model.model_type,
    input_price: result.model.input_credits_per_million_tokens,
    output_price: result.model.output_credits_per_million_tokens,
    image_price: result.model.image_credits_per_generation,
    credits_multiplier: result.model.markup_ratio,
    minimum_charge: null,
    effective_status:
      result.model.status === "archived"
        ? "archived"
        : result.model.enabled && result.model.pricing_enabled !== false
          ? "active"
          : "disabled",
  };

  return { ok: true, pricing };
}
