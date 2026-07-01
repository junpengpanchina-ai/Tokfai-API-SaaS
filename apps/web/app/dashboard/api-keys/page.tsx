import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { ApiKeysErrorView } from "./api-keys-error-view";
import {
  DmitServerError,
  dmitServerFetch,
  getDmitBaseUrl,
} from "@/lib/dmit/server";
import { loadDashboardPageSession } from "@/lib/dashboard-safe/server-session";

import {
  ApiKeysClient,
  type ApiKeyListItem,
} from "./api-keys-client";

export const metadata = {
  title: "API Keys",
};

export const dynamic = "force-dynamic";

type ApiKeysState =
  | { status: "ready"; keys: ApiKeyListItem[] }
  | {
      status: "error";
      messageKey: "auth" | "load";
      code?: string;
      httpStatus?: number;
      message?: string;
      method: string;
      url: string;
    };

export default async function ApiKeysPage() {
  noStore();
  const path = "/v1/me/api-keys";
  const apiKeysUrl = `${getDmitBaseUrl()}${path}`;

  const { user, session, error } = await loadDashboardPageSession();

  if (error) {
    return (
      <ApiKeysClient
        accessToken=""
        initialKeys={[]}
        listLoadFailed
        listLoadError={{
          message: "Dashboard session is temporarily unavailable.",
        }}
      />
    );
  }

  if (!user) {
    redirect(loginPathWithNext("/dashboard/api-keys"));
  }

  if (!session?.access_token) {
    return (
      <ApiKeysErrorView
        messageKey="auth"
        code="missing_session"
        httpStatus={401}
        method="GET"
        url={apiKeysUrl}
      />
    );
  }

  const state = await loadApiKeys(session.access_token);

  if (state.status === "error" && state.messageKey === "auth") {
    return (
      <ApiKeysErrorView
        messageKey={state.messageKey}
        code={state.code}
        httpStatus={state.httpStatus}
        method={state.method}
        url={state.url}
      />
    );
  }

  return (
    <ApiKeysClient
      accessToken={session.access_token}
      initialKeys={state.status === "ready" ? state.keys : []}
      listLoadFailed={state.status === "error"}
      listLoadError={
        state.status === "error"
          ? {
              message: state.message,
              code: state.code,
              httpStatus: state.httpStatus,
            }
          : undefined
      }
    />
  );
}

async function loadApiKeys(accessToken: string): Promise<ApiKeysState> {
  const path = "/v1/me/api-keys";
  const url = `${getDmitBaseUrl()}${path}`;
  try {
    const res = await dmitServerFetch<
      { data: ApiKeyListItem[] } | { ok: true; keys: ApiKeyListItem[] }
    >(path, accessToken);
    return {
      status: "ready",
      keys: "data" in res ? res.data : res.keys,
    };
  } catch (err) {
    if (err instanceof DmitServerError) {
      return {
        status: "error",
        messageKey:
          err.status === 401 || err.status === 403 ? "auth" : "load",
        code: err.code,
        httpStatus: err.status,
        message: err.message,
        method: "GET",
        url,
      };
    }
    return {
      status: "error",
      messageKey: "load",
      message: "Unable to load API keys. Please try again later.",
      method: "GET",
      url,
    };
  }
}
