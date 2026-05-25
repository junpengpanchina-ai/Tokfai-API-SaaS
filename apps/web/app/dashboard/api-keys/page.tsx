import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

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
      message: string;
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
    redirect("/login?redirect=/dashboard/api-keys");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return (
      <ApiKeysErrorView
        message="登录状态异常，请重新登录。"
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
      message={state.message}
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
        message:
          err.status === 401 || err.status === 403
            ? "登录状态异常，请重新登录。"
            : "API Keys 暂时无法加载，请稍后重试。",
        code: err.code,
        httpStatus: err.status,
        method: "GET",
        url,
      };
    }
    return {
      status: "error",
      message: "API Keys 暂时无法加载，请稍后重试。",
      method: "GET",
      url,
    };
  }
}
