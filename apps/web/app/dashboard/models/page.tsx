import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ModelsClient } from "./models-client";

export const metadata = {
  title: "Models",
};

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/models");
  }

  return <ModelsClient />;
}
