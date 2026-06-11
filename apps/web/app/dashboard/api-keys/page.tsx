import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { ApiKeysErrorView } from "@/components/api-keys-error-view";
import {
  DmitServerError,
  dmitServerFetch,
  getDmitBaseUrl,
} from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

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
      messageKey: "auth" | "temp";
      code?: string;
      httpStatus?: number;
      method: string;
      url: string;
    };

export default async function ApiKeysPage() {
  noStore();
  const apiKeysUrl = `${getDmitBaseUrl()}/v1/me/api-keys`;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginPathWithNext("/dashboard/api-keys"));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

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

  if (state.status === "ready") {
    return (
      <ApiKeysClient
        accessToken={session.access_token}
        initialKeys={state.keys}
      />
    );
  }

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
          err.status === 401 || err.status === 403 ? "auth" : "temp",
        code: err.code,
        httpStatus: err.status,
        method: "GET",
        url,
      };
    }
    return {
      status: "error",
      messageKey: "temp",
      method: "GET",
      url,
    };
  }
}
