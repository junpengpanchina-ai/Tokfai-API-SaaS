/**
 * Row types for the tables DMIT touches.
 *
 * Keep in sync with supabase/migrations/0001_init.sql. apps/web has its own
 * narrower copy of the *read-only* fields — that's intentional, the two apps
 * stay decoupled.
 */

export interface ProfileRow {
  id: string;
  email: string | null;
  credits_balance: string | number;
  total_credits_purchased: string | number;
  total_credits_used: string | number;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_id: string;
  prefix: string;
  hash: string;
  encrypted_secret: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface UsageLogInsert {
  user_id: string;
  api_key_id: string | null;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string;
  upstream_id: string | null;
  error_code: string | null;
  error_message: string | null;
  latency_ms: number | null;
}

/** Read-only fields returned by GET /v1/me/usage */
export interface UsageLogRow {
  id: string;
  created_at: string;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: string | number | null;
  request_id: string | null;
}

export type CreditLedgerType =
  | "purchase"
  | "topup"
  | "grant"
  | "refund"
  | "debit"
  | "adjustment";

export interface CreditLedgerRow {
  id: string;
  created_at: string;
  type: CreditLedgerType | string | null;
  amount: string | number | null;
  balance_after: string | number | null;
  reason: string | null;
  reference_id: string | null;
}

export interface AuthedUser {
  /** auth.users.id */
  id: string;
  email: string | null;
}
