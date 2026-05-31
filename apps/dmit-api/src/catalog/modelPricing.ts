import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import { getModelConfig } from "../upstream/modelCatalog.js";
import { priceFor } from "../upstream/pricing.js";

export type ModelBillingType = "chat" | "image";

/** Active retail pricing row from public.model_pricing (P7.10 shape). */
export type ModelPricingConfig = {
  modelId: string;
  billingType: ModelBillingType;
  inputCreditsPerMillionTokens: number;
  outputCreditsPerMillionTokens: number;
  imageCreditsPerGeneration: number;
  markupRatio: number;
  enabled: boolean;
  visible: boolean;
};

type ModelPricingRow = {
  model_id: string;
  billing_type: string | null;
  input_credits_per_million_tokens: number | string | null;
  output_credits_per_million_tokens: number | string | null;
  image_credits_per_generation: number | string | null;
  markup_ratio: number | string | null;
  enabled: boolean | null;
  visible: boolean | null;
  billing_mode?: string | null;
  input_per_1k?: number | string | null;
  output_per_1k?: number | string | null;
  billable?: boolean | null;
  markup_multiplier?: number | string | null;
};

/** Static per-image credit pricing fallback when DB has no enabled row. */
const DEFAULT_IMAGE_MODEL_CREDITS: Record<string, number> = {
  "nano-banana": 1,
  "nano-banana-fast": 1,
  "nano-banana-pro": 5,
  "nano-banana-2": 3,
  "gpt-image-2": 2,
};

export const DEFAULT_IMAGE_MODEL_ALLOWLIST = new Set(
  Object.keys(DEFAULT_IMAGE_MODEL_CREDITS)
);

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveMarkupRatio(row: ModelPricingRow): number {
  const ratio = toNumber(row.markup_ratio);
  if (ratio > 0) return ratio;
  const legacy = toNumber(row.markup_multiplier);
  return legacy > 0 ? legacy : 1;
}

function resolveBillingType(row: ModelPricingRow): ModelBillingType {
  if (row.billing_type === "image") return "image";
  if (row.billing_type === "chat") return "chat";
  if (row.billing_mode === "per_image") return "image";
  return "chat";
}

function resolveInputCreditsPerMillion(row: ModelPricingRow): number {
  const fromP710 = toNumber(row.input_credits_per_million_tokens);
  if (fromP710 > 0) return fromP710;
  const legacyPer1k = toNumber(row.input_per_1k);
  return legacyPer1k > 0 ? legacyPer1k * 1000 : 0;
}

function resolveOutputCreditsPerMillion(row: ModelPricingRow): number {
  const fromP710 = toNumber(row.output_credits_per_million_tokens);
  if (fromP710 > 0) return fromP710;
  const legacyPer1k = toNumber(row.output_per_1k);
  return legacyPer1k > 0 ? legacyPer1k * 1000 : 0;
}

function resolveImageCreditsPerGeneration(row: ModelPricingRow): number {
  const fromP710 = toNumber(row.image_credits_per_generation);
  if (fromP710 > 0) return fromP710;
  if (resolveBillingType(row) !== "image") return 0;
  const legacyBase = toNumber(row.input_per_1k);
  if (legacyBase <= 0) return 0;
  return legacyBase * resolveMarkupRatio(row);
}

function mapPricingRow(row: ModelPricingRow): ModelPricingConfig {
  return {
    modelId: row.model_id,
    billingType: resolveBillingType(row),
    inputCreditsPerMillionTokens: resolveInputCreditsPerMillion(row),
    outputCreditsPerMillionTokens: resolveOutputCreditsPerMillion(row),
    imageCreditsPerGeneration: resolveImageCreditsPerGeneration(row),
    markupRatio: resolveMarkupRatio(row),
    enabled: row.enabled === true || row.billable === true,
    visible: row.visible === true || row.billable === true,
  };
}

/**
 * Load enabled model_pricing for billing.
 * Returns null when no active DB row exists — callers should fall back to defaults.
 */
export async function getModelPricing(
  modelId: string
): Promise<ModelPricingConfig | null> {
  const { data, error } = await supabase()
    .from("model_pricing")
    .select(
      `
      model_id,
      billing_type,
      input_credits_per_million_tokens,
      output_credits_per_million_tokens,
      image_credits_per_generation,
      markup_ratio,
      enabled,
      visible,
      billing_mode,
      input_per_1k,
      output_per_1k,
      billable,
      markup_multiplier
    `
    )
    .eq("model_id", modelId)
    .maybeSingle();

  if (error) {
    log.warn("model_pricing_query_failed", {
      code: "model_pricing_query_failed",
      message: error.message,
      model: modelId,
    });
    return null;
  }

  if (!data) return null;

  const mapped = mapPricingRow(data as ModelPricingRow);
  if (!mapped.enabled) return null;
  return mapped;
}

export type PublicModelPricingItem = {
  model_id: string;
  display_name: string | null;
  model_type: string | null;
  billing_type: ModelBillingType;
  input_credits_per_million_tokens: number | null;
  output_credits_per_million_tokens: number | null;
  image_credits_per_generation: number | null;
  updated_at: string | null;
};

type PublicCatalogModelRow = {
  id: string;
  display_name: string | null;
  model_type: string | null;
  sort_order: number | string | null;
  model_pricing:
    | PublicPricingJoinRow
    | PublicPricingJoinRow[]
    | null
    | undefined;
};

type PublicPricingJoinRow = ModelPricingRow & {
  updated_at: string | null;
};

function pickJoinPricing(
  pricing: PublicCatalogModelRow["model_pricing"]
): PublicPricingJoinRow | null {
  if (!pricing) return null;
  if (Array.isArray(pricing)) return pricing[0] ?? null;
  return pricing;
}

/** Visible catalog pricing for dashboard (no upstream fields). */
export async function listPublicModelPricing(): Promise<PublicModelPricingItem[]> {
  const { data, error } = await supabase()
    .from("models")
    .select(
      `
      id,
      display_name,
      model_type,
      sort_order,
      model_pricing (
        model_id,
        billing_type,
        input_credits_per_million_tokens,
        output_credits_per_million_tokens,
        image_credits_per_generation,
        markup_ratio,
        enabled,
        visible,
        updated_at,
        billing_mode,
        input_per_1k,
        output_per_1k,
        billable,
        markup_multiplier
      )
    `
    )
    .eq("enabled", true)
    .eq("visible", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    log.warn("public_model_pricing_list_failed", {
      code: "public_model_pricing_list_failed",
      message: error.message,
    });
    return [];
  }

  const items: PublicModelPricingItem[] = [];

  for (const row of (data ?? []) as PublicCatalogModelRow[]) {
    const pricing = pickJoinPricing(row.model_pricing);
    if (!pricing) continue;
    if (!(pricing.enabled === true || pricing.billable === true)) continue;
    if (!(pricing.visible === true || pricing.billable === true)) continue;

    const billingType = resolveBillingType(pricing);

    items.push({
      model_id: row.id,
      display_name: row.display_name,
      model_type: row.model_type,
      billing_type: billingType,
      input_credits_per_million_tokens:
        billingType === "chat"
          ? resolveInputCreditsPerMillion(pricing)
          : null,
      output_credits_per_million_tokens:
        billingType === "chat"
          ? resolveOutputCreditsPerMillion(pricing)
          : null,
      image_credits_per_generation:
        billingType === "image"
          ? resolveImageCreditsPerGeneration(pricing)
          : null,
      updated_at: pricing.updated_at ?? null,
    });
  }

  return items;
}

export function priceChatCreditsFromConfig(
  config: ModelPricingConfig,
  inputTokens: number,
  outputTokens: number
): number {
  const markup = config.markupRatio > 0 ? config.markupRatio : 1;
  const base =
    (inputTokens / 1_000_000) * config.inputCreditsPerMillionTokens +
    (outputTokens / 1_000_000) * config.outputCreditsPerMillionTokens;
  return base * markup;
}

export function priceImageCreditsFromConfig(config: ModelPricingConfig): number {
  const markup = config.markupRatio > 0 ? config.markupRatio : 1;
  return config.imageCreditsPerGeneration * markup;
}

/** Chat token credits — DB model_pricing first, then pricing.ts fallback. */
export async function priceCreditsFor(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const fromDb = await getModelPricing(model);
  if (fromDb?.billingType === "chat") {
    return priceChatCreditsFromConfig(fromDb, inputTokens, outputTokens);
  }
  return priceFor(model, inputTokens, outputTokens);
}

/** Fixed per-image credit cost — DB pricing first, then static catalog. */
export async function priceCreditsForImage(model: string): Promise<number> {
  const fromDb = await getModelPricing(model);
  if (fromDb?.billingType === "image") {
    return priceImageCreditsFromConfig(fromDb);
  }
  return DEFAULT_IMAGE_MODEL_CREDITS[model] ?? 0;
}

export async function isModelAllowedForChat(model: string): Promise<boolean> {
  const fromDb = await isModelAllowedFromDb(model, "chat");
  if (fromDb !== null) return fromDb;

  const config = getModelConfig(model);
  return Boolean(config?.enabled && config.kind === "chat");
}

export async function isModelAllowedForImage(model: string): Promise<boolean> {
  const fromDb = await isModelAllowedFromDb(model, "image");
  if (fromDb !== null) return fromDb;

  const config = getModelConfig(model);
  return Boolean(
    config?.enabled &&
      config.kind === "image" &&
      DEFAULT_IMAGE_MODEL_ALLOWLIST.has(model)
  );
}

async function isModelAllowedFromDb(
  model: string,
  billingType: ModelBillingType
): Promise<boolean | null> {
  const [modelResult, pricingResult] = await Promise.all([
    supabase()
      .from("models")
      .select("enabled, model_type")
      .eq("id", model)
      .maybeSingle(),
    supabase()
      .from("model_pricing")
      .select("enabled, visible, billing_type, billing_mode, billable")
      .eq("model_id", model)
      .maybeSingle(),
  ]);

  if (modelResult.error || pricingResult.error) {
    log.warn("model_allowlist_query_failed", {
      code: "model_allowlist_query_failed",
      message: modelResult.error?.message ?? pricingResult.error?.message,
      model,
    });
    return null;
  }

  if (!modelResult.data || !pricingResult.data) return null;

  const pricing = pricingResult.data as {
    enabled: boolean | null;
    visible: boolean | null;
    billing_type: string | null;
    billing_mode: string | null;
    billable: boolean | null;
  };

  const pricingEnabled = pricing.enabled === true || pricing.billable === true;
  const resolvedType =
    pricing.billing_type === "image" || pricing.billing_mode === "per_image"
      ? "image"
      : "chat";

  if (billingType === "image") {
    const modelType = modelResult.data.model_type;
    return (
      modelResult.data.enabled === true &&
      pricingEnabled &&
      (modelType === "image" || resolvedType === "image")
    );
  }

  return modelResult.data.enabled === true && pricingEnabled;
}

export type OpenAiModelListItem = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

type ModelRow = {
  id: string;
  created?: number | string | null;
  created_at?: string | null;
  owned_by?: string | null;
};

const DEFAULT_OWNED_BY = "tokfai";

/** Visible catalog for GET /v1/models — DB first, then pricing.ts fallback. */
export async function listCatalogModels(): Promise<OpenAiModelListItem[]> {
  const fromDb = await listCatalogModelsFromDb();
  if (fromDb !== null) return fromDb;

  const { listAllowedModels } = await import("../upstream/pricing.js");
  const now = Math.floor(Date.now() / 1000);
  return listAllowedModels().map((id) => ({
    id,
    object: "model" as const,
    created: now,
    owned_by: DEFAULT_OWNED_BY,
  }));
}

async function listCatalogModelsFromDb(): Promise<OpenAiModelListItem[] | null> {
  const { data, error } = await supabase()
    .from("models")
    .select("id, created, created_at, owned_by")
    .eq("enabled", true)
    .eq("visible", true)
    .order("sort_order", { ascending: true });

  if (error) {
    log.warn("models_catalog_query_failed", {
      code: "models_catalog_query_failed",
      message: error.message,
    });
    return null;
  }

  if (!data?.length) return null;

  return data.map((row) => toOpenAiModelListItem(row as ModelRow));
}

function toOpenAiModelListItem(row: ModelRow): OpenAiModelListItem {
  return {
    id: row.id,
    object: "model",
    created: resolveCreatedUnix(row),
    owned_by:
      typeof row.owned_by === "string" && row.owned_by.length > 0
        ? row.owned_by
        : DEFAULT_OWNED_BY,
  };
}

function resolveCreatedUnix(row: ModelRow): number {
  if (typeof row.created === "number" && Number.isFinite(row.created)) {
    return Math.trunc(row.created);
  }
  if (typeof row.created === "string" && row.created.trim() !== "") {
    const parsed = Number(row.created);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  if (typeof row.created_at === "string" && row.created_at.length > 0) {
    const ms = Date.parse(row.created_at);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return Math.floor(Date.now() / 1000);
}
