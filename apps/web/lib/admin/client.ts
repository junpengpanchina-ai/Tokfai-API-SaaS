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

export type AdminModelStatus =
  | "available"
  | "disabled"
  | "coming_soon"
  | "archived";

export type AdminModelListItem = {
  id: string;
  display_name: string | null;
  provider: string | null;
  model_type: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  status: AdminModelStatus;
  sort_order: number | null;
  billing_mode: string | null;
  input_per_1k: number | null;
  output_per_1k: number | null;
  billable: boolean | null;
  markup_multiplier: number | null;
  updated_at: string | null;
};

export type AdminModelCreateBody = {
  id: string;
  display_name: string;
  provider?: string;
  model_type: "chat" | "image" | "video" | "other";
  enabled?: boolean;
  visible?: boolean;
  sort_order?: number;
  billing_mode: "token" | "per_image";
  input_per_1k?: number;
  output_per_1k?: number;
  billable?: boolean;
  markup_multiplier?: number;
};

export type AdminModelUpdateBody = Partial<
  Omit<AdminModelCreateBody, "id" | "billing_mode">
> & {
  billing_mode?: "token" | "per_image";
  action?: "restore";
};

export type AdminRechargePlanListItem = {
  id: string;
  name: string;
  amount_cents: number;
  credits: number;
  bonus_credits: number;
  total_credits: number;
  stripe_price_id: string | null;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  updated_at: string | null;
};

export type AdminRechargePlanUpdateBody = {
  name?: string;
  amount_cents?: number;
  credits?: number;
  bonus_credits?: number;
  enabled?: boolean;
  visible?: boolean;
  sort_order?: number;
  badge?: string | null;
  stripe_price_id?: string | null;
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

export async function fetchAdminModels(): Promise<AdminModelListItem[]> {
  const res = await fetchAdminApi<{ data?: AdminModelListItem[] }>("/admin/models");
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAdminModel(
  body: AdminModelCreateBody
): Promise<AdminModelListItem> {
  const res = await fetchAdminApi<{ data: AdminModelListItem }>("/admin/models", {
    method: "POST",
    json: body,
  });
  return res.data;
}

export async function updateAdminModel(
  id: string,
  body: AdminModelUpdateBody
): Promise<AdminModelListItem> {
  const res = await fetchAdminApi<{ data: AdminModelListItem }>(
    `/admin/models/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      json: body,
    }
  );
  return res.data;
}

export async function archiveAdminModel(id: string): Promise<{
  model: AdminModelListItem;
  usage_log_count: number;
  archived: boolean;
}> {
  const res = await fetchAdminApi<{
    data: {
      model: AdminModelListItem;
      usage_log_count: number;
      archived: boolean;
    };
  }>(`/admin/models/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.data;
}

export async function restoreAdminModel(id: string): Promise<AdminModelListItem> {
  const res = await fetchAdminApi<{ data: AdminModelListItem }>(
    `/admin/models/${encodeURIComponent(id)}/restore`,
    {
      method: "POST",
      json: {},
    }
  );
  return res.data;
}

export function createAdminRechargePlanIdempotencyKey(): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `admin-recharge-plan-${Date.now()}-${random}`;
}

export async function fetchAdminRechargePlans(): Promise<AdminRechargePlanListItem[]> {
  const res = await fetchAdminApi<{ data?: AdminRechargePlanListItem[] }>(
    "/admin/recharge-plans"
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function updateAdminRechargePlan(
  id: string,
  body: AdminRechargePlanUpdateBody,
  idempotencyKey?: string
): Promise<AdminRechargePlanListItem> {
  const res = await fetchAdminApi<{ data: AdminRechargePlanListItem }>(
    `/admin/recharge-plans/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      json: body,
      idempotencyKey:
        idempotencyKey ?? createAdminRechargePlanIdempotencyKey(),
    }
  );
  return res.data;
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
