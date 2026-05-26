import { redirect } from "next/navigation";

import { AdminModelsCatalogPanel } from "@/components/admin-models-catalog-panel";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Models & pricing",
};

export default async function AdminModelsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/models");
  }

  return (
    <>
      <div>
        <Badge variant="secondary">Admin tools</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Models & pricing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Catalog pricing overview. Read-only in this phase. Actual charges are
          recorded in Usage and Credits.
        </p>
      </div>

      <AdminModelsCatalogPanel />
    </>
  );
}
