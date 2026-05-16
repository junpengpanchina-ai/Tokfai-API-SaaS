import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  formatUsd,
  toneForStatus,
} from "@/lib/format";
import { dmitServerFetch, DmitServerError } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin",
};

type AdminSummary = {
  total_users: number;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  total_credits_charged: number;
};

type AdminUsageLog = {
  id: string;
  email: string | null;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  created_at: string | null;
};

type AdminUser = {
  id: string;
  email: string | null;
  credits_balance: number | null;
  total_credits_used: number | null;
  updated_at: string | null;
};

type AdminApiKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

type SummaryResponse = {
  data: {
    summary: AdminSummary;
    usage_logs: AdminUsageLog[];
  };
};

type UsersResponse = {
  data: AdminUser[];
};

type ApiKeysResponse = {
  data: AdminApiKey[];
};

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login?redirect=/admin");
  }

  let summary: AdminSummary | null = null;
  let usageLogs: AdminUsageLog[] = [];
  let users: AdminUser[] = [];
  let apiKeys: AdminApiKey[] = [];
  let loadError: string | null = null;

  try {
    const [summaryRes, usersRes, apiKeysRes] = await Promise.all([
      dmitServerFetch<SummaryResponse>("/admin/summary", session.access_token),
      dmitServerFetch<UsersResponse>("/admin/users", session.access_token),
      dmitServerFetch<ApiKeysResponse>("/admin/api-keys", session.access_token),
    ]);

    summary = summaryRes.data.summary;
    usageLogs = summaryRes.data.usage_logs;
    users = usersRes.data;
    apiKeys = apiKeysRes.data;
  } catch (error) {
    if (
      error instanceof DmitServerError &&
      (error.status === 403 || error.status === 404)
    ) {
      notFound();
    }
    if (error instanceof DmitServerError && error.status === 401) {
      redirect("/login?redirect=/admin");
    }
    loadError =
      error instanceof Error ? error.message : "Admin data could not be loaded.";
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <div>
          <Badge variant="secondary">Read only</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Tokfai Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal usage overview served by DMIT. This page does not hold
            service-role credentials.
          </p>
        </div>

        {loadError ? <LoadError message={loadError} /> : null}

        {summary ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Stat label="Total users" value={formatInt(summary.total_users)} />
            <Stat
              label="Total requests"
              value={formatInt(summary.total_requests)}
            />
            <Stat
              label="Succeeded"
              value={formatInt(summary.success_requests)}
            />
            <Stat label="Failed" value={formatInt(summary.failed_requests)} />
            <Stat
              label="Credits charged"
              value={formatUsd(summary.total_credits_charged)}
            />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Recent usage logs</CardTitle>
            <CardDescription>Last 50 requests across all users.</CardDescription>
          </CardHeader>
          <CardContent>
            {usageLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Model</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Prompt
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Completion
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Total
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Credits
                      </th>
                      <th className="py-2 pr-4 font-medium">Request ID</th>
                      <th className="py-2 pr-4 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageLogs.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.email ?? "—"}</td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.model ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatMaybeInt(row.prompt_tokens)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatMaybeInt(row.completion_tokens)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatMaybeInt(row.total_tokens)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {row.credits_charged != null
                            ? formatCreditsPrecise(row.credits_charged)
                            : "—"}
                        </td>
                        <td
                          className="max-w-[14rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                          title={row.request_id ?? undefined}
                        >
                          {row.request_id ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState label="No usage logs found." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profiles</CardTitle>
            <CardDescription>
              All profile balances and cumulative credit usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Credits balance
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Total credits used
                      </th>
                      <th className="py-2 pr-4 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.email ?? "—"}</td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatUsd(row.credits_balance)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatUsd(row.total_credits_used)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState label="No profiles found." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Metadata only. Full keys, hashes, and encrypted secrets are never
              returned to this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {apiKeys.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Prefix</th>
                      <th className="py-2 pr-4 font-medium">Created</th>
                      <th className="py-2 pr-4 font-medium">Last used</th>
                      <th className="py-2 pr-4 font-medium">Revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{row.name}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                          {row.prefix}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.last_used_at)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.revoked_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState label="No API keys found." />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = toneForStatus(status);
  if (!status) return <Badge variant="outline">unknown</Badge>;
  if (tone === "success") return <Badge variant="success">{status}</Badge>;
  if (tone === "warning") return <Badge variant="warning">{status}</Badge>;
  if (tone === "destructive") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-base">Admin data could not be loaded</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function formatMaybeInt(value: number | null | undefined): string {
  return value == null ? "—" : formatInt(value);
}
