import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { dmitServerFetch } from "@/lib/dmit/server";
import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import { loadDashboardPageSession } from "@/lib/dashboard-safe/server-session";
import { EMPTY_SHELL_CREDITS } from "@/lib/dashboard-safe/shell-credits";

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

  const { user, session, error } = await loadDashboardPageSession();

  if (error) {
    return (
      <ImagePlaygroundClient
        accessToken=""
        activeKeys={[]}
        initialModel={searchParams?.model}
        initialCreditsBalance={EMPTY_SHELL_CREDITS.balance}
        creditsLoaded={false}
      />
    );
  }

  if (!user) {
    redirect(loginPathWithNext("/dashboard/image-playground"));
  }

  const accessToken = session?.access_token ?? "";
  const activeKeys = accessToken ? await loadActiveKeys(accessToken) : [];
  const shellCredits = await loadDashboardShellCredits(user.id);

  return (
    <ImagePlaygroundClient
      accessToken={accessToken}
      activeKeys={activeKeys}
      initialModel={searchParams?.model}
      initialCreditsBalance={shellCredits.balance}
      creditsLoaded={shellCredits.loaded}
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
