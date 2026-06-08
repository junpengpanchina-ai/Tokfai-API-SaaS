import { z } from "zod";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import {
  createRechargePlanStripePrice,
  createRechargePlanStripeResources,
  type RechargePlanStripeIds,
} from "../lib/rechargePlanStripe.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

const ADMIN_RECHARGE_PLAN_RESOURCE_TYPE = "recharge_plans";

const RECHARGE_PLAN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const RECHARGE_PLAN_SELECT =
  "id, name, amount_cents, currency, base_credits, credits, bonus_credits, stripe_product_id, stripe_price_id, enabled, visible, sort_order, badge, description, archived_at, updated_at";

const CLIENT_FORBIDDEN_RECHARGE_PLAN_FIELDS = [
  "credits",
  "stripe_price_id",
  "stripe_product_id",
] as const;

export type RechargePlanRow = {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  base_credits: number;
  bonus_credits: number;
  /** Final credited amount (= base_credits + bonus_credits). */
  credits: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  description: string | null;
  archived_at: string | null;
  updated_at: string | null;
};

export type AdminRechargePlanListItem = RechargePlanRow;

type RechargePlanDbRow = {
  id: string;
  name: string;
  amount_cents: number | string;
  currency?: string | null;
  base_credits?: number | string | null;
  credits: number | string;
  bonus_credits: number | string | null;
  stripe_product_id?: string | null;
  stripe_price_id: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  sort_order: number | string | null;
  badge: string | null;
  description?: string | null;
  archived_at?: string | null;
  updated_at: string | null;
};

type AdminRechargePlanWriteContext = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
  idempotencyKey: string;
};

function emptyToUndefined(value: unknown): unknown {
  if (value === "" || value === undefined) return undefined;
  return value;
}

const optionalIntField = (min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(min).max(max).optional()
  );

const requiredIntField = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max));

const optionalNullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional();

const RechargePlanPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount_yuan: z.coerce.number().positive().max(1_000_000).optional(),
    amount_cents: optionalIntField(1, 100_000_000),
    base_credits: optionalIntField(0, 100_000_000),
    bonus_credits: optionalIntField(0, 100_000_000),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    sort_order: optionalIntField(0, 100_000),
    badge: optionalNullableString(40),
    description: optionalNullableString(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.amount_yuan !== undefined &&
      data.amount_cents !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send amount_yuan or amount_cents, not both.",
        path: ["amount_yuan"],
      });
    }
  });

export const RechargePlanCreateSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(RECHARGE_PLAN_ID_PATTERN, "invalid_recharge_plan_id"),
    name: z.string().trim().min(1).max(120),
    amount_yuan: z.coerce.number().positive().max(1_000_000).optional(),
    amount_cents: requiredIntField(1, 100_000_000).optional(),
    base_credits: requiredIntField(0, 100_000_000),
    bonus_credits: requiredIntField(0, 100_000_000).default(0),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    sort_order: optionalIntField(0, 100_000),
    badge: optionalNullableString(40),
    description: optionalNullableString(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.amount_yuan === undefined && data.amount_cents === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount_yuan or amount_cents is required",
        path: ["amount_yuan"],
      });
    }
    if (
      data.amount_yuan !== undefined &&
      data.amount_cents !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send amount_yuan or amount_cents, not both.",
        path: ["amount_yuan"],
      });
    }
    if (data.base_credits + data.bonus_credits <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "base_credits + bonus_credits must be greater than 0",
        path: ["base_credits"],
      });
    }
  });

const RechargePlanDuplicateSchema = z
  .object({
    new_id: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(RECHARGE_PLAN_ID_PATTERN, "invalid_recharge_plan_id")
      .optional(),
  })
  .strict();

const RECHARGE_PLAN_FIELD_ERROR_CODES: Record<string, string> = {
  id: "invalid_id",
  name: "invalid_name",
  amount_yuan: "invalid_amount_yuan",
  amount_cents: "invalid_amount_cents",
  base_credits: "invalid_base_credits",
  bonus_credits: "invalid_bonus_credits",
  sort_order: "invalid_sort_order",
  badge: "invalid_badge",
  description: "invalid_description",
  credits: "invalid_credits",
  stripe_price_id: "invalid_stripe_price_id",
  stripe_product_id: "invalid_stripe_product_id",
};

function rechargePlanValidationDetail(
  flattened: z.typeToFlattenedError<unknown, string>
): Record<string, string> {
  const detail: Record<string, string> = {};

  for (const message of flattened.formErrors) {
    detail.invalid_body = detail.invalid_body
      ? `${detail.invalid_body}; ${message}`
      : message;
  }

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    const code = RECHARGE_PLAN_FIELD_ERROR_CODES[field] ?? `invalid_${field}`;
    if (field === "base_credits" && messages.some((m) => m.includes("greater than 0"))) {
      detail.invalid_total_credits = messages.join("; ");
      continue;
    }
    detail[code] = messages.join("; ");
  }

  return detail;
}

function forbiddenRechargePlanFieldDetail(
  field: (typeof CLIENT_FORBIDDEN_RECHARGE_PLAN_FIELDS)[number]
): Record<string, string> {
  const code =
    RECHARGE_PLAN_FIELD_ERROR_CODES[field] ?? `invalid_${field}`;
  return {
    [code]: `${field} is computed server-side`,
  };
}

const EMPTY_STRIPE_IDS: RechargePlanStripeIds = {
  stripe_product_id: null,
  stripe_price_id: null,
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrency(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "cny";
}

function normalizeNullableString(
  value: string | null | undefined,
  max: number
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function findForbiddenRechargePlanField(
  body: Record<string, unknown>
): (typeof CLIENT_FORBIDDEN_RECHARGE_PLAN_FIELDS)[number] | null {
  for (const field of CLIENT_FORBIDDEN_RECHARGE_PLAN_FIELDS) {
    if (field in body) return field;
  }
  return null;
}

function resolveAmountCents(args: {
  amount_yuan?: number;
  amount_cents?: number;
}):
  | { ok: true; amountCents: number }
  | { ok: false; detail: Record<string, string> } {
  if (args.amount_cents !== undefined) {
    if (!Number.isInteger(args.amount_cents) || args.amount_cents <= 0) {
      return {
        ok: false,
        detail: {
          invalid_amount_cents: "amount_cents must be a positive integer.",
        },
      };
    }
    return { ok: true, amountCents: args.amount_cents };
  }
  if (args.amount_yuan !== undefined) {
    const amountCents = Math.round(args.amount_yuan * 100);
    if (!Number.isFinite(args.amount_yuan) || args.amount_yuan <= 0) {
      return {
        ok: false,
        detail: {
          invalid_amount_yuan: "amount_yuan must be a positive number.",
        },
      };
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return {
        ok: false,
        detail: {
          invalid_amount_yuan: "amount_yuan is too small after conversion to cents.",
        },
      };
    }
    return { ok: true, amountCents };
  }
  return {
    ok: false,
    detail: {
      invalid_amount_yuan: "amount_yuan or amount_cents is required.",
    },
  };
}

function mapRechargePlanRow(row: RechargePlanDbRow): AdminRechargePlanListItem {
  const baseCredits = toNumber(row.base_credits ?? row.credits);
  const bonusCredits = toNumber(row.bonus_credits);
  const credits = toNumber(row.credits);
  return {
    id: row.id,
    name: row.name,
    amount_cents: toNumber(row.amount_cents),
    currency: normalizeCurrency(row.currency),
    base_credits: baseCredits,
    bonus_credits: bonusCredits,
    credits,
    stripe_product_id: row.stripe_product_id?.trim() || null,
    stripe_price_id: row.stripe_price_id?.trim() || null,
    enabled: row.enabled ?? false,
    visible: row.visible ?? true,
    sort_order: toNumber(row.sort_order),
    badge: row.badge?.trim() || null,
    description: row.description?.trim() || null,
    archived_at: row.archived_at ?? null,
    updated_at: row.updated_at,
  };
}

async function loadRechargePlanById(
  planId: string
): Promise<AdminRechargePlanListItem | null> {
  const { data, error } = await supabase()
    .from("recharge_plans")
    .select(RECHARGE_PLAN_SELECT)
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load recharge plan: ${error.message}`,
      "recharge_plan_load_failed"
    );
  }

  if (!data) return null;
  return mapRechargePlanRow(data as RechargePlanDbRow);
}

async function auditRechargePlanWrite(
  ctx: AdminRechargePlanWriteContext,
  args: {
    action: string;
    resourceId: string;
    requestPayload: Record<string, unknown>;
    status: "succeeded" | "failed";
    changedFields?: string[];
    error?: string | null;
    plan?: AdminRechargePlanListItem | null;
  }
): Promise<void> {
  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: args.action,
    resourceType: ADMIN_RECHARGE_PLAN_RESOURCE_TYPE,
    resourceId: args.resourceId,
    requestPayload: args.requestPayload,
    status: args.status,
    resultPayload: {
      ok: args.status === "succeeded",
      plan_id: args.resourceId,
      action: args.action,
      changed_fields: args.changedFields ?? [],
      error: args.error ?? null,
      plan: args.plan ?? null,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    idempotencyKey: ctx.idempotencyKey || undefined,
  });
}

export async function listAdminRechargePlans(args?: {
  includeArchived?: boolean;
}): Promise<AdminRechargePlanListItem[]> {
  let query = supabase()
    .from("recharge_plans")
    .select(RECHARGE_PLAN_SELECT)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (!args?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;

  if (error) {
    throw ApiError.internal(
      `Failed to list recharge plans: ${error.message}`,
      "recharge_plans_list_failed"
    );
  }

  return ((data ?? []) as RechargePlanDbRow[]).map(mapRechargePlanRow);
}

export async function createAdminRechargePlan(
  body: Record<string, unknown>,
  ctx: AdminRechargePlanWriteContext
): Promise<
  | { ok: true; plan: AdminRechargePlanListItem }
  | { ok: false; status: 400 | 409; error: string; detail?: unknown }
> {
  const forbiddenField = findForbiddenRechargePlanField(body);
  if (forbiddenField) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.create",
      resourceId: typeof body.id === "string" ? body.id : "unknown",
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: forbiddenRechargePlanFieldDetail(forbiddenField),
    };
  }

  const parsed = RechargePlanCreateSchema.safeParse(body);
  if (!parsed.success) {
    const validationDetail = rechargePlanValidationDetail(parsed.error.flatten());
    console.warn(
      "[admin] invalid_recharge_plan_fields",
      JSON.stringify({
        action: "recharge_plans.create",
        detail: validationDetail,
      })
    );
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.create",
      resourceId: typeof body.id === "string" ? body.id : "unknown",
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: validationDetail,
    };
  }

  const input = parsed.data;
  const amountResult = resolveAmountCents(input);
  if (!amountResult.ok) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.create",
      resourceId: input.id,
      requestPayload: input,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: amountResult.detail,
    };
  }
  const amountCents = amountResult.amountCents;
  const { data: existing, error: existingError } = await supabase()
    .from("recharge_plans")
    .select("id")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to verify recharge plan id: ${existingError.message}`,
      "recharge_plan_verify_failed"
    );
  }

  if (existing) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.create",
      resourceId: input.id,
      requestPayload: input,
      status: "failed",
      error: "recharge_plan_already_exists",
    });
    return { ok: false, status: 409, error: "recharge_plan_already_exists" };
  }

  const now = new Date().toISOString();
  const credits = input.base_credits + input.bonus_credits;
  const checkoutEnabled = input.enabled ?? false;

  const stripeIds = checkoutEnabled
    ? await createRechargePlanStripeResources({
        planId: input.id,
        name: input.name,
        amountCents,
        credits,
      })
    : EMPTY_STRIPE_IDS;

  const { error: insertError } = await supabase().from("recharge_plans").insert({
    id: input.id,
    name: input.name,
    amount_cents: amountCents,
    currency: "cny",
    base_credits: input.base_credits,
    bonus_credits: input.bonus_credits,
    credits,
    stripe_product_id: stripeIds.stripe_product_id,
    stripe_price_id: stripeIds.stripe_price_id,
    enabled: input.enabled ?? false,
    visible: input.visible ?? true,
    sort_order: input.sort_order ?? 1000,
    badge: normalizeNullableString(input.badge ?? null, 40),
    description: normalizeNullableString(input.description ?? null, 500),
    archived_at: null,
    updated_at: now,
  });

  if (insertError) {
    throw ApiError.internal(
      `Failed to create recharge plan: ${insertError.message}`,
      "recharge_plan_create_failed"
    );
  }

  const plan = await loadRechargePlanById(input.id);
  if (!plan) {
    throw ApiError.internal(
      "Created recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  await auditRechargePlanWrite(ctx, {
    action: "recharge_plans.create",
    resourceId: input.id,
    requestPayload: input,
    status: "succeeded",
    plan,
  });

  return { ok: true, plan };
}

async function resolveDuplicatePlanId(
  sourceId: string,
  requestedId?: string
): Promise<string> {
  if (requestedId) return requestedId;

  const base = `${sourceId}-copy`;
  let candidate = base;
  let suffix = 1;

  while (true) {
    const { data, error } = await supabase()
      .from("recharge_plans")
      .select("id")
      .eq("id", candidate)
      .maybeSingle();

    if (error) {
      throw ApiError.internal(
        `Failed to verify duplicate plan id: ${error.message}`,
        "recharge_plan_verify_failed"
      );
    }

    if (!data) return candidate;

    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > 999) {
      throw ApiError.internal(
        "Could not generate a unique duplicate plan id.",
        "recharge_plan_duplicate_id_failed"
      );
    }
  }
}

export async function duplicateAdminRechargePlan(
  sourceId: string,
  body: Record<string, unknown>,
  ctx: AdminRechargePlanWriteContext
): Promise<
  | { ok: true; plan: AdminRechargePlanListItem; source_plan_id: string }
  | { ok: false; status: 400 | 404 | 409; error: string; detail?: unknown }
> {
  const trimmedSourceId = sourceId.trim();
  if (!trimmedSourceId) {
    return { ok: false, status: 400, error: "missing_plan_id" };
  }

  const parsed = RechargePlanDuplicateSchema.safeParse(body);
  if (!parsed.success) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.duplicate",
      resourceId: trimmedSourceId,
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: rechargePlanValidationDetail(parsed.error.flatten()),
    };
  }

  const source = await loadRechargePlanById(trimmedSourceId);
  if (!source) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.duplicate",
      resourceId: trimmedSourceId,
      requestPayload: body,
      status: "failed",
      error: "recharge_plan_not_found",
    });
    return { ok: false, status: 404, error: "recharge_plan_not_found" };
  }

  const newId = await resolveDuplicatePlanId(
    trimmedSourceId,
    parsed.data.new_id
  );

  const { data: idConflict, error: idConflictError } = await supabase()
    .from("recharge_plans")
    .select("id")
    .eq("id", newId)
    .maybeSingle();

  if (idConflictError) {
    throw ApiError.internal(
      `Failed to verify duplicate plan id: ${idConflictError.message}`,
      "recharge_plan_verify_failed"
    );
  }

  if (idConflict) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.duplicate",
      resourceId: trimmedSourceId,
      requestPayload: { ...body, new_id: newId },
      status: "failed",
      error: "recharge_plan_already_exists",
    });
    return { ok: false, status: 409, error: "recharge_plan_already_exists" };
  }

  const now = new Date().toISOString();
  const credits = source.base_credits + source.bonus_credits;

  const { error: insertError } = await supabase().from("recharge_plans").insert({
    id: newId,
    name: `${source.name} (copy)`,
    amount_cents: source.amount_cents,
    currency: source.currency,
    base_credits: source.base_credits,
    bonus_credits: source.bonus_credits,
    credits,
    stripe_product_id: null,
    stripe_price_id: null,
    enabled: false,
    visible: false,
    sort_order: source.sort_order + 1,
    badge: source.badge,
    description: source.description,
    archived_at: null,
    updated_at: now,
  });

  if (insertError) {
    throw ApiError.internal(
      `Failed to duplicate recharge plan: ${insertError.message}`,
      "recharge_plan_duplicate_failed"
    );
  }

  const plan = await loadRechargePlanById(newId);
  if (!plan) {
    throw ApiError.internal(
      "Duplicated recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  await auditRechargePlanWrite(ctx, {
    action: "recharge_plans.duplicate",
    resourceId: newId,
    requestPayload: { source_plan_id: trimmedSourceId, new_id: newId },
    status: "succeeded",
    plan,
  });

  return {
    ok: true,
    plan,
    source_plan_id: trimmedSourceId,
  };
}

export async function archiveAdminRechargePlan(
  id: string,
  ctx: AdminRechargePlanWriteContext
): Promise<
  | { ok: true; plan: AdminRechargePlanListItem; archived: boolean }
  | { ok: false; status: 400 | 404; error: string }
> {
  const planId = id.trim();
  if (!planId) {
    return { ok: false, status: 400, error: "missing_plan_id" };
  }

  const existing = await loadRechargePlanById(planId);
  if (!existing) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.archive",
      resourceId: planId,
      requestPayload: {},
      status: "failed",
      error: "recharge_plan_not_found",
    });
    return { ok: false, status: 404, error: "recharge_plan_not_found" };
  }

  if (existing.archived_at) {
    return { ok: true, plan: existing, archived: true };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase()
    .from("recharge_plans")
    .update({ archived_at: now, updated_at: now })
    .eq("id", planId);

  if (updateError) {
    throw ApiError.internal(
      `Failed to archive recharge plan: ${updateError.message}`,
      "recharge_plan_archive_failed"
    );
  }

  const plan = await loadRechargePlanById(planId);
  if (!plan) {
    throw ApiError.internal(
      "Archived recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  await auditRechargePlanWrite(ctx, {
    action: "recharge_plans.archive",
    resourceId: planId,
    requestPayload: {},
    status: "succeeded",
    changedFields: ["archived_at"],
    plan,
  });

  return { ok: true, plan, archived: true };
}

export async function restoreAdminRechargePlan(
  id: string,
  ctx: AdminRechargePlanWriteContext
): Promise<
  | { ok: true; plan: AdminRechargePlanListItem }
  | { ok: false; status: 400 | 404; error: string }
> {
  const planId = id.trim();
  if (!planId) {
    return { ok: false, status: 400, error: "missing_plan_id" };
  }

  const existing = await loadRechargePlanById(planId);
  if (!existing) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.restore",
      resourceId: planId,
      requestPayload: {},
      status: "failed",
      error: "recharge_plan_not_found",
    });
    return { ok: false, status: 404, error: "recharge_plan_not_found" };
  }

  if (!existing.archived_at) {
    return { ok: true, plan: existing };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase()
    .from("recharge_plans")
    .update({ archived_at: null, updated_at: now })
    .eq("id", planId);

  if (updateError) {
    throw ApiError.internal(
      `Failed to restore recharge plan: ${updateError.message}`,
      "recharge_plan_restore_failed"
    );
  }

  const plan = await loadRechargePlanById(planId);
  if (!plan) {
    throw ApiError.internal(
      "Restored recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  await auditRechargePlanWrite(ctx, {
    action: "recharge_plans.restore",
    resourceId: planId,
    requestPayload: {},
    status: "succeeded",
    changedFields: ["archived_at"],
    plan,
  });

  return { ok: true, plan };
}

export async function updateAdminRechargePlan(
  id: string,
  body: Record<string, unknown>,
  ctx: AdminRechargePlanWriteContext
): Promise<
  | { ok: true; plan: AdminRechargePlanListItem }
  | { ok: false; status: 400 | 404; error: string; detail?: unknown }
> {
  const planId = id.trim();
  if (!planId) {
    return { ok: false, status: 400, error: "missing_plan_id" };
  }

  const forbiddenField = findForbiddenRechargePlanField(body);
  if (forbiddenField) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: forbiddenRechargePlanFieldDetail(forbiddenField),
    };
  }

  const parsed = RechargePlanPatchSchema.safeParse(body);
  if (!parsed.success) {
    const validationDetail = rechargePlanValidationDetail(parsed.error.flatten());
    console.warn(
      "[admin] invalid_recharge_plan_fields",
      JSON.stringify({ plan_id: planId, detail: validationDetail })
    );
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: { fields: Object.keys(body) },
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: validationDetail,
    };
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: body,
      status: "failed",
      error: "empty_patch",
    });
    return { ok: false, status: 400, error: "empty_patch" };
  }

  const existing = await loadRechargePlanById(planId);

  if (!existing) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: body,
      status: "failed",
      error: "recharge_plan_not_found",
    });
    return { ok: false, status: 404, error: "recharge_plan_not_found" };
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) updatePayload.name = patch.name;

  let requestedAmountCents: number | undefined;
  if (patch.amount_yuan !== undefined || patch.amount_cents !== undefined) {
    const amountResult = resolveAmountCents(patch);
    if (!amountResult.ok) {
      await auditRechargePlanWrite(ctx, {
        action: "recharge_plans.update",
        resourceId: planId,
        requestPayload: body,
        status: "failed",
        error: "invalid_recharge_plan_fields",
      });
      return {
        ok: false,
        status: 400,
        error: "invalid_recharge_plan_fields",
        detail: amountResult.detail,
      };
    }
    requestedAmountCents = amountResult.amountCents;
  }

  const willBeEnabled = patch.enabled ?? existing.enabled;

  if (
    requestedAmountCents !== undefined &&
    requestedAmountCents !== existing.amount_cents
  ) {
    const nextCredits =
      patch.base_credits !== undefined || patch.bonus_credits !== undefined
        ? (patch.base_credits ?? existing.base_credits) +
          (patch.bonus_credits ?? existing.bonus_credits)
        : existing.credits;

    updatePayload.amount_cents = requestedAmountCents;

    if (willBeEnabled) {
      const stripeIds = await createRechargePlanStripePrice({
        planId,
        name: patch.name ?? existing.name,
        amountCents: requestedAmountCents,
        credits: nextCredits,
        stripeProductId: existing.stripe_product_id,
      });

      updatePayload.stripe_product_id = stripeIds.stripe_product_id;
      updatePayload.stripe_price_id = stripeIds.stripe_price_id;
    }
  }
  if (patch.sort_order !== undefined) updatePayload.sort_order = patch.sort_order;
  if (patch.description !== undefined) {
    updatePayload.description =
      patch.description === null || patch.description === ""
        ? null
        : patch.description;
  }
  if (patch.base_credits !== undefined || patch.bonus_credits !== undefined) {
    const { data: current, error: currentError } = await supabase()
      .from("recharge_plans")
      .select("base_credits, bonus_credits")
      .eq("id", planId)
      .maybeSingle();

    if (currentError || !current) {
      throw ApiError.internal(
        `Failed to load recharge plan credits: ${currentError?.message ?? "missing plan"}`,
        "recharge_plan_load_failed"
      );
    }

    const baseCredits = toNumber(
      patch.base_credits ?? (current as { base_credits: number | string }).base_credits
    );
    const bonusCredits = toNumber(
      patch.bonus_credits ?? (current as { bonus_credits: number | string }).bonus_credits
    );
    updatePayload.base_credits = baseCredits;
    updatePayload.bonus_credits = bonusCredits;
    updatePayload.credits = baseCredits + bonusCredits;
  }

  const finalCredits =
    typeof updatePayload.credits === "number"
      ? updatePayload.credits
      : undefined;
  if (finalCredits !== undefined && finalCredits <= 0) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_fields",
    });
    return {
      ok: false,
      status: 400,
      error: "invalid_recharge_plan_fields",
      detail: {
        invalid_total_credits:
          "base_credits + bonus_credits must be greater than 0",
      },
    };
  }

  if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled;
  if (patch.visible !== undefined) updatePayload.visible = patch.visible;
  if (patch.badge !== undefined) {
    updatePayload.badge =
      patch.badge === null || patch.badge === "" ? null : patch.badge;
  }

  if (willBeEnabled && !existing.stripe_price_id && !updatePayload.stripe_price_id) {
    const nextName =
      typeof updatePayload.name === "string" ? updatePayload.name : existing.name;
    const nextAmountCents =
      typeof updatePayload.amount_cents === "number"
        ? updatePayload.amount_cents
        : existing.amount_cents;
    const nextCredits =
      typeof updatePayload.credits === "number"
        ? updatePayload.credits
        : existing.credits;

    const stripeIds = await createRechargePlanStripeResources({
      planId,
      name: nextName,
      amountCents: nextAmountCents,
      credits: nextCredits,
    });
    updatePayload.stripe_product_id = stripeIds.stripe_product_id;
    updatePayload.stripe_price_id = stripeIds.stripe_price_id;
  }

  const { error: updateError } = await supabase()
    .from("recharge_plans")
    .update(updatePayload)
    .eq("id", planId);

  if (updateError) {
    throw ApiError.internal(
      `Failed to update recharge plan: ${updateError.message}`,
      "recharge_plan_update_failed"
    );
  }

  const plan = await loadRechargePlanById(planId);
  if (!plan) {
    throw ApiError.internal(
      "Updated recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  const changedFields = Object.keys(patch);

  await auditRechargePlanWrite(ctx, {
    action: "recharge_plans.update",
    resourceId: planId,
    requestPayload: body,
    status: "succeeded",
    changedFields,
    plan,
  });

  return { ok: true, plan };
}

export function rechargePlanAdminErrorMessage(error: string): string {
  switch (error) {
    case "recharge_plan_not_found":
      return "Recharge plan not found.";
    case "recharge_plan_already_exists":
      return "A recharge plan with this ID already exists.";
    case "empty_patch":
      return "No fields to update.";
    case "invalid_recharge_plan_fields":
      return "Invalid recharge plan fields.";
    case "missing_plan_id":
      return "Plan ID is required.";
    default:
      return "Recharge plan operation failed.";
  }
}

export type BillingRechargePlan = {
  plan_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  base_credits: number;
  bonus_credits: number;
  /** Final credited amount (= base_credits + bonus_credits). */
  credits: number;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  description: string | null;
};

export async function listBillingRechargePlans(): Promise<BillingRechargePlan[]> {
  const { data, error } = await supabase()
    .from("recharge_plans")
    .select(
      "id, name, amount_cents, currency, base_credits, credits, bonus_credits, enabled, visible, sort_order, badge, description"
    )
    .eq("enabled", true)
    .eq("visible", true)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw ApiError.internal(
      `Failed to list billing recharge plans: ${error.message}`,
      "billing_plans_list_failed"
    );
  }

  return ((data ?? []) as RechargePlanDbRow[]).map((row) => {
    const mapped = mapRechargePlanRow(row);
    return {
      plan_id: mapped.id,
      name: mapped.name,
      amount_cents: mapped.amount_cents,
      currency: mapped.currency,
      base_credits: mapped.base_credits,
      bonus_credits: mapped.bonus_credits,
      credits: mapped.credits,
      enabled: mapped.enabled,
      visible: mapped.visible,
      sort_order: mapped.sort_order,
      badge: mapped.badge,
      description: mapped.description,
    };
  });
}

export async function loadCheckoutRechargePlan(
  planId: string
): Promise<AdminRechargePlanListItem | null> {
  return loadRechargePlanById(planId);
}
