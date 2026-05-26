/**
 * Browser-side Admin API client (tokfai.com/admin → api.tokfai.com/admin/*).
 *
 * Always reads a fresh Supabase access token from the browser session.
 * Never relies on window globals or manually parsed cookies.
 */

import { getDmitBaseUrl } from "@/lib/dmit/client";
import { createClient } from "@/lib/supabase/client";

export const ADMIN_SESSION_EXPIRED = "登录状态失效，请重新登录";

export type AdminMe = {
  is_admin: boolean;
  email: string | null;
  user_id: string;
  admin_user_id: string | null;
  status: "active" | null;
  auth_source: string | null;
};

export type AdminCreditsAdjustBody = {
  user_id: string;
  direction: "add" | "deduct";
  amount: number;
  reason: string;
};

export type AdminCreditsAdjustSuccess = {
  ok: true;
  user_id: string;
  previous_credits: number;
  delta: number;
  credits: number;
  balance_after: number;
  reason: string;
  reference_id: string;
  credit_ledger_id: string;
  admin_audit_log_id: string | null;
  idempotent_replay?: boolean;
};

export type AdminCreditsAdjustErrorBody = {
  error?: string;
  current_credits?: number;
  requested_amount?: number;
  idempotent_replay?: boolean;
};

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    body?: unknown;
  }) {
    super(args.message);
    this.name = "AdminApiError";
    this.status = args.status;
    this.code = args.code;
    this.body = args.body;
  }

  get isSessionExpired(): boolean {
    return this.code === "missing_access_token" || this.status === 401;
  }
}

export type AdminFetchOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  idempotencyKey?: string;
};

export async function getAdminAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function fetchAdminApi<T>(
  path: string,
  options: AdminFetchOptions = {}
): Promise<T> {
  const token = await getAdminAccessToken();
  if (!token) {
    throw new AdminApiError({
      status: 401,
      message: ADMIN_SESSION_EXPIRED,
      code: "missing_access_token",
    });
  }

  const {
    json,
    idempotencyKey,
    headers: extraHeaders,
    credentials: _credentials,
    ...init
  } = options;

  const url = path.startsWith("http")
    ? path
    : `${getDmitBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(extraHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  let body: BodyInit | undefined;
  if (json !== undefined) {
    body = JSON.stringify(json);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body,
    credentials: "omit",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const parsed = parseJson(text);

  if (!res.ok) {
    throw toAdminApiError(res.status, parsed);
  }

  return parsed as T;
}

export async function fetchAdminMe(): Promise<AdminMe> {
  const res = await fetchAdminApi<{ data: AdminMe }>("/admin/me");
  return res.data;
}

export function createAdminAdjustIdempotencyKey(): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `admin-adjust-${Date.now()}-${random}`;
}

export async function adjustAdminCredits(
  body: AdminCreditsAdjustBody,
  idempotencyKey?: string
): Promise<AdminCreditsAdjustSuccess> {
  return fetchAdminApi<AdminCreditsAdjustSuccess>("/admin/credits/adjust", {
    method: "POST",
    json: body,
    idempotencyKey: idempotencyKey ?? createAdminAdjustIdempotencyKey(),
  });
}

export type AdminUserSummary = {
  id: string;
  email: string | null;
  credits_balance: number;
  total_credits_used: number;
  updated_at: string | null;
};

export async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  const res = await fetchAdminApi<{ data?: AdminUserSummary[] }>("/admin/users");
  return Array.isArray(res.data) ? res.data : [];
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toAdminApiError(status: number, body: unknown): AdminApiError {
  let message = `Admin request failed (HTTP ${status}).`;
  let code: string | undefined;

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const maybeError = record.error;
    if (typeof maybeError === "string") {
      code = maybeError;
      message = maybeError;
    } else if (maybeError && typeof maybeError === "object") {
      const err = maybeError as { message?: unknown; code?: unknown };
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "string") code = err.code;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new AdminApiError({ status, message, code, body });
}
