import { redirect } from "next/navigation";
import { AlertTriangle, KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DmitServerError, dmitServerFetch } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "API Keys",
};

interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
}

type ApiKeysState =
  | { status: "ready"; keys: ApiKeyListItem[] }
  | { status: "error"; message: string; code?: string; httpStatus?: number };

export default async function ApiKeysPage() {
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
          View API key metadata for your Tokfai account. Full secrets are never
          shown in the browser.
        </p>
      </div>

      {state.status === "error" ? <ApiKeysError state={state} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Your API keys</CardTitle>
          <CardDescription>
            Only prefixes and usage metadata are displayed. Create or reveal
            full secrets outside this read-only V0.3.1 view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "ready" && state.keys.length > 0 ? (
            <ApiKeysTable keys={state.keys} />
          ) : state.status === "ready" ? (
            <EmptyState />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysError({ state }: { state: Extract<ApiKeysState, { status: "error" }> }) {
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

function ApiKeysTable({ keys }: { keys: ApiKeyListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Prefix</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Last used</th>
            <th className="py-2 pr-4 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">{key.name}</td>
              <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                {key.key_prefix}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={key.status} />
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {formatDate(key.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "revoked") return <Badge variant="outline">Revoked</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <KeyRound className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">
        No API keys yet. Your keys will appear here after creation.
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
