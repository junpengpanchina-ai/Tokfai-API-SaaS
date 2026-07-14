/**
 * Tenant / 分站 resolution and pricing helpers (V1).
 *
 * Host rules:
 * - Primary Tokfai hosts → null tenant (main site)
 * - `{slug}.tokfai.com` → active tenant by slug or tenant_domains
 * - Custom domain → tenant_domains (status=active)
 */

import { supabaseAdmin, isSupabaseAdminConfigured } from "../supabase.js";

export type TenantStatus = "active" | "disabled";
export type TenantDomainType = "tokfai_subdomain" | "custom_domain";
export type TenantDomainLifecycle = "pending" | "active" | "disabled";
export type TenantSslDnsStatus = "pending" | "active" | "failed";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  logo_url: string | null;
  primary_domain: string | null;
  default_locale: string;
  base_price_multiplier: number | string;
  created_at: string;
  updated_at: string;
}

export interface TenantDomainRow {
  id: string;
  tenant_id: string;
  domain: string;
  domain_type: TenantDomainType;
  status: TenantDomainLifecycle;
  ssl_status: TenantSslDnsStatus;
  dns_status: TenantSslDnsStatus;
  created_at: string;
  updated_at: string;
}

export interface PublicTenantConfig {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_domain: string | null;
  default_locale: string;
  is_main: false;
}

export interface PublicMainSiteConfig {
  id: null;
  name: "Tokfai";
  slug: "tokfai";
  logo_url: null;
  primary_domain: string | null;
  default_locale: "zh-CN";
  is_main: true;
}

export type ResolvedTenantPublic = PublicTenantConfig | PublicMainSiteConfig;

const TENANT_SELECT =
  "id, name, slug, status, logo_url, primary_domain, default_locale, base_price_multiplier, created_at, updated_at";

const DOMAIN_SELECT =
  "id, tenant_id, domain, domain_type, status, ssl_status, dns_status, created_at, updated_at";

function parsePrimaryHosts(): string[] {
  const raw =
    process.env.TOKFAI_PRIMARY_HOSTS ??
    "tokfai.com,www.tokfai.com,localhost,127.0.0.1";
  return raw
    .split(",")
    .map((h) => normalizeHost(h))
    .filter(Boolean);
}

function parseTenantBaseDomain(): string {
  return normalizeHost(
    process.env.TOKFAI_TENANT_BASE_DOMAIN ?? "tokfai.com"
  );
}

export function tenantCnameTarget(): string {
  return (
    process.env.TOKFAI_TENANT_CNAME_TARGET?.trim() ||
    `cname.${parseTenantBaseDomain()}`
  );
}

export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[")) {
    // IPv6 literals — keep as-is without port stripping complexity
    const end = host.indexOf("]");
    if (end >= 0) host = host.slice(0, end + 1);
  } else {
    const colon = host.lastIndexOf(":");
    if (colon > 0 && host.includes(".") === false && /^\d+$/.test(host.slice(colon + 1))) {
      host = host.slice(0, colon);
    } else if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) {
      host = host.slice(0, colon);
    }
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

export function isPrimaryHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  const primaries = parsePrimaryHosts();
  if (primaries.includes(normalized)) return true;
  // api.* is never a consumer tenant host
  if (normalized.startsWith("api.")) return true;
  return false;
}

/** Slugs that must never be registered as tenant subsites. */
export const RESERVED_TENANT_SLUGS = new Set([
  "www",
  "api",
  "cname",
  "tokfai",
  "admin",
  "app",
  "dashboard",
  "docs",
  "static",
  "assets",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "status",
  "support",
  "help",
  "billing",
  "stripe",
  "webhook",
  "webhooks",
]);

export function isReservedTenantSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  return RESERVED_TENANT_SLUGS.has(normalized);
}

function subdomainSlug(host: string): string | null {
  const base = parseTenantBaseDomain();
  const normalized = normalizeHost(host);
  if (!normalized || isPrimaryHost(normalized)) return null;
  if (!normalized.endsWith(`.${base}`)) return null;
  const slug = normalized.slice(0, -(base.length + 1));
  if (!slug || slug.includes(".")) return null;
  if (isReservedTenantSlug(slug)) return null;
  return slug;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function mainSitePublic(): PublicMainSiteConfig {
  const primaries = parsePrimaryHosts();
  return {
    id: null,
    name: "Tokfai",
    slug: "tokfai",
    logo_url: null,
    primary_domain: primaries[0] ?? "tokfai.com",
    default_locale: "zh-CN",
    is_main: true,
  };
}

function toPublicTenant(row: TenantRow): PublicTenantConfig {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    primary_domain: row.primary_domain,
    default_locale: row.default_locale || "zh-CN",
    is_main: false,
  };
}

async function fetchTenantById(id: string): Promise<TenantRow | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data, error } = await supabaseAdmin()
    .from("tenants")
    .select(TENANT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantRow;
}

async function fetchActiveTenantBySlug(slug: string): Promise<TenantRow | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data, error } = await supabaseAdmin()
    .from("tenants")
    .select(TENANT_SELECT)
    .ilike("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantRow;
}

async function fetchActiveTenantByDomain(
  domain: string
): Promise<TenantRow | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data: domainRow, error } = await supabaseAdmin()
    .from("tenant_domains")
    .select("tenant_id")
    .ilike("domain", domain)
    .eq("status", "active")
    .maybeSingle();
  if (error || !domainRow?.tenant_id) return null;
  const tenant = await fetchTenantById(domainRow.tenant_id as string);
  if (!tenant || tenant.status !== "active") return null;
  return tenant;
}

/**
 * Resolve tenant from HTTP Host (or X-Tokfai-Host override).
 * Returns null tenant_id semantics via is_main for the public payload.
 */
export async function resolveTenantByHost(
  hostRaw: string | null | undefined
): Promise<{
  tenant: TenantRow | null;
  public: ResolvedTenantPublic;
}> {
  const host = normalizeHost(hostRaw);
  if (!host || isPrimaryHost(host)) {
    return { tenant: null, public: mainSitePublic() };
  }

  const byDomain = await fetchActiveTenantByDomain(host);
  if (byDomain) {
    return { tenant: byDomain, public: toPublicTenant(byDomain) };
  }

  const slug = subdomainSlug(host);
  if (slug) {
    const bySlug = await fetchActiveTenantBySlug(slug);
    if (bySlug) {
      return { tenant: bySlug, public: toPublicTenant(bySlug) };
    }
  }

  return { tenant: null, public: mainSitePublic() };
}

export async function getTenantPriceMultiplier(
  tenantId: string | null | undefined,
  modelId: string
): Promise<number> {
  if (!tenantId || !isSupabaseAdminConfigured()) return 1;

  const tenant = await fetchTenantById(tenantId);
  if (!tenant || tenant.status !== "active") return 1;

  const { data: rule } = await supabaseAdmin()
    .from("tenant_pricing_rules")
    .select("price_multiplier")
    .eq("tenant_id", tenantId)
    .eq("model_id", modelId)
    .maybeSingle();

  if (rule?.price_multiplier != null) {
    const m = toNumber(rule.price_multiplier as number | string);
    return m > 0 ? m : 1;
  }

  const base = toNumber(tenant.base_price_multiplier);
  return base > 0 ? base : 1;
}

/**
 * Returns false when the tenant explicitly disables the model.
 * Missing setting → inherit main catalog (true here; caller still checks catalog).
 */
export async function isModelEnabledForTenant(
  tenantId: string | null | undefined,
  modelId: string
): Promise<boolean> {
  if (!tenantId || !isSupabaseAdminConfigured()) return true;

  const { data } = await supabaseAdmin()
    .from("tenant_model_settings")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("model_id", modelId)
    .maybeSingle();

  if (!data) return true;
  return data.enabled !== false;
}

export async function applyTenantPriceMultiplier(
  baseCredits: number,
  tenantId: string | null | undefined,
  modelId: string
): Promise<number> {
  if (!(baseCredits > 0) || !tenantId) return baseCredits;
  const multiplier = await getTenantPriceMultiplier(tenantId, modelId);
  if (multiplier === 1) return baseCredits;
  return baseCredits * multiplier;
}

export { TENANT_SELECT, DOMAIN_SELECT, toPublicTenant, mainSitePublic };
