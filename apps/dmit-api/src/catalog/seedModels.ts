import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

export type CatalogSeedStatus = "available" | "coming_soon";

export type CatalogSeedEntry = {
  id: string;
  display_name: string;
  model_type: "chat" | "image" | "video" | "other";
  status: CatalogSeedStatus;
  sort_order: number;
  billing_type: "chat" | "image";
  input_credits_per_million_tokens: number;
  output_credits_per_million_tokens: number;
  image_credits_per_generation: number;
};

/**
 * Static frontend catalog mirror — source of truth for sync/seed.
 * Image credits match apps/web/lib/model-catalog.ts (GRSAI 1:1).
 * Chat credits follow docs/PRICING_STRATEGY.md suggested per-1M values.
 */
export const CATALOG_SEED_ENTRIES: CatalogSeedEntry[] = [
  {
    id: "gemini-3.1-pro",
    display_name: "Gemini 3.1 Pro",
    model_type: "chat",
    status: "available",
    sort_order: 100,
    billing_type: "chat",
    input_credits_per_million_tokens: 225,
    output_credits_per_million_tokens: 1050,
    image_credits_per_generation: 0,
  },
  {
    id: "gemini-3-pro",
    display_name: "Gemini 3 Pro",
    model_type: "chat",
    status: "available",
    sort_order: 110,
    billing_type: "chat",
    input_credits_per_million_tokens: 225,
    output_credits_per_million_tokens: 1050,
    image_credits_per_generation: 0,
  },
  {
    id: "gemini-3-flash",
    display_name: "Gemini 3 Flash",
    model_type: "chat",
    status: "available",
    sort_order: 120,
    billing_type: "chat",
    input_credits_per_million_tokens: 60,
    output_credits_per_million_tokens: 450,
    image_credits_per_generation: 0,
  },
  {
    id: "gemini-3.5-flash",
    display_name: "Gemini 3.5 Flash",
    model_type: "chat",
    status: "available",
    sort_order: 130,
    billing_type: "chat",
    input_credits_per_million_tokens: 120,
    output_credits_per_million_tokens: 1000,
    image_credits_per_generation: 0,
  },
  {
    id: "gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    model_type: "chat",
    status: "available",
    sort_order: 140,
    billing_type: "chat",
    input_credits_per_million_tokens: 45,
    output_credits_per_million_tokens: 300,
    image_credits_per_generation: 0,
  },
  {
    id: "gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    model_type: "chat",
    status: "available",
    sort_order: 150,
    billing_type: "chat",
    input_credits_per_million_tokens: 125,
    output_credits_per_million_tokens: 625,
    image_credits_per_generation: 0,
  },
  {
    id: "gpt-5.4",
    display_name: "GPT 5.4",
    model_type: "chat",
    status: "available",
    sort_order: 160,
    billing_type: "chat",
    input_credits_per_million_tokens: 105,
    output_credits_per_million_tokens: 900,
    image_credits_per_generation: 0,
  },
  {
    id: "gpt-5.5",
    display_name: "GPT 5.5",
    model_type: "chat",
    status: "available",
    sort_order: 170,
    billing_type: "chat",
    input_credits_per_million_tokens: 330,
    output_credits_per_million_tokens: 2030,
    image_credits_per_generation: 0,
  },
  {
    id: "gpt-image-2",
    display_name: "GPT Image 2",
    model_type: "image",
    status: "available",
    sort_order: 200,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 600,
  },
  {
    id: "gpt-image-2-vip",
    display_name: "GPT Image 2 VIP",
    model_type: "image",
    status: "coming_soon",
    sort_order: 210,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1300,
  },
  {
    id: "nano-banana-fast",
    display_name: "Nano Banana Fast",
    model_type: "image",
    status: "available",
    sort_order: 220,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 440,
  },
  {
    id: "nano-banana",
    display_name: "Nano Banana",
    model_type: "image",
    status: "available",
    sort_order: 230,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1400,
  },
  {
    id: "nano-banana-pro",
    display_name: "Nano Banana Pro",
    model_type: "image",
    status: "available",
    sort_order: 240,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1800,
  },
  {
    id: "nano-banana-2",
    display_name: "Nano Banana 2",
    model_type: "image",
    status: "available",
    sort_order: 250,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1200,
  },
  {
    id: "nano-banana-pro-vt",
    display_name: "Nano Banana Pro VT",
    model_type: "image",
    status: "available",
    sort_order: 260,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1800,
  },
  {
    id: "nano-banana-2-cl",
    display_name: "Nano Banana 2 CL",
    model_type: "image",
    status: "available",
    sort_order: 270,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 1600,
  },
  {
    id: "nano-banana-2-4k-cl",
    display_name: "Nano Banana 2 4K CL",
    model_type: "image",
    status: "available",
    sort_order: 280,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 3000,
  },
  {
    id: "nano-banana-pro-cl",
    display_name: "Nano Banana Pro CL",
    model_type: "image",
    status: "available",
    sort_order: 290,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 6000,
  },
  {
    id: "nano-banana-pro-vip",
    display_name: "Nano Banana Pro VIP",
    model_type: "image",
    status: "available",
    sort_order: 300,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 10000,
  },
  {
    id: "nano-banana-pro-4k-vip",
    display_name: "Nano Banana Pro 4K VIP",
    model_type: "image",
    status: "available",
    sort_order: 310,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 16000,
  },
  {
    id: "veo",
    display_name: "Veo",
    model_type: "video",
    status: "coming_soon",
    sort_order: 400,
    billing_type: "image",
    input_credits_per_million_tokens: 0,
    output_credits_per_million_tokens: 0,
    image_credits_per_generation: 0,
  },
];

export type SyncCatalogResult = {
  insertedModels: string[];
  insertedPricing: string[];
  skipped: string[];
};

function seedVisibility(status: CatalogSeedStatus): {
  enabled: boolean;
  visible: boolean;
  pricing_enabled: boolean;
  pricing_visible: boolean;
} {
  if (status === "available") {
    return {
      enabled: true,
      visible: true,
      pricing_enabled: true,
      pricing_visible: true,
    };
  }
  return {
    enabled: false,
    visible: true,
    pricing_enabled: false,
    pricing_visible: false,
  };
}

export async function syncCatalogModels(): Promise<SyncCatalogResult> {
  const insertedModels: string[] = [];
  const insertedPricing: string[] = [];
  const skipped: string[] = [];

  const { data: existingModels, error: modelsError } = await supabase()
    .from("models")
    .select("id");

  if (modelsError) {
    throw ApiError.internal(
      `Failed to list models for catalog sync: ${modelsError.message}`,
      "catalog_sync_models_list_failed"
    );
  }

  const { data: existingPricing, error: pricingError } = await supabase()
    .from("model_pricing")
    .select("model_id");

  if (pricingError) {
    throw ApiError.internal(
      `Failed to list pricing for catalog sync: ${pricingError.message}`,
      "catalog_sync_pricing_list_failed"
    );
  }

  const modelIds = new Set((existingModels ?? []).map((row) => row.id));
  const pricingIds = new Set(
    (existingPricing ?? []).map((row) => row.model_id as string)
  );
  const initialModelIds = new Set(modelIds);
  const initialPricingIds = new Set(pricingIds);

  const now = new Date().toISOString();

  for (const entry of CATALOG_SEED_ENTRIES) {
    const flags = seedVisibility(entry.status);
    let modelInserted = false;

    if (!modelIds.has(entry.id)) {
      const { error: insertModelError } = await supabase().from("models").insert({
        id: entry.id,
        display_name: entry.display_name,
        provider: "tokfai",
        model_type: entry.model_type,
        enabled: flags.enabled,
        visible: flags.visible,
        sort_order: entry.sort_order,
        owned_by: "tokfai",
        updated_at: now,
      });

      if (insertModelError) {
        throw ApiError.internal(
          `Failed to insert model ${entry.id}: ${insertModelError.message}`,
          "catalog_sync_model_insert_failed"
        );
      }

      modelIds.add(entry.id);
      insertedModels.push(entry.id);
      modelInserted = true;
    }

    if (!pricingIds.has(entry.id)) {
      if (!modelIds.has(entry.id)) {
        throw ApiError.internal(
          `Model ${entry.id} missing before pricing insert.`,
          "catalog_sync_model_missing"
        );
      }

      const { error: insertPricingError } = await supabase()
        .from("model_pricing")
        .insert({
          model_id: entry.id,
          billing_type: entry.billing_type,
          input_credits_per_million_tokens: entry.input_credits_per_million_tokens,
          output_credits_per_million_tokens: entry.output_credits_per_million_tokens,
          image_credits_per_generation: entry.image_credits_per_generation,
          markup_ratio: 1,
          enabled: flags.pricing_enabled,
          visible: flags.pricing_visible,
          updated_at: now,
        });

      if (insertPricingError) {
        if (modelInserted) {
          await supabase().from("models").delete().eq("id", entry.id);
        }
        throw ApiError.internal(
          `Failed to insert pricing for ${entry.id}: ${insertPricingError.message}`,
          "catalog_sync_pricing_insert_failed"
        );
      }

      pricingIds.add(entry.id);
      insertedPricing.push(entry.id);
    }

    if (initialModelIds.has(entry.id) && initialPricingIds.has(entry.id)) {
      skipped.push(entry.id);
    }
  }

  return { insertedModels, insertedPricing, skipped };
}

type SyncCatalogContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
};

export async function syncCatalogModelsAdmin(
  ctx: SyncCatalogContext
): Promise<SyncCatalogResult> {
  const result = await syncCatalogModels();

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "models.sync_catalog",
    resourceType: "models",
    resourceId: "catalog",
    requestPayload: {},
    status: "succeeded",
    resultPayload: {
      ok: true,
      inserted_models: result.insertedModels,
      inserted_pricing: result.insertedPricing,
      skipped: result.skipped,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
  });

  return result;
}
