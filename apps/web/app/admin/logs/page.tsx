import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminLogsPanel } from "@/components/admin/admin-logs-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import type { AdminErrorLogRow } from "@/lib/admin/client";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Error Logs",
};

export const dynamic = "force-dynamic";

type LogsResponse = {
  data?: AdminErrorLogRow[];
};

type LogsSearchParams = {
  request_id?: string;
  route?: string;
  status?: string;
  code?: string;
};

function buildLogsQuery(searchParams: LogsSearchParams): string {
  const params = new URLSearchParams();
  const requestId = (searchParams.request_id ?? "").trim();
  const route = (searchParams.route ?? "").trim();
  const status = (searchParams.status ?? "").trim();
  const code = (searchParams.code ?? "").trim();

  if (requestId) params.set("request_id", requestId);
  if (route) params.set("route", route);
  if (status) params.set("status", status);
  if (code) params.set("code", code);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: LogsSearchParams;
}) {
  noStore();
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin");
  }
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/logs");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/logs");
  }

  const initialFilters = {
    request_id: (searchParams.request_id ?? "").trim(),
    route: (searchParams.route ?? "").trim(),
    status: (searchParams.status ?? "").trim(),
    code: (searchParams.code ?? "").trim(),
  };
  const query = buildLogsQuery(searchParams);

  let logs: AdminErrorLogRow[] = [];
  let debug = null;

  try {
    const body = await fetchDmitAdmin<LogsResponse>(
      `${dmitBaseUrl}/admin/logs${query}`,
      accessToken
    );
    logs = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return (
    <AdminLogsPanel
      logs={logs}
      debug={debug}
      initialFilters={initialFilters}
    />
  );
}
