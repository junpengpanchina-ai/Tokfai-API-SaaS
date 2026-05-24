import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  AdminCreditsClient,
  type AdminCreditsData,
} from "./admin-credits-client";

export const metadata = {
  title: "Admin — Credits",
};

export const dynamic = "force-dynamic";

type CreditsResponse = {
  data?: AdminCreditsData;
};

export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  noStore();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/credits");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/credits");
  }

  const initialEmail = (searchParams.email ?? "").trim();
  let initialData: AdminCreditsData | null = null;
  let initialError: string | null = null;

  if (initialEmail) {
    try {
      const url = new URL(`${getDmitBaseUrl()}/admin/credits`);
      url.searchParams.set("email", initialEmail);
      url.searchParams.set("limit", "50");

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const text = await res.text();
      const body = parseJson(text);

      if (!res.ok) {
        throw toDmitServerError(res.status, body);
      }

      initialData = (body as CreditsResponse).data ?? null;
    } catch (error) {
      if (error instanceof DmitServerError) {
        if (error.status === 403) {
          initialError =
            "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist.";
        } else if (error.status === 404) {
          initialError = `No profile found for ${initialEmail}.`;
        } else {
          initialError = error.message;
        }
      } else if (error instanceof Error) {
        initialError = error.message;
      } else {
        initialError = "Credits data could not be loaded.";
      }
    }
  }

  return (
    <DashboardShell>
      <AdminCreditsClient
        accessToken={accessToken}
        initialEmail={initialEmail}
        initialData={initialData}
        initialError={initialError}
      />
    </DashboardShell>
  );
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toDmitServerError(status: number, body: unknown): DmitServerError {
  let message = `DMIT request failed (HTTP ${status}).`;
  let code: string | undefined;

  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown }).error;
    if (maybeError && typeof maybeError === "object") {
      const err = maybeError as { message?: unknown; code?: unknown };
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "string") code = err.code;
    } else if (typeof maybeError === "string") {
      message = maybeError;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new DmitServerError({ status, message, code });
}
