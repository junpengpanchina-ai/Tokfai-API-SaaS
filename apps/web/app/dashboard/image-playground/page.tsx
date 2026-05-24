import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { dmitServerFetch } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  ImagePlaygroundClient,
  type ImagePlaygroundApiKeyOption,
} from "./image-playground-client";

export const metadata = {
  title: "Image Playground",
};

export const dynamic = "force-dynamic";

export default async function ImagePlaygroundPage({
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
    redirect("/login?redirect=/dashboard/image-playground");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? "";
  const activeKeys = accessToken ? await loadActiveKeys(accessToken) : [];

  return (
    <ImagePlaygroundClient
      accessToken={accessToken}
      userId={user.id}
      activeKeys={activeKeys}
      initialModel={searchParams?.model}
    />
  );
}

async function loadActiveKeys(
  accessToken: string
): Promise<ImagePlaygroundApiKeyOption[]> {
  const path = "/v1/me/api-keys";
  try {
    const res = await dmitServerFetch<
      | { data: ImagePlaygroundApiKeyOption[] }
      | { ok: true; keys: ImagePlaygroundApiKeyOption[] }
    >(path, accessToken);
    const rows = "data" in res ? res.data : res.keys;
    return rows.filter((row) => row.status === "active");
  } catch {
    return [];
  }
}
