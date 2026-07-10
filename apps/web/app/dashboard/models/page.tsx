import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { listCatalogModelPricing } from "@/lib/dmit/server";
import { buildModelsClientData } from "@/lib/models-page-server";
import { buildFallbackModelsClientData } from "@/lib/dashboard-safe/catalog-fallback";
import { loadDashboardPageSession, rethrowIfNextNavigation } from "@/lib/dashboard-safe/server-session";

import { ModelsClient } from "./models-client";

export const metadata = {
  title: "Models",
};

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  try {
    const { session, error } = await loadDashboardPageSession();

    if (error) {
      return <ModelsClient modelsData={buildFallbackModelsClientData()} />;
    }

    if (!session?.user) {
      redirect(loginPathWithNext("/dashboard/models"));
    }

    let catalogPricing = [] as Awaited<ReturnType<typeof listCatalogModelPricing>>;
    try {
      catalogPricing = await listCatalogModelPricing(session.access_token);
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "models/catalogPricing", err);
      catalogPricing = [];
    }

    const modelsData = buildModelsClientData(catalogPricing);

    return <ModelsClient modelsData={modelsData} />;
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "models/page", err);
    return <ModelsClient modelsData={buildFallbackModelsClientData()} />;
  }
}
