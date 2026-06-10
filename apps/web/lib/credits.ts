import { resolveCreditOrderDisplayStatus } from "@/lib/billing/credit-order-status";
import { createClient } from "@/lib/supabase/server";
import type { CreditLedgerRow, ProfileRow } from "@/lib/supabase/types";

const LEDGER_LIMIT = 50;
const ORDERS_LIMIT = 10;

export type CreditsPageError = "auth" | "temporary";

export interface CreditsBalanceView {
  balance: number;
  balanceFromProfile: boolean;
  lastChangeAt: string | null;
  todayConsumed: number;
  last7DaysConsumed: number;
  showNoLedgerHint: boolean;
}

export interface CreditOrderView {
  id: string;
  created_at: string;
  plan_id: string | null;
  package_code: string | null;
  status: string;
  display_status: ReturnType<typeof resolveCreditOrderDisplayStatus>;
  currency: string;
  amount_cents: number | null;
  amount_cny: number | null;
  stripe_checkout_session_id: string | null;
}

export interface CreditsPageData {
  balance: CreditsBalanceView;
  ledger: CreditLedgerRow[];
  orders: CreditOrderView[];
  error: CreditsPageError | null;
}

type DebitRow = { amount: number | string | null };

export async function loadCreditsPageData(userId: string): Promise<CreditsPageData> {
  const supabase = createClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [profileRes, ledgerRes, ordersRes, todayDebitsRes, weekDebitsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, credits_balance, updated_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("credit_ledger")
        .select("id, created_at, type, amount, balance_after, reason, reference_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT),
      supabase
        .from("credit_orders")
        .select(
          "id, plan_id, package_code, status, currency, amount_cents, amount_cny, stripe_checkout_session_id, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(ORDERS_LIMIT),
      supabase
        .from("credit_ledger")
        .select("amount")
        .eq("user_id", userId)
        .lt("amount", 0)
        .gte("created_at", todayStart.toISOString()),
      supabase
        .from("credit_ledger")
        .select("amount")
        .eq("user_id", userId)
        .lt("amount", 0)
        .gte("created_at", sevenDaysAgo.toISOString()),
    ]);

  if (profileRes.error || ledgerRes.error) {
    return emptyCreditsPageData("temporary");
  }

  const ledger = (ledgerRes.data ?? []) as CreditLedgerRow[];
  const profile = profileRes.data as Pick<
    ProfileRow,
    "credits_balance" | "updated_at"
  > | null;

  let balance = 0;
  let balanceFromProfile = false;
  let showNoLedgerHint = false;

  if (profile?.credits_balance != null) {
    balance = toNumber(profile.credits_balance);
    balanceFromProfile = true;
  } else if (ledger.length > 0 && ledger[0].balance_after != null) {
    balance = toNumber(ledger[0].balance_after);
  } else {
    balance = 0;
    showNoLedgerHint = ledger.length === 0;
  }

  const lastChangeAt =
    ledger.length > 0 ? ledger[0].created_at : profile?.updated_at ?? null;

  const orders = ordersRes.error
    ? []
    : mapCreditOrders((ordersRes.data ?? []) as CreditOrderRow[]);

  return {
    balance: {
      balance,
      balanceFromProfile,
      lastChangeAt,
      todayConsumed: sumDebitAmounts(todayDebitsRes.data ?? []),
      last7DaysConsumed: sumDebitAmounts(weekDebitsRes.data ?? []),
      showNoLedgerHint,
    },
    ledger,
    orders,
    error: null,
  };
}

function emptyCreditsPageData(error: CreditsPageError): CreditsPageData {
  return {
    balance: {
      balance: 0,
      balanceFromProfile: false,
      lastChangeAt: null,
      todayConsumed: 0,
      last7DaysConsumed: 0,
      showNoLedgerHint: false,
    },
    ledger: [],
    orders: [],
    error,
  };
}

type CreditOrderRow = {
  id: string;
  plan_id: string | null;
  package_code: string | null;
  status: string | null;
  currency: string | null;
  amount_cents: number | string | null;
  amount_cny: number | string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
};

function mapCreditOrders(rows: CreditOrderRow[]): CreditOrderView[] {
  return rows.map((row) => {
    const status = typeof row.status === "string" ? row.status : "pending";
    const createdAt =
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString();

    return {
      id: row.id,
      created_at: createdAt,
      plan_id: row.plan_id ?? null,
      package_code: row.package_code ?? null,
      status,
      display_status: resolveCreditOrderDisplayStatus({
        status,
        createdAt,
      }),
      currency: (row.currency ?? "cny").toLowerCase(),
      amount_cents:
        row.amount_cents != null ? toNumber(row.amount_cents) : null,
      amount_cny: row.amount_cny != null ? toNumber(row.amount_cny) : null,
      stripe_checkout_session_id: row.stripe_checkout_session_id ?? null,
    };
  });
}

function sumDebitAmounts(rows: DebitRow[]): number {
  let total = 0;
  for (const row of rows) {
    const amount = row.amount != null ? toNumber(row.amount) : 0;
    if (amount < 0) {
      total += Math.abs(amount);
    }
  }
  return total;
}

function toNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
