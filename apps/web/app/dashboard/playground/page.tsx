import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { dmitServerFetch, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  PlaygroundClient,
  type PlaygroundApiKeyOption,
} from "./playground-client";

export const metadata = {
  title: "Playground",
};

export const dynamic = "force-dynamic";

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams?: { model?: string };
}) {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/playground");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? "";
  const activeKeys = accessToken ? await loadActiveKeys(accessToken) : [];

  return (
    <PlaygroundClient
      accessToken={accessToken}
      activeKeys={activeKeys}
      initialModel={searchParams?.model}
    />
  );
}

async function loadActiveKeys(
  accessToken: string
): Promise<PlaygroundApiKeyOption[]> {
  const path = "/v1/me/api-keys";
  try {
    const res = await dmitServerFetch<
      | { data: PlaygroundApiKeyOption[] }
      | { ok: true; keys: PlaygroundApiKeyOption[] }
    >(path, accessToken);
    const rows = "data" in res ? res.data : res.keys;
    return rows.filter((row) => row.status === "active");
  } catch {
    return [];
  }
}
