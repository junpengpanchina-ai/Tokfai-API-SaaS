const DEFAULT_BASE = "https://api.tokfai.com";

export class DmitServerError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(args: { status: number; message: string; code?: string }) {
    super(args.message);
    this.name = "DmitServerError";
    this.status = args.status;
    this.code = args.code;
  }
}

export function getDmitBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.replace(/\/+$/, "") ??
    DEFAULT_BASE
  );
}

export async function dmitServerFetch<T>(
  path: string,
  accessToken: string
): Promise<T> {
  const res = await fetch(`${getDmitBaseUrl()}${path}`, {
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

export interface MeCredits {
  id: string;
  email: string | null;
  credits_balance: number | null;
  total_credits_purchased: number | null;
  total_credits_used: number | null;
  updated_at: string | null;
}

export interface MeCreditLedgerEntry {
  id: string;
  created_at: string;
  type: string | null;
  amount: number | null;
  balance_after: number | null;
  reason: string | null;
  reference_id: string | null;
}

interface DataResponse<T> {
  data: T;
}

export async function getMyCredits(accessToken: string): Promise<MeCredits> {
  const res = await dmitServerFetch<DataResponse<MeCredits>>(
    "/v1/me/credits",
    accessToken
  );
  return res.data;
}

export async function listMyCreditLedger(
  accessToken: string,
  limit = 50
): Promise<MeCreditLedgerEntry[]> {
  const res = await dmitServerFetch<DataResponse<MeCreditLedgerEntry[]>>(
    `/v1/me/credits/ledger?limit=${limit}`,
    accessToken
  );
  return res.data;
}

export interface BillingRechargePlan {
  plan_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  credits: number;
  bonus_credits: number;
  total_credits: number;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
}

export async function listBillingRechargePlans(
  accessToken: string
): Promise<BillingRechargePlan[]> {
  const res = await dmitServerFetch<DataResponse<BillingRechargePlan[]>>(
    "/v1/billing/plans",
    accessToken
  );
  return res.data ?? [];
}

export interface MeUsageLogEntry {
  id: string;
  created_at: string;
  api_key_id?: string | null;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
  request_id: string | null;
  error_code: string | null;
}

export interface MeUsageSummary {
  total_requests: number;
  succeeded_requests: number;
  failed_requests: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_credits_charged: number;
}

export interface MeUsageSummaryFilters {
  start_date: string | null;
  end_date: string | null;
  api_key_id: string | null;
  model: string | null;
  status: string | null;
}

export interface MeUsageSummaryResponse {
  summary: MeUsageSummary;
  filters: MeUsageSummaryFilters;
  data: MeUsageLogEntry[];
}

export interface MeUsageSummaryQuery {
  start_date?: string;
  end_date?: string;
  api_key_id?: string;
  model?: string;
  status?: string;
  limit?: number;
}

function buildUsageSummaryQuery(params: MeUsageSummaryQuery): string {
  const search = new URLSearchParams();
  if (params.start_date) search.set("start_date", params.start_date);
  if (params.end_date) search.set("end_date", params.end_date);
  if (params.api_key_id) search.set("api_key_id", params.api_key_id);
  if (params.model) search.set("model", params.model);
  if (params.status) search.set("status", params.status);
  if (params.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `/v1/me/usage/summary?${qs}` : "/v1/me/usage/summary";
}

export async function fetchMyUsageSummary(
  accessToken: string,
  params: MeUsageSummaryQuery = {}
): Promise<MeUsageSummaryResponse> {
  return dmitServerFetch<MeUsageSummaryResponse>(
    buildUsageSummaryQuery(params),
    accessToken
  );
}

export interface MeApiKeyOption {
  id: string;
  name: string;
  prefix: string;
  status: string;
}

export async function listMyApiKeys(
  accessToken: string
): Promise<MeApiKeyOption[]> {
  const res = await dmitServerFetch<DataResponse<MeApiKeyOption[]>>(
    "/v1/me/api-keys",
    accessToken
  );
  return res.data ?? [];
}

export async function listMyUsage(
  accessToken: string,
  limit = 50
): Promise<MeUsageLogEntry[]> {
  const res = await dmitServerFetch<DataResponse<MeUsageLogEntry[]>>(
    `/v1/me/usage?limit=${limit}`,
    accessToken
  );
  return res.data;
}
