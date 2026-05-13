import Link from "next/link";
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
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  formatUsd,
  toneForStatus,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UsageLogRow } from "@/lib/supabase/types";

export const metadata = {
  title: "Usage",
};

const SUCCESS_STATUSES = ["succeeded", "success", "ok"];

const LOG_COLUMNS =
  "id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id";
const PROFILE_COLUMNS =
  "id, email, credits_balance, total_credits_purchased, total_credits_used";

export default async function UsagePage() {
  const supabase = createClient();

  const [logsRes, totalCountRes, successCountRes, failedCountRes, profileRes] =
    await Promise.all([
      supabase
        .from("usage_logs")
        .select(LOG_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .in("status", SUCCESS_STATUSES),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .not("status", "in", `(${SUCCESS_STATUSES.join(",")})`),
      supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .maybeSingle(),
    ]);

  const queryErrors = collectErrors([
    ["usage_logs (recent rows)", logsRes.error],
    ["usage_logs (total count)", totalCountRes.error],
    ["usage_logs (success count)", successCountRes.error],
    ["usage_logs (failed count)", failedCountRes.error],
    ["profiles", profileRes.error],
  ]);

  const logs = (logsRes.data ?? []) as UsageLogRow[];
  const profile = (profileRes.data ?? null) as ProfileRow | null;
  const totalRequests = totalCountRes.count ?? 0;
  const successRequests = successCountRes.count ?? 0;
  const failedRequests = failedCountRes.count ?? 0;
  const totalCreditsUsed = profile?.total_credits_used ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-request activity from your{" "}
          <code className="rounded bg-muted px-1 text-xs">usage_logs</code>{" "}
          table. Reads are RLS-scoped to your account.
        </p>
      </div>

      {queryErrors.length > 0 ? (
        <QueryErrorCard errors={queryErrors} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Total requests" value={formatInt(totalRequests)} />
        <Stat label="Succeeded" value={formatInt(successRequests)} />
        <Stat label="Failed" value={formatInt(failedRequests)} />
        <Stat label="Credits used" value={formatUsd(totalCreditsUsed)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>
            Last 50 entries, newest first. Hit the API in the{" "}
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
          {logs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Prompt
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Completion
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Credits
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td
                        className="py-2 pr-4 text-muted-foreground"
                        title={row.request_id ?? undefined}
                      >
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {row.model ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {row.prompt_tokens != null
                          ? formatInt(row.prompt_tokens)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {row.completion_tokens != null
                          ? formatInt(row.completion_tokens)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {row.total_tokens != null
                          ? formatInt(row.total_tokens)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {row.credits_charged != null
                          ? formatCreditsPrecise(row.credits_charged)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = toneForStatus(status);
  if (!status) {
    return <Badge variant="outline">unknown</Badge>;
  }
  if (tone === "success") {
    return <Badge variant="success">{status}</Badge>;
  }
  if (tone === "warning") {
    return <Badge variant="warning">{status}</Badge>;
  }
  if (tone === "destructive") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
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

function QueryErrorCard({
  errors,
}: {
  errors: Array<{ source: string; message: string }>;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Some data could not be loaded
        </CardTitle>
        <CardDescription>
          Supabase returned the errors below. Stats may be partial until the
          schema or RLS policy is fixed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-xs">
          {errors.map((e) => (
            <li key={e.source} className="font-mono text-muted-foreground">
              <span className="text-foreground">{e.source}:</span> {e.message}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function collectErrors(
  pairs: Array<readonly [string, { message: string } | null | undefined]>
) {
  const out: Array<{ source: string; message: string }> = [];
  for (const [source, err] of pairs) {
    if (err && typeof err.message === "string") {
      out.push({ source, message: err.message });
    }
  }
  return out;
}
