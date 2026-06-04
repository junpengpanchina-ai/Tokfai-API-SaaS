import { z } from "zod";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

const ADMIN_RECHARGE_PLAN_RESOURCE_TYPE = "recharge_plans";

const ALLOWED_RECHARGE_PLAN_IDS = new Set(["starter", "pro", "business"]);

export type RechargePlanRow = {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  base_credits: number;
  bonus_credits: number;
  /** Final credited amount (= base_credits + bonus_credits). */
  credits: number;
  stripe_price_id: string | null;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  description: string | null;
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
  stripe_price_id: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  sort_order: number | string | null;
  badge: string | null;
  description?: string | null;
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

const RechargePlanPatchSchema = z
  .object({
    amount_cents: optionalIntField(0, 100_000_000),
    base_credits: optionalIntField(0, 100_000_000),
    bonus_credits: optionalIntField(0, 100_000_000),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    badge: z
      .union([z.string().trim().max(40), z.null()])
      .optional(),
    description: z
      .union([z.string().trim().max(500), z.null()])
      .optional(),
  })
  .strict();

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
    stripe_price_id: row.stripe_price_id?.trim() || null,
    enabled: row.enabled ?? false,
    visible: row.visible ?? true,
    sort_order: toNumber(row.sort_order),
    badge: row.badge?.trim() || null,
    description: row.description?.trim() || null,
    updated_at: row.updated_at,
  };
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

export async function listAdminRechargePlans(): Promise<AdminRechargePlanListItem[]> {
  const { data, error } = await supabase()
    .from("recharge_plans")
    .select(
      "id, name, amount_cents, currency, base_credits, credits, bonus_credits, stripe_price_id, enabled, visible, sort_order, badge, description, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw ApiError.internal(
      `Failed to list recharge plans: ${error.message}`,
      "recharge_plans_list_failed"
    );
  }

  return ((data ?? []) as RechargePlanDbRow[]).map(mapRechargePlanRow);
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

  if (!ALLOWED_RECHARGE_PLAN_IDS.has(planId)) {
    await auditRechargePlanWrite(ctx, {
      action: "recharge_plans.update",
      resourceId: planId,
      requestPayload: body,
      status: "failed",
      error: "invalid_recharge_plan_id",
    });
    return { ok: false, status: 400, error: "invalid_recharge_plan_id" };
  }

  if ("credits" in body) {
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
      detail: { credits: ["credits is computed server-side"] },
    };
  }

  const parsed = RechargePlanPatchSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.warn(
      "[admin] invalid_recharge_plan_fields",
      JSON.stringify({ plan_id: planId, field_errors: fieldErrors })
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
      detail: parsed.error.flatten(),
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

  const { data: existing, error: existingError } = await supabase()
    .from("recharge_plans")
    .select("id")
    .eq("id", planId)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to verify recharge plan: ${existingError.message}`,
      "recharge_plan_verify_failed"
    );
  }

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

  if (patch.amount_cents !== undefined) {
    updatePayload.amount_cents = patch.amount_cents;
  }
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
      detail: { credits: ["base_credits + bonus_credits must be greater than 0"] },
    };
  }

  if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled;
  if (patch.visible !== undefined) updatePayload.visible = patch.visible;
  if (patch.badge !== undefined) {
    updatePayload.badge =
      patch.badge === null || patch.badge === "" ? null : patch.badge;
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

  const { data: updated, error: loadError } = await supabase()
    .from("recharge_plans")
    .select(
      "id, name, amount_cents, currency, base_credits, credits, bonus_credits, stripe_price_id, enabled, visible, sort_order, badge, description, updated_at"
    )
    .eq("id", planId)
    .maybeSingle();

  if (loadError || !updated) {
    throw ApiError.internal(
      "Updated recharge plan could not be loaded.",
      "recharge_plan_load_failed"
    );
  }

  const plan = mapRechargePlanRow(updated as RechargePlanDbRow);
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
    .eq("visible", true)
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
  const { data, error } = await supabase()
    .from("recharge_plans")
    .select(
      "id, name, amount_cents, currency, base_credits, credits, bonus_credits, stripe_price_id, enabled, visible, sort_order, badge, description, updated_at"
    )
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
