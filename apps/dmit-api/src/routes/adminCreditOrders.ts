import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

type CreditOrderAdminRow = {
  id: string;
  created_at: string;
  email: string | null;
  package_code: string | null;
  plan_id: string;
  amount_cents: number | null;
  amount_cny: number | null;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  updated_at: string;
};

function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed || undefined;
}

function normalizeStatus(status: string | undefined): string | undefined {
  const trimmed = (status ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "all") {
    return undefined;
  }
  return trimmed;
}

function normalizePackageCode(code: string | undefined): string | undefined {
  const trimmed = (code ?? "").trim();
  return trimmed || undefined;
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function resolveAmountCents(row: CreditOrderAdminRow): number | null {
  if (row.amount_cents != null && Number.isFinite(row.amount_cents)) {
    return row.amount_cents;
  }
  if (row.amount_cny != null && Number.isFinite(row.amount_cny)) {
    return row.amount_cny * 100;
  }
  return null;
}

export async function listAdminCreditOrders(args: {
  email?: string;
  status?: string;
  package_code?: string;
  limit?: number;
}): Promise<AdminCreditOrderListItem[]> {
  const email = normalizeEmail(args.email);
  const status = normalizeStatus(args.status);
  const packageCode = normalizePackageCode(args.package_code);
  const limit = args.limit ?? DEFAULT_LIMIT;

  let query = supabase()
    .from("credit_orders")
    .select(
      "id, created_at, email, package_code, plan_id, amount_cents, amount_cny, currency, status, stripe_checkout_session_id, stripe_payment_intent_id, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (email) {
    query = query.ilike("email", `%${email}%`);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (packageCode) {
    query = query.or(`package_code.eq.${packageCode},plan_id.eq.${packageCode}`);
  }

  const { data, error } = await query;

  if (error) {
    throw ApiError.internal(
      `Failed to list credit orders: ${error.message}`,
      "admin_credit_orders_list_failed"
    );
  }

  return ((data ?? []) as CreditOrderAdminRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    email: row.email,
    package_code: row.package_code,
    plan_id: row.plan_id,
    amount_cents: resolveAmountCents(row),
    currency: row.currency,
    status: row.status,
    stripe_checkout_session_id: row.stripe_checkout_session_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id,
    updated_at: row.updated_at,
  }));
}

export function parseAdminCreditOrdersQuery(c: {
  req: { query: (name: string) => string | undefined };
}) {
  return {
    email: c.req.query("email"),
    status: c.req.query("status"),
    package_code: c.req.query("package_code"),
    limit: parseLimit(c.req.query("limit")),
  };
}
