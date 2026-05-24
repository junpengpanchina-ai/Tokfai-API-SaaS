import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { AlertTriangle, Gauge, ImageIcon, MessageSquare } from "lucide-react";

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
import { formatDateTime, toneForStatus } from "@/lib/format";
import {
  formatUsageCredits,
  formatUsageTokenCell,
  getUsageKind,
  usageKindLabel,
  type UsageKind,
} from "@/lib/usage-display";
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
        <p className="mt-1 text-sm text-muted-foreground">
          Chat calls show token usage. Image calls show credits charged.
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
              Chat Playground
            </Link>{" "}
            or{" "}
            <Link
              href="/dashboard/image-playground"
              className="underline underline-offset-4"
            >
              Image Playground
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
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium whitespace-nowrap">When</th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">Type</th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">Model</th>
            <th className="py-2 pr-3 font-medium whitespace-nowrap">Status</th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap md:table-cell">
              Prompt
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap lg:table-cell">
              Completion
            </th>
            <th className="hidden py-2 pr-3 text-right font-medium whitespace-nowrap sm:table-cell">
              Total
            </th>
            <th className="py-2 pr-3 text-right font-medium whitespace-nowrap">
              Credits
            </th>
            <th className="hidden py-2 pr-3 font-medium whitespace-nowrap xl:table-cell">
              Request ID
            </th>
            <th className="hidden py-2 pr-0 font-medium whitespace-nowrap lg:table-cell">
              Error
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => {
            const kind = getUsageKind(row.model);
            return (
              <UsageRow key={row.id} row={row} kind={kind} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsageRow({ row, kind }: { row: MeUsageLogEntry; kind: UsageKind }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2.5 pr-3 text-muted-foreground whitespace-nowrap">
        {formatDateTime(row.created_at)}
      </td>
      <td className="py-2.5 pr-3">
        <KindBadge kind={kind} />
      </td>
      <td className="max-w-[9rem] py-2.5 pr-3 font-mono text-xs break-all sm:max-w-none">
        {row.model ?? "—"}
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap">
        <StatusBadge status={row.status} />
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-xs md:table-cell">
        {formatUsageTokenCell(kind, row.prompt_tokens, "prompt")}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-xs lg:table-cell">
        {formatUsageTokenCell(kind, row.completion_tokens, "completion")}
      </td>
      <td
        className={`hidden py-2.5 pr-3 text-right text-xs sm:table-cell ${
          kind === "image" ? "text-muted-foreground" : "font-mono"
        }`}
      >
        {formatUsageTokenCell(kind, row.total_tokens, "total")}
      </td>
      <td className="py-2.5 pr-3 text-right text-xs whitespace-nowrap">
        {formatUsageCredits(row, kind)}
      </td>
      <td className="hidden max-w-[10rem] truncate py-2.5 pr-3 font-mono text-xs text-muted-foreground xl:table-cell">
        {truncateRequestId(row.request_id)}
      </td>
      <td className="hidden max-w-[8rem] truncate py-2.5 pr-0 font-mono text-xs text-muted-foreground lg:table-cell">
        {row.error_code ?? "—"}
      </td>
    </tr>
  );
}

function KindBadge({ kind }: { kind: UsageKind }) {
  if (kind === "image") {
    return (
      <Badge variant="outline" className="gap-1 whitespace-nowrap">
        <ImageIcon className="h-3 w-3" />
        {usageKindLabel(kind)}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap">
      <MessageSquare className="h-3 w-3" />
      {usageKindLabel(kind)}
    </Badge>
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
      <p className="max-w-sm text-sm text-muted-foreground">
        No API usage yet. Send your first chat completion or image generation
        from the Playgrounds to see requests here.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/playground">Chat Playground</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/image-playground">Image Playground</Link>
        </Button>
      </div>
    </div>
  );
}

function truncateRequestId(requestId: string | null | undefined) {
  if (!requestId) return "—";
  if (requestId.length <= 16) return requestId;
  return `${requestId.slice(0, 8)}...${requestId.slice(-6)}`;
}
