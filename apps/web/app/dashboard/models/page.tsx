import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { listCatalogModelPricing } from "@/lib/dmit/server";
import { buildModelsClientData } from "@/lib/models-page-server";
import { createClient } from "@/lib/supabase/server";

import { ModelsClient } from "./models-client";

export const metadata = {
  title: "Models",
};

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect(loginPathWithNext("/dashboard/models"));
  }

  let catalogPricing = [] as Awaited<ReturnType<typeof listCatalogModelPricing>>;
  try {
    catalogPricing = await listCatalogModelPricing(session.access_token);
  } catch {
    catalogPricing = [];
  }

  const modelsData = buildModelsClientData(catalogPricing);

  return <ModelsClient modelsData={modelsData} />;
}
