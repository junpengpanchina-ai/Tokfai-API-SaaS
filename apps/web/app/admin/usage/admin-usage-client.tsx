"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  toneForStatus,
} from "@/lib/format";
import { getDmitBaseUrl } from "@/lib/dmit/client";

export type AdminUsageLog = {
  created_at: string | null;
  email: string | null;
  api_key_prefix: string | null;
  api_key_name: string | null;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type UsageResponse = {
  data?: AdminUsageLog[];
};

export function AdminUsageClient({
  accessToken,
  initialLogs,
  initialError,
}: {
  accessToken: string;
  initialLogs: AdminUsageLog[];
  initialError: string | null;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getDmitBaseUrl()}/admin/usage`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = (await parseJson(response)) as UsageResponse & {
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, response.status));
      }

      setLogs(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage logs.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    setLogs(initialLogs);
    setError(initialError);
  }, [initialLogs, initialError]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Admin tools</Badge>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to admin overview
          </Link>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Usage logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent API usage across all users, served by DMIT with your Supabase
          session token only.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">Could not load usage logs</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadLogs()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent usage</CardTitle>
            <CardDescription>
              Last 100 requests with profile email and API key metadata.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadLogs()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading usage logs…</p>
          ) : logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">API key prefix</th>
                    <th className="py-2 pr-4 font-medium">API key name</th>
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 text-right font-medium">Prompt</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Completion
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 text-right font-medium">Credits</th>
                    <th className="py-2 pr-4 font-medium">Request ID</th>
                    <th className="py-2 pr-4 font-medium">Error code</th>
                    <th className="py-2 pr-4 font-medium">Error message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row, index) => (
                    <tr
                      key={rowKey(row, index)}
                      className="border-b align-top last:border-0"
                    >
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="py-2 pr-4">{row.email ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {row.api_key_prefix ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{row.api_key_name ?? "—"}</td>
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
                        className="max-w-[12rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                        title={row.request_id ?? undefined}
                      >
                        {row.request_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {row.error_code ?? "—"}
                      </td>
                      <td
                        className="max-w-[16rem] truncate py-2 pr-4 text-xs text-muted-foreground"
                        title={row.error_message ?? undefined}
                      >
                        {row.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No usage logs found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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

function formatMaybeInt(value: number | null | undefined): string {
  return value == null ? "—" : formatInt(value);
}

function rowKey(row: AdminUsageLog, index: number): string {
  return row.request_id ?? `${row.created_at ?? "row"}-${index}`;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown; message?: unknown }).error;
    if (typeof maybeError === "string") return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return `DMIT request failed (HTTP ${status}).`;
}
