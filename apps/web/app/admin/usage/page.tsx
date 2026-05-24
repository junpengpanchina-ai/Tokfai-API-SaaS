import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  AdminUsageClient,
  type AdminUsageLog,
} from "./admin-usage-client";

export const metadata = {
  title: "Admin — Usage",
};

export const dynamic = "force-dynamic";

type UsageResponse = {
  data?: AdminUsageLog[];
};

export default async function AdminUsagePage() {
  noStore();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/usage");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/usage");
  }

  let initialLogs: AdminUsageLog[] = [];
  let initialError: string | null = null;

  try {
    const res = await fetch(`${getDmitBaseUrl()}/admin/usage`, {
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

    initialLogs = Array.isArray((body as UsageResponse).data)
      ? (body as UsageResponse).data!
      : [];
  } catch (error) {
    if (error instanceof DmitServerError) {
      initialError =
        error.status === 403
          ? "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist."
          : error.message;
    } else if (error instanceof Error) {
      initialError = error.message;
    } else {
      initialError = "Usage logs could not be loaded.";
    }
  }

  return (
    <DashboardShell>
      <AdminUsageClient
        accessToken={accessToken}
        initialLogs={initialLogs}
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
