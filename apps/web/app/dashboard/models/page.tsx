import { redirect } from "next/navigation";

import { listCatalogModelPricing } from "@/lib/dmit/server";
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
    redirect("/login?redirect=/dashboard/models");
  }

  let catalogPricing = [] as Awaited<ReturnType<typeof listCatalogModelPricing>>;
  try {
    catalogPricing = await listCatalogModelPricing(session.access_token);
  } catch {
    catalogPricing = [];
  }

  return <ModelsClient catalogPricing={catalogPricing} />;
}
