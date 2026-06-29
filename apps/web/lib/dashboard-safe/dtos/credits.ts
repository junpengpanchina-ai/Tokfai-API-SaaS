/** Plain JSON DTOs for /dashboard/credits client islands. */

import type { CreditOrderDisplayStatus } from "../billing-display";

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
  display_status: CreditOrderDisplayStatus;
  currency: string;
  amount_cents: number | null;
  amount_cny: number | null;
  stripe_checkout_session_id: string | null;
}

export interface CreditLedgerEntry {
  id: string;
  created_at: string;
  type: string;
  amount: number | string;
  balance_after: number | string | null;
  reason: string | null;
  reference_id: string | null;
}

export interface CreditsPageData {
  balance: CreditsBalanceView;
  ledger: CreditLedgerEntry[];
  orders: CreditOrderView[];
  error: CreditsPageError | null;
}
