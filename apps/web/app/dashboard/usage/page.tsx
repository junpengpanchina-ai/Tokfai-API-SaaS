import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DmitServerError,
  type MeUsageLogEntry,
  listMyUsage,
} from "@/lib/dmit/server";
import {
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  toneForStatus,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Usage",
};

export const dynamic = "force-dynamic";

type UsageState =
  | { status: "ready"; logs: MeUsageLogEntry[] }
  | { status: "error"; message: string; code?: string; httpStatus?: number };

export default async function UsagePage() {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/usage");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return (
      <UsageView
        state={{
          status: "error",
          message: "请重新登录",
          code: "missing_session",
          httpStatus: 401,
        }}
      />
    );
  }

  const state = await loadUsage(session.access_token);
  return <UsageView state={state} />;
}

async function loadUsage(accessToken: string): Promise<UsageState> {
  try {
    const logs = await listMyUsage(accessToken, 50);
    return { status: "ready", logs };
  } catch (err) {
    if (err instanceof DmitServerError) {
      return {
        status: "error",
        message:
          err.status === 401 || err.status === 403
            ? "请重新登录"
            : "Usage 暂时无法加载，请稍后重试",
        code: err.code,
        httpStatus: err.status,
      };
    }
    return {
      status: "error",
      message: "Usage 暂时无法加载，请稍后重试",
    };
  }
}

function UsageView({ state }: { state: UsageState }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent API activity for your account. Data is loaded from Tokfai API
          and scoped to your login.
        </p>
      </div>

      {state.status === "error" ? <UsageError state={state} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>
            Last 50 entries, newest first. Run a request in the{" "}
            <Link
              href="/dashboard/playground"
              className="underline underline-offset-4"
            >
              Playground
            </Link>{" "}
            to generate more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.status === "ready" && state.logs.length > 0 ? (
            <UsageTable logs={state.logs} />
          ) : state.status === "ready" ? (
            <EmptyState />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageError({
  state,
}: {
  state: Extract<UsageState, { status: "error" }>;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Could not load usage
        </CardTitle>
        <CardDescription>{state.message}</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-xs text-muted-foreground">
        status={state.httpStatus ?? "n/a"} code={state.code ?? "n/a"}
      </CardContent>
    </Card>
  );
}

function UsageTable({ logs }: { logs: MeUsageLogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Model</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 text-right font-medium">Prompt</th>
            <th className="py-2 pr-4 text-right font-medium">Completion</th>
            <th className="py-2 pr-4 text-right font-medium">Total</th>
            <th className="py-2 pr-4 text-right font-medium">Credits</th>
            <th className="py-2 pr-4 font-medium">Request ID</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-2 pr-4 text-muted-foreground">
                {formatDateTime(row.created_at)}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.model ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={row.status} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatNullableInt(row.prompt_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatNullableInt(row.completion_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatNullableInt(row.total_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatNullableCredits(row.credits_charged)}
              </td>
              <td className="max-w-[12rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground">
                {truncateRequestId(row.request_id)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = toneForStatus(status);
  const label = tone === "success" ? "succeeded" : "failed";
  if (tone === "success") {
    return <Badge variant="success">{label}</Badge>;
  }
  return <Badge variant="destructive">{label}</Badge>;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Gauge className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">
        No API usage yet. Run your first request in Playground.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/playground">Open Playground</Link>
      </Button>
    </div>
  );
}

function formatNullableInt(value: number | null | undefined): string {
  if (value == null) return "-";
  return formatInt(value);
}

function formatNullableCredits(
  value: number | string | null | undefined
): string {
  if (value == null || value === "") return "-";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "-";
  return formatCreditsPrecise(n);
}

function truncateRequestId(requestId: string | null | undefined) {
  if (!requestId) return "-";
  if (requestId.length <= 16) return requestId;
  return `${requestId.slice(0, 8)}...${requestId.slice(-6)}`;
}
