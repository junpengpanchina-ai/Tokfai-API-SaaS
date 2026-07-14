import type { Metadata } from "next";
import { headers } from "next/headers";

import { AuthProviderWrapper } from "@/components/auth-provider-wrapper";
import { TenantProvider } from "@/components/tenant-provider";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import {
  MAIN_TENANT,
  resolveTenantByHost,
  type PublicTenantConfig,
} from "@/lib/tenant/resolve";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await loadRequestTenant();
  const brand = tenant.name || "Tokfai";
  return {
    title: {
      default: `${brand} — OpenAI-compatible image & chat API`,
      template: `%s · ${brand}`,
    },
    description:
      "OpenAI-compatible image & chat API — one API for chat, image, and AI apps.",
  };
}

async function loadRequestTenant(): Promise<PublicTenantConfig> {
  const h = headers();
  const host =
    h.get("x-tokfai-host") ||
    h.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    h.get("host") ||
    "";
  if (!host) return MAIN_TENANT;
  return resolveTenantByHost(host);
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await loadRequestTenant();

  return (
    <html lang={tenant.default_locale?.startsWith("zh") ? "zh" : "en"} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <I18nProvider>
          <TenantProvider tenant={tenant}>
            <AuthProviderWrapper>{children}</AuthProviderWrapper>
          </TenantProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
