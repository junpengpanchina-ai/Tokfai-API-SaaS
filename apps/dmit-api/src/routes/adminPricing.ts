import { listAdminModels } from "./adminModels.js";

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
