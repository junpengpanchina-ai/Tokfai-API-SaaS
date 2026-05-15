import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ApiKeysClient } from "./api-keys-client";

export const metadata = {
  title: "API Keys",
};

export default async function ApiKeysPage() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login?redirect=/dashboard/api-keys");
  }

  return <ApiKeysClient accessToken={session.access_token} />;
}
