/**
 * Consumer-facing tenant config (no upstream / cost fields).
 */

export type PublicTenantConfig = {
  id: string | null;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_domain: string | null;
  default_locale: string;
  is_main: boolean;
};

export const MAIN_TENANT: PublicTenantConfig = {
  id: null,
  name: "Tokfai",
  slug: "tokfai",
  logo_url: null,
  primary_domain: "tokfai.com",
  default_locale: "zh-CN",
  is_main: true,
};

export function getBrowserTokfaiHost(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.host || null;
}

export function tokfaiHostHeaders(
  host?: string | null
): Record<string, string> {
  const value =
    (host && host.trim()) ||
    getBrowserTokfaiHost() ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "") ||
    "";
  if (!value) return {};
  return { "X-Tokfai-Host": value.split("/")[0] ?? value };
}

export async function resolveTenantByHost(
  host: string,
  apiBase?: string
): Promise<PublicTenantConfig> {
  const base =
    apiBase ||
    process.env.NEXT_PUBLIC_DMIT_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "https://api.tokfai.com";
  const normalizedBase = base.replace(/\/$/, "").replace(/\/v1$/, "");
  const url = `${normalizedBase}/v1/tenant/resolve?host=${encodeURIComponent(host)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) return MAIN_TENANT;
    const body = (await res.json()) as { tenant?: PublicTenantConfig };
    if (body.tenant && typeof body.tenant.name === "string") {
      return body.tenant;
    }
  } catch {
    /* fall through */
  }
  return MAIN_TENANT;
}
