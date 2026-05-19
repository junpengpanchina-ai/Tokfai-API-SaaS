import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DmitServerError, dmitServerFetch } from "@/lib/dmit/server";
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
  | { status: "error"; message: string; code?: string; httpStatus?: number };

export default async function ApiKeysPage() {
  noStore();

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
      <ApiKeysView
        state={{
          status: "error",
          message: "登录状态异常，请重新登录。",
          code: "missing_session",
          httpStatus: 401,
        }}
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

  return <ApiKeysView state={state} />;
}

async function loadApiKeys(accessToken: string): Promise<ApiKeysState> {
  try {
    const res = await dmitServerFetch<{ ok: true; keys: ApiKeyListItem[] }>(
      "/v1/me/api-keys",
      accessToken
    );
    return { status: "ready", keys: res.keys };
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
      };
    }
    return {
      status: "error",
      message: "API Keys 暂时无法加载，请稍后重试。",
    };
  }
}

function ApiKeysView({ state }: { state: ApiKeysState }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View API key metadata for your Tokfai account.
        </p>
      </div>

      {state.status === "error" ? <ApiKeysError state={state} /> : null}
    </div>
  );
}

function ApiKeysError({
  state,
}: {
  state: Extract<ApiKeysState, { status: "error" }>;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Could not load API keys
        </CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-xs text-muted-foreground">
        status={state.httpStatus ?? "n/a"} code={state.code ?? "n/a"}
      </CardContent>
    </Card>
  );
}
