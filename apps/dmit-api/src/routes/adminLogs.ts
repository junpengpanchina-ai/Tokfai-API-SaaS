import { supabase } from "../supabase.js";

const SUCCESS_STATUSES = ["succeeded", "success", "ok"];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export type AdminErrorLogRow = {
  id: string;
  request_id: string | null;
  route: string | null;
  user_id: string;
  email: string | null;
  model: string | null;
  status: string | null;
  code: string | null;
  message: string | null;
  upstream_status: number | null;
  latency_ms: number | null;
  created_at: string;
};

type UsageErrorRow = {
  id: string;
  user_id: string;
  created_at: string;
  model: string | null;
  status: string | null;
  request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  upstream_status: number | null;
  latency_ms: number | null;
};

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function inferRoute(model: string | null): string | null {
  if (!model) return null;
  const id = model.toLowerCase();
  if (
    id.startsWith("nano-banana") ||
    id.startsWith("gpt-image") ||
    id.includes("image")
  ) {
    return "/v1/images/generations";
  }
  if (id.includes("gemini") || id.includes("generatecontent")) {
    return "/v1beta/models";
  }
  if (id.includes("response")) {
    return "/v1/responses";
  }
  return "/v1/chat/completions";
}

function isErrorStatus(status: string | null | undefined): boolean {
  if (!status || !status.trim()) return true;
  return !SUCCESS_STATUSES.includes(status.trim().toLowerCase());
}

export async function listAdminErrorLogs(query: {
  request_id?: string;
  route?: string;
  status?: string;
  code?: string;
  since?: string;
  until?: string;
  limit?: string;
}): Promise<AdminErrorLogRow[]> {
  const limit = parseLimit(query.limit);
  const requestIdFilter = query.request_id?.trim();
  const routeFilter = query.route?.trim().toLowerCase() ?? "";
  const statusFilter = query.status?.trim().toLowerCase() ?? "";
  const codeFilter = query.code?.trim().toLowerCase() ?? "";
  const since = query.since?.trim();
  const until = query.until?.trim();

  let builder = supabase()
    .from("usage_logs")
    .select(
      "id, user_id, created_at, model, status, request_id, error_code, error_message, upstream_status, latency_ms"
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 5, MAX_LIMIT * 3));

  if (requestIdFilter) {
    builder = builder.ilike("request_id", `%${requestIdFilter}%`);
  }
  if (statusFilter) {
    builder = builder.ilike("status", `%${statusFilter}%`);
  }
  if (codeFilter) {
    builder = builder.ilike("error_code", `%${codeFilter}%`);
  }
  if (since) {
    builder = builder.gte("created_at", since);
  }
  if (until) {
    builder = builder.lte("created_at", until);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error(`Failed to list admin error logs: ${error.message}`);
  }

  let rows = ((data ?? []) as UsageErrorRow[]).filter(
    (row) =>
      isErrorStatus(row.status) ||
      Boolean(row.error_code?.trim()) ||
      Boolean(row.error_message?.trim())
  );

  if (routeFilter) {
    rows = rows.filter((row) => {
      const route = inferRoute(row.model)?.toLowerCase() ?? "";
      return route.includes(routeFilter);
    });
  }

  const limited = rows.slice(0, limit);
  const userIds = [...new Set(limited.map((row) => row.user_id))];
  const emails = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase()
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    for (const profile of (profiles ?? []) as Array<{
      id: string;
      email: string | null;
    }>) {
      emails.set(profile.id, profile.email);
    }
  }

  return limited.map((row) => ({
    id: row.id,
    request_id: row.request_id,
    route: inferRoute(row.model),
    user_id: row.user_id,
    email: emails.get(row.user_id) ?? null,
    model: row.model,
    status: row.status,
    code: row.error_code,
    message: row.error_message,
    upstream_status: row.upstream_status,
    latency_ms: row.latency_ms,
    created_at: row.created_at,
  }));
}
