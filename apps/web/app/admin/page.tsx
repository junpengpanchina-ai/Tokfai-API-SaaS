import { redirect } from "next/navigation";

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
  formatCredits,
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  toneForStatus,
} from "@/lib/format";
import {
  DmitServerError,
  getDmitBaseUrl,
} from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import { AdminCreditAdjustmentClient } from "./admin-credit-adjustment-client";

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

type AdminDebug = {
  statusCode: string;
  message: string;
  dmitBaseUrl: string;
  hasAccessToken: boolean;
  userEmail: string | null;
  isForbidden: boolean;
};

export default async function AdminPage() {
  const supabase = createClient();
  const DMIT_API_BASE_URL = getDmitBaseUrl();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  const userEmail = user.email ?? null;
  const hasAccessToken = Boolean(accessToken);

  let summary: AdminSummary | null = null;
  let usageLogs: AdminUsageLog[] = [];
  let users: AdminUser[] = [];
  let apiKeys: AdminApiKey[] = [];
  let debug: AdminDebug | null = null;

  if (!accessToken) {
    debug = {
      statusCode: "401",
      message: "missing session token",
      dmitBaseUrl: DMIT_API_BASE_URL,
      hasAccessToken,
      userEmail,
      isForbidden: false,
    };
  } else {
    try {
      const [summaryRes, usersRes, apiKeysRes] = await Promise.all([
        fetchDmitAdmin<SummaryResponse>(
          `${DMIT_API_BASE_URL}/admin/summary`,
          accessToken
        ),
        fetchDmitAdmin<UsersResponse>(
          `${DMIT_API_BASE_URL}/admin/users`,
          accessToken
        ),
        fetchDmitAdmin<ApiKeysResponse>(
          `${DMIT_API_BASE_URL}/admin/api-keys`,
          accessToken
        ),
      ]);

      summary = summaryRes.data.summary;
      usageLogs = summaryRes.data.usage_logs;
      users = usersRes.data;
      apiKeys = apiKeysRes.data;
    } catch (error) {
      debug = toAdminDebug(error, {
        dmitBaseUrl: DMIT_API_BASE_URL,
        hasAccessToken,
        userEmail,
      });
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <div>
          <Badge variant="secondary">Admin tools</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Tokfai Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal usage overview served by DMIT. This page does not hold
            service-role credentials.
          </p>
        </div>

        {debug ? <AdminDebugCard debug={debug} /> : null}

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
              value={formatCredits(summary.total_credits_charged)}
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
                      <th className="py-2 pr-4 font-medium">User ID</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Credits balance
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Total credits used
                      </th>
                      <th className="py-2 pr-4 font-medium">Updated</th>
                      <th className="py-2 pr-4 font-medium">
                        Adjust credits
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{row.email ?? "—"}</td>
                        <td
                          className="max-w-[10rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                          title={row.id}
                        >
                          {row.id}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatCredits(row.credits_balance)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatCredits(row.total_credits_used)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(row.updated_at)}
                        </td>
                        <td className="py-2 pr-4">
                          <AdminCreditAdjustmentClient userId={row.id} />
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

function AdminDebugCard({ debug }: { debug: AdminDebug }) {
  const title = debug.isForbidden ? "Admin access denied" : "Admin Debug/Error";
  const description = debug.isForbidden
    ? "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist."
    : debug.message;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <DebugRow label="Status code" value={debug.statusCode} />
          <DebugRow label="Error message" value={debug.message} />
          <DebugRow label="DMIT API base URL" value={debug.dmitBaseUrl} />
          <DebugRow
            label="Has Supabase session access_token"
            value={debug.hasAccessToken ? "yes" : "no"}
          />
          <DebugRow label="Current user email" value={debug.userEmail ?? "—"} />
        </dl>
      </CardContent>
    </Card>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
    </div>
  );
}

function formatMaybeInt(value: number | null | undefined): string {
  return value == null ? "—" : formatInt(value);
}

function toAdminDebug(
  error: unknown,
  context: Omit<AdminDebug, "statusCode" | "message" | "isForbidden">
): AdminDebug {
  if (error instanceof DmitServerError) {
    const isForbidden = error.status === 403;

    return {
      ...context,
      statusCode: String(error.status),
      message: isForbidden
        ? "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist."
        : error.message,
      isForbidden,
    };
  }

  if (error instanceof Error) {
    return {
      ...context,
      statusCode: "fetch failed",
      message: error.message,
      isForbidden: false,
    };
  }

  return {
    ...context,
    statusCode: "unknown",
    message: "Admin data could not be loaded.",
    isForbidden: false,
  };
}

async function fetchDmitAdmin<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
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

  return body as T;
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
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new DmitServerError({ status, message, code });
}
