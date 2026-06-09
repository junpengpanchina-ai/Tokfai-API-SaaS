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
  billing_type: string | null;
  input_credits_per_million_tokens: number | null;
  output_credits_per_million_tokens: number | null;
  image_credits_per_generation: number | null;
  upstream_cost_note: string | null;
  markup_ratio: number | null;
  pricing_enabled: boolean | null;
  pricing_visible: boolean | null;
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
  billing_type?: "chat" | "image";
  input_credits_per_million_tokens?: number;
  output_credits_per_million_tokens?: number;
  image_credits_per_generation?: number;
  upstream_cost_note?: string | null;
  markup_ratio?: number;
  pricing_enabled?: boolean;
  pricing_visible?: boolean;
};

export type AdminModelUpdateBody = Partial<AdminModelCreateBody> & {
  action?: "restore";
};

export type AdminRechargePlanListItem = {
  id: string;
  name: string;
  amount_cents: number;
  base_credits: number;
  bonus_credits: number;
  credits: number;
  stripe_product_id?: string | null;
  stripe_price_id: string | null;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  description: string | null;
  archived_at: string | null;
  updated_at: string | null;
};

/** POST /admin/recharge-plans — must match DMIT RechargePlanCreateSchema. */
export type AdminRechargePlanCreateBody = {
  id: string;
  name: string;
  /** Price in yuan (e.g. 49.9). DMIT converts to amount_cents server-side. */
  amount_yuan: number;
  base_credits: number;
  bonus_credits?: number;
  description?: string | null;
  /** When false, Stripe product/price are not provisioned on create. */
  enabled?: boolean;
  visible?: boolean;
  sort_order?: number;
  badge?: string | null;
};

export type AdminRechargePlanUpdateBody = {
  name?: string;
  amount_yuan?: number;
  base_credits?: number;
  bonus_credits?: number;
  description?: string | null;
  enabled?: boolean;
  visible?: boolean;
  sort_order?: number;
  badge?: string | null;
};

export type AdminRechargePlanDuplicateBody = {
  new_id?: string;
};

export type AdminDashboardRecentOrder = {
  id: string;
  email: string | null;
  plan_label: string | null;
  amount_cents: number | null;
  status: string;
  created_at: string;
};

export type AdminDashboardRecentUser = {
  id: string;
  email: string | null;
  created_at: string;
};

export type AdminDashboardSummary = {
  total_users: number | null;
  admin_user_count: number | null;
  today_new_users: number | null;
  last_7d_new_users: number | null;
  last_30d_new_users: number | null;
  user_source: "profiles" | "admin_users";
  total_credit_orders: number | null;
  paid_orders: number | null;
  pending_orders: number | null;
  total_recharge_amount_cents: number;
  total_requests: number | null;
  successful_requests: number | null;
  failed_requests: number | null;
  has_token_data: boolean;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  total_usage_credits: number | null;
  recent_orders: AdminDashboardRecentOrder[];
  recent_users: AdminDashboardRecentUser[];
  updated_at: string;
};

export async function fetchAdminDashboardSummary(): Promise<{
  summary: AdminDashboardSummary;
  warnings: string[];
}> {
  const res = await fetchAdminApi<{
    data: AdminDashboardSummary;
    warnings?: string[];
  }>("/admin/dashboard-summary");
  return {
    summary: res.data,
    warnings: Array.isArray(res.warnings) ? res.warnings : [],
  };
}

export type AdminCreditOrderListItem = {
  id: string;
  created_at: string;
  email: string | null;
  package_code: string | null;
  plan_id: string;
  amount_cents: number | null;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  updated_at: string;
};

export type AdminCreditOrdersQuery = {
  email?: string;
  status?: string;
  package_code?: string;
};

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;
  readonly detail?: unknown;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    body?: unknown;
    detail?: unknown;
  }) {
    super(args.message);
    this.name = "AdminApiError";
    this.status = args.status;
    this.code = args.code;
    this.body = args.body;
    this.detail = args.detail;
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
  total_credits_purchased: number;
  total_credits_used: number;
  created_at: string | null;
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

export type SyncCatalogResult = {
  insertedModels: string[];
  insertedPricing: string[];
  skipped: string[];
};

export async function syncAdminCatalog(): Promise<SyncCatalogResult> {
  const res = await fetchAdminApi<{ data: SyncCatalogResult }>(
    "/admin/models/sync-catalog",
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

export async function fetchAdminRechargePlans(args?: {
  includeArchived?: boolean;
}): Promise<AdminRechargePlanListItem[]> {
  const query =
    args?.includeArchived === true ? "?include_archived=true" : "";
  const res = await fetchAdminApi<{ data?: AdminRechargePlanListItem[] }>(
    `/admin/recharge-plans${query}`
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAdminRechargePlan(
  body: AdminRechargePlanCreateBody,
  idempotencyKey?: string
): Promise<AdminRechargePlanListItem> {
  const res = await fetchAdminApi<{ data: AdminRechargePlanListItem }>(
    "/admin/recharge-plans",
    {
      method: "POST",
      json: body,
      idempotencyKey:
        idempotencyKey ?? createAdminRechargePlanIdempotencyKey(),
    }
  );
  return res.data;
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

export async function duplicateAdminRechargePlan(
  id: string,
  body: AdminRechargePlanDuplicateBody = {},
  idempotencyKey?: string
): Promise<{
  plan: AdminRechargePlanListItem;
  source_plan_id: string;
}> {
  const res = await fetchAdminApi<{
    data: {
      plan: AdminRechargePlanListItem;
      source_plan_id: string;
    };
  }>(`/admin/recharge-plans/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
    json: body,
    idempotencyKey: idempotencyKey ?? createAdminRechargePlanIdempotencyKey(),
  });
  return res.data;
}

export async function archiveAdminRechargePlan(id: string): Promise<{
  plan: AdminRechargePlanListItem;
  archived: boolean;
}> {
  const res = await fetchAdminApi<{
    data: {
      plan: AdminRechargePlanListItem;
      archived: boolean;
    };
  }>(`/admin/recharge-plans/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.data;
}

export async function restoreAdminRechargePlan(
  id: string
): Promise<AdminRechargePlanListItem> {
  const res = await fetchAdminApi<{ data: AdminRechargePlanListItem }>(
    `/admin/recharge-plans/${encodeURIComponent(id)}/restore`,
    {
      method: "POST",
      json: {},
    }
  );
  return res.data;
}

function buildAdminCreditOrdersQuery(
  filters: AdminCreditOrdersQuery = {}
): string {
  const params = new URLSearchParams();
  const email = filters.email?.trim();
  const status = filters.status?.trim();
  const packageCode = filters.package_code?.trim();

  if (email) params.set("email", email);
  if (status && status !== "all") params.set("status", status);
  if (packageCode) params.set("package_code", packageCode);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchAdminCreditOrders(
  filters: AdminCreditOrdersQuery = {}
): Promise<AdminCreditOrderListItem[]> {
  const res = await fetchAdminApi<{ data?: AdminCreditOrderListItem[] }>(
    `/admin/credit-orders${buildAdminCreditOrdersQuery(filters)}`
  );
  return Array.isArray(res.data) ? res.data : [];
}

export type AdminAnnouncementType =
  | "notice"
  | "maintenance"
  | "billing"
  | "model"
  | "promotion"
  | "docs";

export type AdminAnnouncementListItem = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string;
  type: AdminAnnouncementType;
  priority: number;
  enabled: boolean;
  pinned: boolean;
  visible_from: string | null;
  visible_until: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminAnnouncementCreateBody = {
  title: string;
  slug?: string;
  summary?: string | null;
  content: string;
  type?: AdminAnnouncementType;
  priority?: number;
  enabled?: boolean;
  pinned?: boolean;
  visible_from?: string | null;
  visible_until?: string | null;
};

export type AdminAnnouncementUpdateBody = Partial<AdminAnnouncementCreateBody>;

export function createAdminAnnouncementIdempotencyKey(): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `admin-announcement-${Date.now()}-${random}`;
}

export async function fetchAdminAnnouncements(): Promise<
  AdminAnnouncementListItem[]
> {
  const res = await fetchAdminApi<{ data?: AdminAnnouncementListItem[] }>(
    "/admin/announcements"
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAdminAnnouncement(
  body: AdminAnnouncementCreateBody,
  idempotencyKey?: string
): Promise<AdminAnnouncementListItem> {
  const res = await fetchAdminApi<{ data: AdminAnnouncementListItem }>(
    "/admin/announcements",
    {
      method: "POST",
      json: body,
      idempotencyKey:
        idempotencyKey ?? createAdminAnnouncementIdempotencyKey(),
    }
  );
  return res.data;
}

export async function updateAdminAnnouncement(
  id: string,
  body: AdminAnnouncementUpdateBody,
  idempotencyKey?: string
): Promise<AdminAnnouncementListItem> {
  const res = await fetchAdminApi<{ data: AdminAnnouncementListItem }>(
    `/admin/announcements/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      json: body,
      idempotencyKey:
        idempotencyKey ?? createAdminAnnouncementIdempotencyKey(),
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
  let detail: unknown;

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const maybeError = record.error;
    if (typeof maybeError === "string") {
      code = maybeError;
      message = maybeError;
    } else if (maybeError && typeof maybeError === "object") {
      const err = maybeError as {
        message?: unknown;
        code?: unknown;
        detail?: unknown;
      };
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "string") code = err.code;
      if (err.detail !== undefined) detail = err.detail;
    }
    if (typeof record.code === "string" && !code) {
      code = record.code;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new AdminApiError({ status, message, code, body, detail });
}
