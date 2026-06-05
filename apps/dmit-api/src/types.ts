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
  billable: boolean;
  finish_reason: string | null;
  upstream_status: number | null;
  upstream_error_code: string | null;
  safety_reason: string | null;
}

/** Read-only fields returned by GET /v1/me/usage and /v1/me/usage/summary */
export interface UsageLogRow {
  id: string;
  created_at: string;
  api_key_id?: string | null;
  /** Joined from api_keys.prefix for dashboard display — not a usage_logs column. */
  prefix?: string | null;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: string | number | null;
  request_id: string | null;
  error_code?: string | null;
}

export interface UsageSummaryStats {
  total_requests: number;
  succeeded_requests: number;
  failed_requests: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_credits_charged: number;
}

export interface UsageSummaryFilters {
  start_date: string | null;
  end_date: string | null;
  api_key_id: string | null;
  model: string | null;
  status: string | null;
}

export interface UsageSummaryResponse {
  summary: UsageSummaryStats;
  filters: UsageSummaryFilters;
  data: UsageLogRow[];
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

export type CreditOrderDisplayStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export interface CreditOrderRow {
  id: string;
  plan_id: string | null;
  status: string;
  display_status: CreditOrderDisplayStatus;
  currency: string;
  amount_cents: number | null;
  credits: string | number;
  stripe_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export interface AuthedUser {
  /** auth.users.id */
  id: string;
  email: string | null;
}
