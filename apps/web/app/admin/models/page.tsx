import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  AdminModelsClient,
  type AdminModel,
} from "./admin-models-client";

export const metadata = {
  title: "Admin — Models",
};

type ModelsResponse = {
  data: AdminModel[];
};

export default async function AdminModelsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/models");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  let initialModels: AdminModel[] = [];
  let initialError: string | null = null;

  if (!accessToken) {
    initialError = "Missing session token. Please sign in again.";
  } else {
    try {
      const res = await fetch(`${getDmitBaseUrl()}/admin/models`, {
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

      const parsed = body as ModelsResponse;
      initialModels = Array.isArray(parsed.data) ? parsed.data : [];
    } catch (error) {
      if (error instanceof DmitServerError) {
        initialError =
          error.status === 403
            ? "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist."
            : error.message;
      } else if (error instanceof Error) {
        initialError = error.message;
      } else {
        initialError = "Models could not be loaded.";
      }
    }
  }

  return (
    <DashboardShell>
      <AdminModelsClient
        initialModels={initialModels}
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
