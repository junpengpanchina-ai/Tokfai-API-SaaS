import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import { getModelConfig } from "../upstream/modelCatalog.js";
import {
  isAllowedModel,
  listAllowedModels,
  priceFor,
} from "../upstream/pricing.js";

export interface OpenAiModelListItem {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

type ModelRow = {
  id: string;
  created?: number | string | null;
  created_at?: string | null;
  owned_by?: string | null;
};

type ModelPricingRow = {
  input_per_1k: number | string;
  output_per_1k: number | string;
  markup_multiplier: number | string;
};

const DEFAULT_OWNED_BY = "tokfai";

/** Visible catalog for GET /v1/models — DB first, then pricing.ts fallback. */
export async function listCatalogModels(): Promise<OpenAiModelListItem[]> {
  const fromDb = await listCatalogModelsFromDb();
  if (fromDb !== null) return fromDb;

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

/**
 * Whether the model may be used for chat completions.
 * DB row wins when present; query errors / missing rows fall back to pricing.ts.
 */
export async function isModelAllowedForChat(model: string): Promise<boolean> {
  const fromDb = await isModelAllowedFromDb(model);
  if (fromDb !== null) return fromDb;
  return isAllowedModel(model);
}

async function isModelAllowedFromDb(model: string): Promise<boolean | null> {
  const [modelResult, pricingResult] = await Promise.all([
    supabase().from("models").select("enabled").eq("id", model).maybeSingle(),
    supabase()
      .from("model_pricing")
      .select("billable")
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

  return (
    modelResult.data.enabled === true && pricingResult.data.billable === true
  );
}

/**
 * USD credits for token usage — DB model_pricing first, then pricing.ts fallback.
 */
export async function priceCreditsFor(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const fromDb = await priceCreditsFromDb(model, inputTokens, outputTokens);
  if (fromDb !== null) return fromDb;
  return priceFor(model, inputTokens, outputTokens);
}

async function priceCreditsFromDb(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number | null> {
  const { data, error } = await supabase()
    .from("model_pricing")
    .select("input_per_1k, output_per_1k, markup_multiplier")
    .eq("model_id", model)
    .eq("billable", true)
    .eq("billing_mode", "token")
    .maybeSingle();

  if (error) {
    log.warn("model_pricing_query_failed", {
      code: "model_pricing_query_failed",
      message: error.message,
      model,
    });
    return null;
  }

  if (!data) return null;

  const row = data as ModelPricingRow;
  const inputPer1k = toNumber(row.input_per_1k);
  const outputPer1k = toNumber(row.output_per_1k);
  const markup = toNumber(row.markup_multiplier);
  const multiplier = markup > 0 ? markup : 1;

  const base =
    (inputTokens / 1000) * inputPer1k + (outputTokens / 1000) * outputPer1k;
  return base * multiplier;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Static per-image credit pricing (placeholder — admin can tune later). */
const IMAGE_MODEL_CREDITS: Record<string, number> = {
  "nano-banana": 1,
  "nano-banana-fast": 1,
  "nano-banana-pro": 5,
  "nano-banana-2": 3,
  "gpt-image-2": 2,
};

const IMAGE_MODEL_ALLOWLIST = new Set(Object.keys(IMAGE_MODEL_CREDITS));

/**
 * Whether the model may be used for image generation.
 * DB row wins when present; query errors / missing rows fall back to static catalog.
 */
export async function isModelAllowedForImage(model: string): Promise<boolean> {
  const fromDb = await isModelAllowedForImageFromDb(model);
  if (fromDb !== null) return fromDb;

  const config = getModelConfig(model);
  return Boolean(
    config?.enabled &&
      config.kind === "image" &&
      IMAGE_MODEL_ALLOWLIST.has(model)
  );
}

async function isModelAllowedForImageFromDb(
  model: string
): Promise<boolean | null> {
  const [modelResult, pricingResult] = await Promise.all([
    supabase()
      .from("models")
      .select("enabled, model_type")
      .eq("id", model)
      .maybeSingle(),
    supabase()
      .from("model_pricing")
      .select("billable, billing_mode")
      .eq("model_id", model)
      .maybeSingle(),
  ]);

  if (modelResult.error || pricingResult.error) {
    log.warn("image_model_allowlist_query_failed", {
      code: "image_model_allowlist_query_failed",
      message: modelResult.error?.message ?? pricingResult.error?.message,
      model,
    });
    return null;
  }

  if (!modelResult.data || !pricingResult.data) return null;

  const modelType = modelResult.data.model_type;
  const billingMode = pricingResult.data.billing_mode;

  return (
    modelResult.data.enabled === true &&
    pricingResult.data.billable === true &&
    (modelType === "image" || billingMode === "per_image")
  );
}

/** Fixed per-image credit cost — DB per_image pricing first, then static catalog. */
export async function priceCreditsForImage(model: string): Promise<number> {
  const fromDb = await priceCreditsForImageFromDb(model);
  if (fromDb !== null) return fromDb;

  return IMAGE_MODEL_CREDITS[model] ?? 0;
}

async function priceCreditsForImageFromDb(
  model: string
): Promise<number | null> {
  const { data, error } = await supabase()
    .from("model_pricing")
    .select("input_per_1k, markup_multiplier")
    .eq("model_id", model)
    .eq("billable", true)
    .eq("billing_mode", "per_image")
    .maybeSingle();

  if (error) {
    log.warn("image_model_pricing_query_failed", {
      code: "image_model_pricing_query_failed",
      message: error.message,
      model,
    });
    return null;
  }

  if (!data) return null;

  const row = data as Pick<ModelPricingRow, "input_per_1k" | "markup_multiplier">;
  const base = toNumber(row.input_per_1k);
  const markup = toNumber(row.markup_multiplier);
  const multiplier = markup > 0 ? markup : 1;
  return base * multiplier;
}
