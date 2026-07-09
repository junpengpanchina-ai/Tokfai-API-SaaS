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
  // New API–style aliases
  "priority",
  "status",
] as const;

const PRICING_PATCH_FIELDS = [
  "billing_type",
  "input_credits_per_million_tokens",
  "output_credits_per_million_tokens",
  "image_credits_per_generation",
  "upstream_cost_note",
  "markup_ratio",
  "enabled",
  "visible",
  // Legacy aliases accepted from older admin clients
  "billing_mode",
  "input_per_1k",
  "output_per_1k",
  "billable",
  "markup_multiplier",
] as const;

const CREDITS_PER_MILLION_MAX = 1_000_000;
const IMAGE_CREDITS_MAX = 1_000_000;
const MARKUP_RATIO_MAX = 20;
const UPSTREAM_NOTE_MAX = 500;
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
  billing_type: string | null;
  input_credits_per_million_tokens: number | null;
  output_credits_per_million_tokens: number | null;
  image_credits_per_generation: number | null;
  upstream_cost_note: string | null;
  markup_ratio: number | null;
  pricing_enabled: boolean | null;
  pricing_visible: boolean | null;
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
  billing_type: string | null;
  input_credits_per_million_tokens: number | string | null;
  output_credits_per_million_tokens: number | string | null;
  image_credits_per_generation: number | string | null;
  upstream_cost_note: string | null;
  markup_ratio: number | string | null;
  enabled: boolean | null;
  visible: boolean | null;
  billing_mode?: string | null;
  input_per_1k?: number | string | null;
  output_per_1k?: number | string | null;
  billable?: boolean | null;
  markup_multiplier?: number | string | null;
  updated_at: string | null;
};

type AdminModelWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
};

const ADMIN_MODEL_RESOURCE_TYPE = "models";
const ADMIN_PRICING_RESOURCE_TYPE = "model_pricing";

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
  model: Record<string, unknown>,
  pricing: Record<string, unknown>
): string[] {
  return [...Object.keys(model), ...Object.keys(pricing)];
}

function resolveModelAuditAction(
  body: Record<string, unknown>,
  modelPatch: { enabled?: boolean; visible?: boolean }
): "models.update" | "models.restore" {
  if (body.action === "restore") return "models.restore";
  if (modelPatch.enabled === true && modelPatch.visible === true) {
    return "models.restore";
  }
  return "models.update";
}

function resolveArchiveAuditAction(
  usageLogCount: number
): "models.archive" | "models.delete_attempt" {
  return usageLogCount > 0 ? "models.delete_attempt" : "models.archive";
}

function buildModelAuditResultPayload(args: {
  ok: boolean;
  action: string;
  modelId: string;
  modelStatus?: AdminModelStatus | null;
  changedFields?: string[];
  error?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ok: args.ok,
    model_id: args.modelId,
    action: args.action,
    status: args.modelStatus ?? null,
    changed_fields: args.changedFields ?? [],
    error: args.error ?? null,
    ...(args.extra ?? {}),
  };
}

async function auditAdminModelWrite(
  ctx: AdminModelWriteContext,
  args: {
    action: string;
    resourceType?: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    modelId: string;
    modelStatus?: AdminModelStatus | null;
    changedFields?: string[];
    error?: string | null;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: args.resourceType ?? ADMIN_MODEL_RESOURCE_TYPE,
    resourceId: args.resourceId,
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: buildModelAuditResultPayload({
      ok: args.status === "succeeded",
      action: args.action,
      modelId: args.modelId,
      modelStatus: args.modelStatus,
      changedFields: args.changedFields,
      error: args.error,
      extra: args.extra,
    }),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
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
    /** Alias for sort_order (New API–style). */
    priority: z.number().int().min(0).max(100_000).optional(),
    /** Derived status → enabled/visible mapping. */
    status: z
      .enum(["available", "disabled", "coming_soon", "archived"])
      .optional(),
  })
  .strict();

const PricingPatchSchema = z
  .object({
    billing_type: z.enum(["chat", "image"]).optional(),
    input_credits_per_million_tokens: z
      .number()
      .min(0)
      .max(CREDITS_PER_MILLION_MAX)
      .optional(),
    output_credits_per_million_tokens: z
      .number()
      .min(0)
      .max(CREDITS_PER_MILLION_MAX)
      .optional(),
    image_credits_per_generation: z
      .number()
      .min(0)
      .max(IMAGE_CREDITS_MAX)
      .optional(),
    upstream_cost_note: z.string().trim().max(UPSTREAM_NOTE_MAX).nullable().optional(),
    markup_ratio: z.number().min(0).max(MARKUP_RATIO_MAX).optional(),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    billing_mode: z.enum(["token", "per_image"]).optional(),
    input_per_1k: z.number().min(0).max(100).optional(),
    output_per_1k: z.number().min(0).max(100).optional(),
    billable: z.boolean().optional(),
    markup_multiplier: z.number().min(0).max(MARKUP_RATIO_MAX).optional(),
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
    billing_type: z.enum(["chat", "image"]).optional(),
    input_credits_per_million_tokens: z
      .number()
      .min(0)
      .max(CREDITS_PER_MILLION_MAX)
      .optional(),
    output_credits_per_million_tokens: z
      .number()
      .min(0)
      .max(CREDITS_PER_MILLION_MAX)
      .optional(),
    image_credits_per_generation: z
      .number()
      .min(0)
      .max(IMAGE_CREDITS_MAX)
      .optional(),
    upstream_cost_note: z.string().trim().max(UPSTREAM_NOTE_MAX).nullable().optional(),
    markup_ratio: z.number().min(0).max(MARKUP_RATIO_MAX).optional(),
    pricing_enabled: z.boolean().optional(),
    pricing_visible: z.boolean().optional(),
    billing_mode: z.enum(["token", "per_image"]).optional(),
    input_per_1k: z.number().min(0).max(100).optional(),
    output_per_1k: z.number().min(0).max(100).optional(),
    billable: z.boolean().optional(),
    markup_multiplier: z.number().min(0).max(MARKUP_RATIO_MAX).optional(),
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
    billing_type,
    input_credits_per_million_tokens,
    output_credits_per_million_tokens,
    image_credits_per_generation,
    upstream_cost_note,
    markup_ratio,
    enabled,
    visible,
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

function resolveBillingTypeFromRow(pricing: ModelPricingDbRow | null): string | null {
  if (!pricing) return null;
  if (pricing.billing_type === "chat" || pricing.billing_type === "image") {
    return pricing.billing_type;
  }
  if (pricing.billing_mode === "per_image") return "image";
  if (pricing.billing_mode === "token") return "chat";
  return null;
}

function resolveInputCreditsPerMillion(pricing: ModelPricingDbRow | null): number | null {
  if (!pricing) return null;
  const direct = toNumberOrNull(pricing.input_credits_per_million_tokens);
  if (direct !== null && direct > 0) return direct;
  const legacy = toNumberOrNull(pricing.input_per_1k);
  return legacy === null ? null : legacy * 1000;
}

function resolveOutputCreditsPerMillion(pricing: ModelPricingDbRow | null): number | null {
  if (!pricing) return null;
  const direct = toNumberOrNull(pricing.output_credits_per_million_tokens);
  if (direct !== null && direct > 0) return direct;
  const legacy = toNumberOrNull(pricing.output_per_1k);
  return legacy === null ? null : legacy * 1000;
}

function resolveImageCreditsPerGeneration(
  pricing: ModelPricingDbRow | null
): number | null {
  if (!pricing) return null;
  const direct = toNumberOrNull(pricing.image_credits_per_generation);
  if (direct !== null && direct > 0) return direct;
  if (resolveBillingTypeFromRow(pricing) !== "image") return null;
  const legacy = toNumberOrNull(pricing.input_per_1k);
  if (legacy === null) return null;
  const markup =
    toNumberOrNull(pricing.markup_ratio) ??
    toNumberOrNull(pricing.markup_multiplier) ??
    1;
  return legacy * markup;
}

function resolveMarkupRatio(pricing: ModelPricingDbRow | null): number | null {
  if (!pricing) return null;
  const direct = toNumberOrNull(pricing.markup_ratio);
  if (direct !== null && direct > 0) return direct;
  return toNumberOrNull(pricing.markup_multiplier);
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
    billing_type: resolveBillingTypeFromRow(pricing),
    input_credits_per_million_tokens: resolveInputCreditsPerMillion(pricing),
    output_credits_per_million_tokens: resolveOutputCreditsPerMillion(pricing),
    image_credits_per_generation: resolveImageCreditsPerGeneration(pricing),
    upstream_cost_note: pricing?.upstream_cost_note ?? null,
    markup_ratio: resolveMarkupRatio(pricing),
    pricing_enabled: pricing?.enabled ?? pricing?.billable ?? null,
    pricing_visible: pricing?.visible ?? pricing?.billable ?? null,
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

function normalizeBillingType(input: {
  billing_type?: "chat" | "image";
  billing_mode?: "token" | "per_image";
  model_type?: "chat" | "image" | "video" | "other";
  existing?: AdminModelListItem | null;
}): "chat" | "image" {
  if (input.billing_type === "chat" || input.billing_type === "image") {
    return input.billing_type;
  }
  if (input.billing_mode === "per_image") return "image";
  if (input.billing_mode === "token") return "chat";
  if (input.model_type === "image") return "image";
  if (input.existing?.billing_type === "image") return "image";
  if (input.existing?.billing_type === "chat") return "chat";
  if (input.existing?.model_type === "image") return "image";
  return "chat";
}

type NormalizedPricingWrite = {
  billing_type: "chat" | "image";
  input_credits_per_million_tokens: number;
  output_credits_per_million_tokens: number;
  image_credits_per_generation: number;
  upstream_cost_note: string | null;
  markup_ratio: number;
  enabled: boolean;
  visible: boolean;
};

function readInputCreditsPerMillion(
  input: Record<string, unknown>,
  fallback: number
): number {
  if (typeof input.input_credits_per_million_tokens === "number") {
    return input.input_credits_per_million_tokens;
  }
  if (typeof input.input_per_1k === "number") {
    return input.input_per_1k * 1000;
  }
  return fallback;
}

function readOutputCreditsPerMillion(
  input: Record<string, unknown>,
  fallback: number
): number {
  if (typeof input.output_credits_per_million_tokens === "number") {
    return input.output_credits_per_million_tokens;
  }
  if (typeof input.output_per_1k === "number") {
    return input.output_per_1k * 1000;
  }
  return fallback;
}

function readImageCreditsPerGeneration(
  input: Record<string, unknown>,
  billingType: "chat" | "image",
  fallback: number
): number {
  if (typeof input.image_credits_per_generation === "number") {
    return input.image_credits_per_generation;
  }
  if (billingType === "image" && typeof input.input_per_1k === "number") {
    const markup =
      typeof input.markup_ratio === "number"
        ? input.markup_ratio
        : typeof input.markup_multiplier === "number"
          ? input.markup_multiplier
          : 1;
    return input.input_per_1k * markup;
  }
  return fallback;
}

function readMarkupRatio(
  input: Record<string, unknown>,
  fallback: number
): number {
  if (typeof input.markup_ratio === "number") {
    return input.markup_ratio > 0 ? input.markup_ratio : 1;
  }
  if (typeof input.markup_multiplier === "number") {
    return input.markup_multiplier > 0 ? input.markup_multiplier : 1;
  }
  return fallback > 0 ? fallback : 1;
}

function readPricingEnabled(
  input: Record<string, unknown>,
  fallback: boolean
): boolean {
  if (typeof input.pricing_enabled === "boolean") return input.pricing_enabled;
  if (typeof input.enabled === "boolean") return input.enabled;
  if (typeof input.billable === "boolean") return input.billable;
  return fallback;
}

function readPricingVisible(
  input: Record<string, unknown>,
  fallback: boolean
): boolean {
  if (typeof input.pricing_visible === "boolean") return input.pricing_visible;
  if (typeof input.visible === "boolean") return input.visible;
  if (typeof input.billable === "boolean") return input.billable;
  return fallback;
}

function readUpstreamCostNote(
  input: Record<string, unknown>,
  fallback: string | null
): string | null {
  if (input.upstream_cost_note === null) return null;
  if (typeof input.upstream_cost_note === "string") {
    return input.upstream_cost_note.trim() || null;
  }
  return fallback;
}

/** Full row for create — unused billing family zeroed. */
function normalizePricingWrite(
  input: Record<string, unknown>,
  defaults?: Partial<NormalizedPricingWrite>
): NormalizedPricingWrite {
  const billingType = normalizeBillingType({
    billing_type:
      typeof input.billing_type === "string"
        ? (input.billing_type as "chat" | "image")
        : undefined,
    billing_mode:
      typeof input.billing_mode === "string"
        ? (input.billing_mode as "token" | "per_image")
        : undefined,
    model_type:
      typeof input.model_type === "string"
        ? (input.model_type as "chat" | "image" | "video" | "other")
        : undefined,
  });

  const row: NormalizedPricingWrite = {
    billing_type: billingType,
    input_credits_per_million_tokens: readInputCreditsPerMillion(
      input,
      defaults?.input_credits_per_million_tokens ?? 0
    ),
    output_credits_per_million_tokens: readOutputCreditsPerMillion(
      input,
      defaults?.output_credits_per_million_tokens ?? 0
    ),
    image_credits_per_generation: readImageCreditsPerGeneration(
      input,
      billingType,
      defaults?.image_credits_per_generation ?? 0
    ),
    upstream_cost_note: readUpstreamCostNote(
      input,
      defaults?.upstream_cost_note ?? null
    ),
    markup_ratio: readMarkupRatio(input, defaults?.markup_ratio ?? 1),
    enabled: readPricingEnabled(input, defaults?.enabled ?? false),
    visible: readPricingVisible(input, defaults?.visible ?? false),
  };

  if (billingType === "image") {
    row.input_credits_per_million_tokens = 0;
    row.output_credits_per_million_tokens = 0;
  } else {
    row.image_credits_per_generation = 0;
  }

  return row;
}

/** Patch upsert — only overrides fields present in the request; scrubs opposite family when billing_type is set. */
function buildPricingUpsertFromPatch(
  input: Record<string, unknown>,
  existing: AdminModelListItem | null,
  modelTypeHint?: string
): NormalizedPricingWrite {
  const billingType = normalizeBillingType({
    billing_type:
      typeof input.billing_type === "string"
        ? (input.billing_type as "chat" | "image")
        : undefined,
    billing_mode:
      typeof input.billing_mode === "string"
        ? (input.billing_mode as "token" | "per_image")
        : undefined,
    model_type:
      typeof input.model_type === "string"
        ? (input.model_type as "chat" | "image" | "video" | "other")
        : modelTypeHint === "image" || modelTypeHint === "chat"
          ? (modelTypeHint as "chat" | "image")
          : undefined,
    existing,
  });

  const row: NormalizedPricingWrite = {
    billing_type: billingType,
    input_credits_per_million_tokens:
      existing?.input_credits_per_million_tokens ?? 0,
    output_credits_per_million_tokens:
      existing?.output_credits_per_million_tokens ?? 0,
    image_credits_per_generation: existing?.image_credits_per_generation ?? 0,
    upstream_cost_note: existing?.upstream_cost_note ?? null,
    markup_ratio: existing?.markup_ratio ?? 1,
    enabled: Boolean(existing?.pricing_enabled),
    visible: Boolean(existing?.pricing_visible),
  };

  if (
    "billing_type" in input ||
    "billing_mode" in input ||
    "model_type" in input
  ) {
    row.billing_type = billingType;
  }

  if (
    "input_credits_per_million_tokens" in input ||
    "input_per_1k" in input
  ) {
    row.input_credits_per_million_tokens = readInputCreditsPerMillion(
      input,
      row.input_credits_per_million_tokens
    );
  }

  if (
    "output_credits_per_million_tokens" in input ||
    "output_per_1k" in input
  ) {
    row.output_credits_per_million_tokens = readOutputCreditsPerMillion(
      input,
      row.output_credits_per_million_tokens
    );
  }

  if (
    "image_credits_per_generation" in input ||
    ("input_per_1k" in input && billingType === "image")
  ) {
    row.image_credits_per_generation = readImageCreditsPerGeneration(
      input,
      billingType,
      row.image_credits_per_generation
    );
  }

  if ("markup_ratio" in input || "markup_multiplier" in input) {
    row.markup_ratio = readMarkupRatio(input, row.markup_ratio);
  }

  if (
    "pricing_enabled" in input ||
    "enabled" in input ||
    "billable" in input
  ) {
    row.enabled = readPricingEnabled(input, row.enabled);
  }

  if (
    "pricing_visible" in input ||
    "visible" in input ||
    "billable" in input
  ) {
    row.visible = readPricingVisible(input, row.visible);
  }

  if ("upstream_cost_note" in input) {
    row.upstream_cost_note = readUpstreamCostNote(
      input,
      row.upstream_cost_note
    );
  }

  if (typeof input.billing_type === "string") {
    if (input.billing_type === "image") {
      row.input_credits_per_million_tokens = 0;
      row.output_credits_per_million_tokens = 0;
    } else {
      row.image_credits_per_generation = 0;
    }
  }

  return row;
}

function statusToEnabledVisible(
  status: AdminModelStatus
): { enabled: boolean; visible: boolean } {
  switch (status) {
    case "available":
      return { enabled: true, visible: true };
    case "coming_soon":
      return { enabled: false, visible: true };
    case "disabled":
      return { enabled: true, visible: false };
    case "archived":
    default:
      return { enabled: false, visible: false };
  }
}

function normalizeModelPatchAliases(
  model: z.infer<typeof ModelPatchSchema>
): Omit<z.infer<typeof ModelPatchSchema>, "priority" | "status"> {
  const { priority, status, ...rest } = model;
  const out: Omit<z.infer<typeof ModelPatchSchema>, "priority" | "status"> = {
    ...rest,
  };

  if (priority !== undefined && out.sort_order === undefined) {
    out.sort_order = priority;
  }

  if (status !== undefined) {
    const mapped = statusToEnabledVisible(status);
    if (out.enabled === undefined) out.enabled = mapped.enabled;
    if (out.visible === undefined) out.visible = mapped.visible;
  }

  return out;
}

function partitionPatchBody(body: Record<string, unknown>):
  | {
      ok: true;
      model: Omit<z.infer<typeof ModelPatchSchema>, "priority" | "status">;
      pricing: z.infer<typeof PricingPatchSchema>;
      pricingRaw: Record<string, unknown>;
    }
  | { ok: false; error: string; detail?: unknown } {
  const modelBody: Record<string, unknown> = {};
  const pricingBody: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (key === "action") continue;
    if (key === "pricing_enabled") {
      pricingBody.enabled = value;
      continue;
    }
    if (key === "pricing_visible") {
      pricingBody.visible = value;
      continue;
    }
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

  const normalizedModel = normalizeModelPatchAliases(modelParsed.data);

  if (
    Object.keys(normalizedModel).length === 0 &&
    Object.keys(pricingParsed.data).length === 0
  ) {
    return { ok: false, error: "empty_patch" };
  }

  return {
    ok: true,
    model: normalizedModel,
    pricing: pricingParsed.data,
    pricingRaw: pricingBody,
  };
}

async function applyModelPatch(
  id: string,
  model: {
    enabled?: boolean;
    visible?: boolean;
    display_name?: string;
    provider?: string;
    model_type?: "chat" | "image" | "video" | "other";
    sort_order?: number;
  },
  pricingRaw: Record<string, unknown>
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

  if (Object.keys(pricingRaw).length > 0) {
    const existing = await getAdminModelById(id);
    const normalized = buildPricingUpsertFromPatch(
      pricingRaw,
      existing,
      typeof model.model_type === "string"
        ? model.model_type
        : existing?.model_type ?? undefined
    );
    const { error: pricingError } = await supabase()
      .from("model_pricing")
      .upsert(
        {
          model_id: id,
          ...normalized,
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
      modelId: resolveModelResourceId(undefined, body),
      error: "invalid_model_fields",
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
    billing_type,
    billing_mode,
    input_credits_per_million_tokens,
    output_credits_per_million_tokens,
    image_credits_per_generation,
    upstream_cost_note,
    markup_ratio,
    pricing_enabled,
    pricing_visible,
    input_per_1k,
    output_per_1k,
    billable,
    markup_multiplier,
    ...modelFields
  } = input;

  const pricingWrite = normalizePricingWrite(
    {
      billing_type,
      billing_mode,
      model_type: modelFields.model_type,
      input_credits_per_million_tokens,
      output_credits_per_million_tokens,
      image_credits_per_generation,
      upstream_cost_note,
      markup_ratio,
      pricing_enabled,
      pricing_visible,
      input_per_1k,
      output_per_1k,
      billable,
      markup_multiplier,
    },
    {
      markup_ratio: 1,
      enabled: false,
      visible: false,
    }
  );

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
      modelId: id,
      error: "model_already_exists",
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
    ...pricingWrite,
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
    modelId: id,
    modelStatus: model.status,
    changedFields: Object.keys(input),
  });

  await auditAdminModelWrite(ctx, {
    action: "model_pricing.update",
    resourceType: ADMIN_PRICING_RESOURCE_TYPE,
    resourceId: id,
    requestPayload: pricingWrite,
    status: "succeeded",
    modelId: id,
    changedFields: Object.keys(pricingWrite),
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
      modelId: id,
      error: parsed.error,
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
      modelId: id,
      error: "model_not_found",
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  const action = resolveModelAuditAction(body, parsed.model);
  const changedFields = collectChangedFieldNames(parsed.model, parsed.pricing);
  const pricingChanged = Object.keys(parsed.pricingRaw).length > 0;

  await applyModelPatch(id, parsed.model, parsed.pricingRaw);

  const model = await getAdminModelById(id);
  if (!model) {
    await auditAdminModelWrite(ctx, {
      action,
      resourceId: id,
      requestPayload: body,
      status: "failed",
      modelId: id,
      changedFields,
      error: "model_not_found",
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  if (Object.keys(parsed.model).length > 0) {
    await auditAdminModelWrite(ctx, {
      action,
      resourceId: id,
      requestPayload: body,
      status: "succeeded",
      modelId: id,
      modelStatus: model.status,
      changedFields: Object.keys(parsed.model),
    });
  }

  if (pricingChanged) {
    await auditAdminModelWrite(ctx, {
      action: "model_pricing.update",
      resourceType: ADMIN_PRICING_RESOURCE_TYPE,
      resourceId: id,
      requestPayload: parsed.pricingRaw,
      status: "succeeded",
      modelId: id,
      changedFields: Object.keys(parsed.pricing),
    });
  }

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

  await applyModelPatch(id, parsed.model, parsed.pricingRaw);
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
      modelId: id,
      error: "model_not_found",
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  const usageLogCount = await countModelUsageLogs(id);
  const archiveAction = resolveArchiveAuditAction(usageLogCount);
  const changedFields = ["enabled", "visible"];

  await applyModelPatch(
    id,
    { enabled: false, visible: false },
    {}
  );

  const model = await getAdminModelById(id);
  if (!model) {
    await auditAdminModelWrite(ctx, {
      action: archiveAction,
      resourceId: id,
      requestPayload: { soft_delete: true },
      status: "failed",
      modelId: id,
      changedFields,
      error: "model_not_found",
      extra: { usage_log_count: usageLogCount },
    });
    return { ok: false, status: 404, error: "model_not_found" };
  }

  await auditAdminModelWrite(ctx, {
    action: archiveAction,
    resourceId: id,
    requestPayload: { soft_delete: true },
    status: "succeeded",
    modelId: id,
    modelStatus: model.status,
    changedFields,
    extra: {
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
