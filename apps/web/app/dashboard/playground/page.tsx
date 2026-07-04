import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { dmitServerFetch } from "@/lib/dmit/server";
import { loadDashboardPageSession } from "@/lib/dashboard-safe/server-session";

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

  try {
    const { user, session, error } = await loadDashboardPageSession();

    if (error) {
      return (
        <PlaygroundClient
          accessToken=""
          activeKeys={[]}
          initialModel={searchParams?.model}
        />
      );
    }

    if (!user) {
      redirect(loginPathWithNext("/dashboard/playground"));
    }

    const accessToken = session?.access_token ?? "";
    let activeKeys: PlaygroundApiKeyOption[] = [];
    try {
      activeKeys = accessToken ? await loadActiveKeys(accessToken) : [];
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "playground/activeKeys", err);
    }

    return (
      <PlaygroundClient
        accessToken={accessToken}
        activeKeys={activeKeys}
        initialModel={searchParams?.model}
      />
    );
  } catch (err) {
    console.error("[dashboard-ssr-fail-open]", "playground/page", err);
    return (
      <PlaygroundClient
        accessToken=""
        activeKeys={[]}
        initialModel={searchParams?.model}
      />
    );
  }
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
  } catch (err) {
    console.error("[dashboard-ssr-fail-open]", "playground/loadActiveKeys", err);
    return [];
  }
}
