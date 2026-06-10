import { createClient } from "@/lib/supabase/server";
import type { UsageLogRow } from "@/lib/supabase/types";
import { toneForStatus } from "@/lib/format";

export const USAGE_RECENT_LIMIT = 50;

export interface UsagePageStats {
  requestsLast24Hours: number;
  requestsLast7Days: number;
  tokensLast7Days: number;
  creditsLast7Days: number;
}

export interface UsagePageLog {
  id: string;
  created_at: string;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  error_code: string | null;
}

export type UsagePageState =
  | { status: "ready"; stats: UsagePageStats; logs: UsagePageLog[] }
  | { status: "error" };

const USAGE_LOG_SELECT =
  "id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id, error_code";

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapUsageLog(row: UsageLogRow): UsagePageLog {
  return {
    id: row.id,
    created_at: row.created_at,
    model: row.model,
    status: row.status ?? "unknown",
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
    credits_charged:
      row.credits_charged != null ? toNumber(row.credits_charged) : null,
    request_id: row.request_id,
    error_code: row.error_code ?? null,
  };
}

function sumSevenDayMetrics(
  rows: Pick<
    UsageLogRow,
    "total_tokens" | "credits_charged" | "status"
  >[]
): { tokens: number; credits: number } {
  let tokens = 0;
  let credits = 0;

  for (const row of rows) {
    if (row.total_tokens != null) {
      tokens += row.total_tokens;
    }
    if (toneForStatus(row.status) === "success") {
      credits += toNumber(row.credits_charged);
    }
  }

  return { tokens, credits };
}

export async function loadUsagePageData(userId: string): Promise<UsagePageState> {
  const supabase = createClient();
  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [count24hRes, count7dRes, metrics7dRes, recentRes] = await Promise.all([
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", twentyFourHoursAgo),
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("usage_logs")
      .select("total_tokens, credits_charged, status")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("usage_logs")
      .select(USAGE_LOG_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(USAGE_RECENT_LIMIT),
  ]);

  if (
    count24hRes.error ||
    count7dRes.error ||
    metrics7dRes.error ||
    recentRes.error
  ) {
    return { status: "error" };
  }

  const metrics = sumSevenDayMetrics(
    (metrics7dRes.data ?? []) as Pick<
      UsageLogRow,
      "total_tokens" | "credits_charged" | "status"
    >[]
  );

  return {
    status: "ready",
    stats: {
      requestsLast24Hours: count24hRes.count ?? 0,
      requestsLast7Days: count7dRes.count ?? 0,
      tokensLast7Days: metrics.tokens,
      creditsLast7Days: metrics.credits,
    },
    logs: ((recentRes.data ?? []) as UsageLogRow[]).map(mapUsageLog),
  };
}
