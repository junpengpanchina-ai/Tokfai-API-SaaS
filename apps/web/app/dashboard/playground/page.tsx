import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { dmitServerFetch } from "@/lib/dmit/server";
import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import { loadDashboardPageSession, rethrowIfNextNavigation } from "@/lib/dashboard-safe/server-session";
import { EMPTY_SHELL_CREDITS } from "@/lib/dashboard-safe/shell-credits";

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
          initialCreditsBalance={EMPTY_SHELL_CREDITS.balance}
          creditsLoaded={false}
        />
      );
    }

    if (!user) {
      redirect(loginPathWithNext("/dashboard/playground"));
    }

    const accessToken = session?.access_token ?? "";
    let activeKeys: PlaygroundApiKeyOption[] = [];
    let shellCredits = EMPTY_SHELL_CREDITS;
    try {
      activeKeys = accessToken ? await loadActiveKeys(accessToken) : [];
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "playground/activeKeys", err);
    }
    try {
      shellCredits = await loadDashboardShellCredits(user.id);
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "playground/credits", err);
    }

    return (
      <PlaygroundClient
        accessToken={accessToken}
        activeKeys={activeKeys}
        initialModel={searchParams?.model}
        initialCreditsBalance={shellCredits.balance}
        creditsLoaded={shellCredits.loaded}
      />
    );
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "playground/page", err);
    return (
      <PlaygroundClient
        accessToken=""
        activeKeys={[]}
        initialModel={searchParams?.model}
        initialCreditsBalance={EMPTY_SHELL_CREDITS.balance}
        creditsLoaded={false}
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
