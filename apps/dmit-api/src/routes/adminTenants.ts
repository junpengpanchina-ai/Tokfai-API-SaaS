import { z } from "zod";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabaseAdmin, isSupabaseAdminConfigured } from "../supabase.js";
import {
  DOMAIN_SELECT,
  TENANT_SELECT,
  isReservedTenantSlug,
  tenantCnameTarget,
  type TenantDomainRow,
  type TenantRow,
} from "../tenants/resolve.js";

const RESOURCE = "tenants";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

type WriteCtx = {
  adminUser: AdminUserContext;
  ipAddress: string | null;
  userAgent: string | null;
};

function requireDb() {
  if (!isSupabaseAdminConfigured()) {
    throw new ApiError({
      status: 503,
      message: "Database is not configured.",
      code: "config_error",
      type: "server_error",
    });
  }
  return supabaseAdmin();
}

function toMultiplier(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const CreateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Invalid slug"),
  status: z.enum(["active", "disabled"]).optional().default("active"),
  logo_url: z.string().trim().url().max(2048).nullable().optional(),
  primary_domain: z.string().trim().max(253).nullable().optional(),
  default_locale: z.string().trim().min(2).max(16).optional().default("zh-CN"),
  base_price_multiplier: z.coerce.number().positive().max(1000).optional().default(1),
});

const PatchTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  logo_url: z.string().trim().url().max(2048).nullable().optional(),
  primary_domain: z.string().trim().max(253).nullable().optional(),
  default_locale: z.string().trim().min(2).max(16).optional(),
  base_price_multiplier: z.coerce.number().positive().max(1000).optional(),
});

const CreateDomainSchema = z.object({
  domain: z.string().trim().min(3).max(253),
  domain_type: z.enum(["tokfai_subdomain", "custom_domain"]),
  status: z.enum(["pending", "active", "disabled"]).optional().default("pending"),
  ssl_status: z.enum(["pending", "active", "failed"]).optional().default("pending"),
  dns_status: z.enum(["pending", "active", "failed"]).optional().default("pending"),
});

const PatchDomainSchema = z.object({
  status: z.enum(["pending", "active", "disabled"]).optional(),
  ssl_status: z.enum(["pending", "active", "failed"]).optional(),
  dns_status: z.enum(["pending", "active", "failed"]).optional(),
});

const ModelSettingSchema = z.object({
  model_id: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
});

const PricingRuleSchema = z.object({
  model_id: z.string().trim().min(1).max(128),
  price_multiplier: z.coerce.number().positive().max(1000),
});

const TenantAdminSchema = z.object({
  email: z.string().trim().email().max(320),
  user_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional().default("active"),
});

function mapTenant(row: TenantRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    logo_url: row.logo_url,
    primary_domain: row.primary_domain,
    default_locale: row.default_locale,
    base_price_multiplier: toMultiplier(row.base_price_multiplier),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDomain(row: TenantDomainRow) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    domain: row.domain,
    domain_type: row.domain_type,
    status: row.status,
    ssl_status: row.ssl_status,
    dns_status: row.dns_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    dns_instructions: {
      cname_target: tenantCnameTarget(),
      record_type: "CNAME",
      note: "Point this domain to the CNAME target in Cloudflare (or your DNS). After SSL is ready, mark ssl_status/dns_status/status as active in admin. V1 does not auto-provision Cloudflare.",
    },
  };
}

export async function listAdminTenants() {
  const sb = requireDb();
  const { data, error } = await sb
    .from("tenants")
    .select(TENANT_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    throw ApiError.internal(`Failed to list tenants: ${error.message}`, "tenants_list_failed");
  }
  return (data as TenantRow[] | null)?.map(mapTenant) ?? [];
}

export async function getAdminTenant(tenantId: string) {
  const sb = requireDb();
  const { data: tenant, error } = await sb
    .from("tenants")
    .select(TENANT_SELECT)
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    throw ApiError.internal(`Failed to load tenant: ${error.message}`, "tenant_load_failed");
  }
  if (!tenant) {
    throw new ApiError({
      status: 404,
      message: "Tenant not found.",
      code: "tenant_not_found",
      type: "not_found",
    });
  }

  const [domains, modelSettings, pricingRules, admins] = await Promise.all([
    sb.from("tenant_domains").select(DOMAIN_SELECT).eq("tenant_id", tenantId).order("created_at"),
    sb
      .from("tenant_model_settings")
      .select("id, tenant_id, model_id, enabled, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("model_id"),
    sb
      .from("tenant_pricing_rules")
      .select("id, tenant_id, model_id, price_multiplier, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("model_id"),
    sb
      .from("tenant_admins")
      .select("id, tenant_id, user_id, email, status, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at"),
  ]);

  return {
    tenant: mapTenant(tenant as TenantRow),
    domains: ((domains.data as TenantDomainRow[] | null) ?? []).map(mapDomain),
    model_settings: modelSettings.data ?? [],
    pricing_rules: (pricingRules.data ?? []).map((r) => ({
      ...r,
      price_multiplier: toMultiplier(
        (r as { price_multiplier?: number | string }).price_multiplier
      ),
    })),
    admins: admins.data ?? [],
    dns: {
      cname_target: tenantCnameTarget(),
      note: "Manual Cloudflare/DNS only in V1.",
    },
  };
}

export async function createAdminTenant(body: unknown, ctx: WriteCtx) {
  const parsed = CreateTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid tenant payload.",
      code: "invalid_tenant_payload",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const slug = normalizeSlug(parsed.data.slug);
  if (isReservedTenantSlug(slug)) {
    throw new ApiError({
      status: 400,
      message: "This slug is reserved and cannot be registered.",
      code: "reserved_tenant_slug",
      type: "validation_error",
    });
  }
  const now = new Date().toISOString();
  const primaryDomain =
    parsed.data.primary_domain?.trim() ||
    `${slug}.${process.env.TOKFAI_TENANT_BASE_DOMAIN?.trim() || "tokfai.com"}`;

  const insert = {
    name: parsed.data.name.trim(),
    slug,
    status: parsed.data.status,
    logo_url: parsed.data.logo_url ?? null,
    primary_domain: primaryDomain,
    default_locale: parsed.data.default_locale,
    base_price_multiplier: parsed.data.base_price_multiplier,
    updated_at: now,
  };

  const { data, error } = await sb
    .from("tenants")
    .insert(insert)
    .select(TENANT_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError({
        status: 409,
        message: "Tenant slug already exists.",
        code: "tenant_slug_exists",
        type: "validation_error",
      });
    }
    throw ApiError.internal(`Failed to create tenant: ${error.message}`, "tenant_create_failed");
  }

  const tenant = data as TenantRow;

  // Auto-bind tokfai subdomain for convenience.
  await sb.from("tenant_domains").insert({
    tenant_id: tenant.id,
    domain: primaryDomain.toLowerCase(),
    domain_type: "tokfai_subdomain",
    status: "active",
    ssl_status: "active",
    dns_status: "active",
    updated_at: now,
  });

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.create",
    resourceType: RESOURCE,
    resourceId: tenant.id,
    requestPayload: insert,
    status: "succeeded",
    resultPayload: { id: tenant.id, slug: tenant.slug },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return getAdminTenant(tenant.id);
}

export async function updateAdminTenant(
  tenantId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = PatchTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid tenant patch.",
      code: "invalid_tenant_payload",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.logo_url !== undefined) patch.logo_url = parsed.data.logo_url;
  if (parsed.data.primary_domain !== undefined) {
    patch.primary_domain = parsed.data.primary_domain;
  }
  if (parsed.data.default_locale !== undefined) {
    patch.default_locale = parsed.data.default_locale;
  }
  if (parsed.data.base_price_multiplier !== undefined) {
    patch.base_price_multiplier = parsed.data.base_price_multiplier;
  }

  const { data, error } = await sb
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select(TENANT_SELECT)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(`Failed to update tenant: ${error.message}`, "tenant_update_failed");
  }
  if (!data) {
    throw new ApiError({
      status: 404,
      message: "Tenant not found.",
      code: "tenant_not_found",
      type: "not_found",
    });
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.update",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: patch,
    status: "succeeded",
    resultPayload: { id: tenantId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return getAdminTenant(tenantId);
}

export async function addAdminTenantDomain(
  tenantId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = CreateDomainSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid domain payload.",
      code: "invalid_domain_payload",
      type: "validation_error",
    });
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new ApiError({
      status: 400,
      message: "Invalid domain format.",
      code: "invalid_domain",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const { data: tenant } = await sb
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    throw new ApiError({
      status: 404,
      message: "Tenant not found.",
      code: "tenant_not_found",
      type: "not_found",
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("tenant_domains")
    .insert({
      tenant_id: tenantId,
      domain,
      domain_type: parsed.data.domain_type,
      status: parsed.data.status,
      ssl_status: parsed.data.ssl_status,
      dns_status: parsed.data.dns_status,
      updated_at: now,
    })
    .select(DOMAIN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError({
        status: 409,
        message: "Domain already bound.",
        code: "domain_exists",
        type: "validation_error",
      });
    }
    throw ApiError.internal(`Failed to add domain: ${error.message}`, "domain_create_failed");
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.domain.create",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: { domain, domain_type: parsed.data.domain_type },
    status: "succeeded",
    resultPayload: { domain_id: (data as TenantDomainRow).id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return mapDomain(data as TenantDomainRow);
}

export async function updateAdminTenantDomain(
  tenantId: string,
  domainId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = PatchDomainSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid domain patch.",
      code: "invalid_domain_payload",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...parsed.data,
  };

  const { data, error } = await sb
    .from("tenant_domains")
    .update(patch)
    .eq("id", domainId)
    .eq("tenant_id", tenantId)
    .select(DOMAIN_SELECT)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(`Failed to update domain: ${error.message}`, "domain_update_failed");
  }
  if (!data) {
    throw new ApiError({
      status: 404,
      message: "Domain not found.",
      code: "domain_not_found",
      type: "not_found",
    });
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.domain.update",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: { domain_id: domainId, ...parsed.data },
    status: "succeeded",
    resultPayload: { domain_id: domainId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return mapDomain(data as TenantDomainRow);
}

export async function upsertAdminTenantModelSetting(
  tenantId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = ModelSettingSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid model setting.",
      code: "invalid_model_setting",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("tenant_model_settings")
    .upsert(
      {
        tenant_id: tenantId,
        model_id: parsed.data.model_id,
        enabled: parsed.data.enabled,
        updated_at: now,
      },
      { onConflict: "tenant_id,model_id" }
    )
    .select("id, tenant_id, model_id, enabled, created_at, updated_at")
    .single();

  if (error) {
    throw ApiError.internal(
      `Failed to upsert model setting: ${error.message}`,
      "tenant_model_setting_failed"
    );
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.model_setting.upsert",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: parsed.data,
    status: "succeeded",
    resultPayload: { id: data.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return data;
}

export async function upsertAdminTenantPricingRule(
  tenantId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = PricingRuleSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid pricing rule.",
      code: "invalid_pricing_rule",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("tenant_pricing_rules")
    .upsert(
      {
        tenant_id: tenantId,
        model_id: parsed.data.model_id,
        price_multiplier: parsed.data.price_multiplier,
        updated_at: now,
      },
      { onConflict: "tenant_id,model_id" }
    )
    .select("id, tenant_id, model_id, price_multiplier, created_at, updated_at")
    .single();

  if (error) {
    throw ApiError.internal(
      `Failed to upsert pricing rule: ${error.message}`,
      "tenant_pricing_rule_failed"
    );
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.pricing_rule.upsert",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: parsed.data,
    status: "succeeded",
    resultPayload: { id: data.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    ...data,
    price_multiplier: toMultiplier(data.price_multiplier as number | string),
  };
}

export async function addAdminTenantAdmin(
  tenantId: string,
  body: unknown,
  ctx: WriteCtx
) {
  const parsed = TenantAdminSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid tenant admin.",
      code: "invalid_tenant_admin",
      type: "validation_error",
    });
  }

  const sb = requireDb();
  const email = normalizeEmail(parsed.data.email);
  let userId = parsed.data.user_id ?? null;

  if (!userId) {
    const { data: profile } = await sb
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (profile?.id) userId = profile.id as string;
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("tenant_admins")
    .upsert(
      {
        tenant_id: tenantId,
        email,
        user_id: userId,
        status: parsed.data.status,
        updated_at: now,
      },
      { onConflict: "tenant_id,email" }
    )
    .select("id, tenant_id, user_id, email, status, created_at, updated_at")
    .single();

  if (error) {
    // unique index is on (tenant_id, lower(email)) — upsert onConflict may not match.
    // Fall back to insert-or-update manually.
    const existing = await sb
      .from("tenant_admins")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", email)
      .maybeSingle();

    if (existing.data?.id) {
      const updated = await sb
        .from("tenant_admins")
        .update({
          user_id: userId,
          status: parsed.data.status,
          updated_at: now,
        })
        .eq("id", existing.data.id)
        .select("id, tenant_id, user_id, email, status, created_at, updated_at")
        .single();
      if (updated.error) {
        throw ApiError.internal(
          `Failed to upsert tenant admin: ${updated.error.message}`,
          "tenant_admin_failed"
        );
      }
      return updated.data;
    }

    throw ApiError.internal(
      `Failed to add tenant admin: ${error.message}`,
      "tenant_admin_failed"
    );
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.admin.upsert",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: { email, status: parsed.data.status },
    status: "succeeded",
    resultPayload: { id: data.id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return data;
}

export async function removeAdminTenantAdmin(
  tenantId: string,
  adminId: string,
  ctx: WriteCtx
) {
  const sb = requireDb();
  const { data, error } = await sb
    .from("tenant_admins")
    .delete()
    .eq("id", adminId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to remove tenant admin: ${error.message}`,
      "tenant_admin_delete_failed"
    );
  }
  if (!data) {
    throw new ApiError({
      status: 404,
      message: "Tenant admin not found.",
      code: "tenant_admin_not_found",
      type: "not_found",
    });
  }

  await recordAdminAuditLog({
    actorUserId: ctx.adminUser.userId,
    actorEmail: ctx.adminUser.email,
    action: "tenant.admin.delete",
    resourceType: RESOURCE,
    resourceId: tenantId,
    requestPayload: { admin_id: adminId },
    status: "succeeded",
    resultPayload: { id: adminId },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return { ok: true };
}

export async function getAdminTenantUsers(tenantId: string) {
  const sb = requireDb();
  const userIds = new Set<string>();

  const [keys, usage, orders] = await Promise.all([
    sb.from("api_keys").select("user_id").eq("tenant_id", tenantId),
    sb.from("usage_logs").select("user_id").eq("tenant_id", tenantId).limit(5000),
    sb.from("credit_orders").select("user_id").eq("tenant_id", tenantId).limit(5000),
  ]);

  for (const row of keys.data ?? []) {
    if (row.user_id) userIds.add(row.user_id as string);
  }
  for (const row of usage.data ?? []) {
    if (row.user_id) userIds.add(row.user_id as string);
  }
  for (const row of orders.data ?? []) {
    if (row.user_id) userIds.add(row.user_id as string);
  }

  if (userIds.size === 0) return [];

  const ids = [...userIds];
  const { data: profiles, error } = await sb
    .from("profiles")
    .select(
      "id, email, credits_balance, total_credits_purchased, total_credits_used, created_at"
    )
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    throw ApiError.internal(
      `Failed to load tenant users: ${error.message}`,
      "tenant_users_failed"
    );
  }

  return profiles ?? [];
}

export async function getAdminTenantUsage(tenantId: string, limit = 100) {
  const sb = requireDb();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await sb
    .from("usage_logs")
    .select(
      "id, user_id, api_key_id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw ApiError.internal(
      `Failed to load tenant usage: ${error.message}`,
      "tenant_usage_failed"
    );
  }
  return data ?? [];
}

/**
 * Revenue ≈ sum(credits_charged) + paid order credits.
 * Cost estimate ≈ revenue / average markup (admin-only heuristic; no upstream names).
 */
export async function getAdminTenantEconomics(tenantId: string) {
  const sb = requireDb();

  const [usageAgg, ordersAgg, tenant] = await Promise.all([
    sb
      .from("usage_logs")
      .select("credits_charged, status")
      .eq("tenant_id", tenantId)
      .limit(10000),
    sb
      .from("credit_orders")
      .select("credits, amount_cents, status")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .limit(5000),
    sb
      .from("tenants")
      .select("base_price_multiplier")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);

  let usageCredits = 0;
  let usageRequests = 0;
  for (const row of usageAgg.data ?? []) {
    usageRequests += 1;
    usageCredits += Number(row.credits_charged ?? 0) || 0;
  }

  let paidOrderCredits = 0;
  let paidOrderCents = 0;
  for (const row of ordersAgg.data ?? []) {
    paidOrderCredits += Number(row.credits ?? 0) || 0;
    paidOrderCents += Number(row.amount_cents ?? 0) || 0;
  }

  const multiplier = toMultiplier(
    (tenant.data as { base_price_multiplier?: number | string } | null)
      ?.base_price_multiplier
  );
  // Heuristic: assume platform markup embeds ~multiplier over cost basis.
  const estimatedCostCredits =
    multiplier > 1 ? usageCredits / multiplier : usageCredits * 0.6;
  const estimatedGrossMarginCredits = usageCredits - estimatedCostCredits;

  return {
    usage_requests: usageRequests,
    usage_credits_charged: usageCredits,
    paid_order_credits: paidOrderCredits,
    paid_order_amount_cents: paidOrderCents,
    base_price_multiplier: multiplier,
    estimated_cost_credits: Math.round(estimatedCostCredits * 1e6) / 1e6,
    estimated_gross_margin_credits:
      Math.round(estimatedGrossMarginCredits * 1e6) / 1e6,
    note: "Cost is an internal estimate from tenant multiplier; upstream vendor names are not exposed.",
  };
}

/** Resolve tenant_id from request Host / X-Tokfai-Host for consumer writes. */
export async function resolveTenantIdFromRequestHeaders(headers: {
  get: (name: string) => string | undefined;
}): Promise<string | null> {
  const host =
    headers.get("x-tokfai-host")?.trim() ||
    headers.get("x-forwarded-host")?.trim() ||
    headers.get("host")?.trim() ||
    null;

  const { resolveTenantByHost } = await import("../tenants/resolve.js");
  const { tenant } = await resolveTenantByHost(host);
  return tenant?.id ?? null;
}
