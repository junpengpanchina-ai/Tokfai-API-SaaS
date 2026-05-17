/**
 * Row shapes for the user-owned tables the frontend reads via RLS.
 *
 * Reminder: the frontend only ever READS its own rows here. All writes to
 * `usage_logs` and `credit_ledger` happen in DMIT with the service role.
 */

export type UsageStatus =
  | "succeeded"
  | "success"
  | "ok"
  | "failed"
  | "error"
  | "rate_limited"
  | "pending"
  | string;

export interface UsageLogRow {
  id: string;
  created_at: string;
  model: string | null;
  status: UsageStatus | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
}

export interface ProfileRow {
  /** Equal to auth.users.id. */
  id: string;
  email: string | null;
  credits_balance: number | null;
  total_credits_purchased: number | null;
  total_credits_used: number | null;
  updated_at: string | null;
}

export type CreditLedgerType =
  | "purchase"
  | "grant"
  | "refund"
  | "debit"
  | "adjustment"
  | string;

export interface CreditLedgerRow {
  id: string;
  created_at: string;
  type: CreditLedgerType | null;
  /** Positive = credits added, negative = credits debited. */
  amount: number | null;
  /** Credit balance immediately after this entry. */
  balance_after: number | null;
  reason: string | null;
  /** Stripe session id, request_id, or any DMIT-side reference. */
  reference_id: string | null;
}
