-- =============================================================================
-- Widen compute-credit numeric columns for ¥1 = 10,000 算力积分 scale.
--
-- Root cause for admin adjust RPC failures on large grants:
--   numeric(12, 6) max ≈ 999,999.999999 — overflows for +1,000,000 grants
--   and for balance_after after public-beta top-ups / invite gifts.
--
-- Does NOT change RPC signatures, Stripe webhooks, or debit_credits logic.
-- =============================================================================

alter table public.profiles
  alter column credits_balance type numeric(20, 6),
  alter column total_credits_purchased type numeric(20, 6),
  alter column total_credits_used type numeric(20, 6);

alter table public.credit_ledger
  alter column amount type numeric(20, 6),
  alter column balance_after type numeric(20, 6);

alter table public.recharge_plans
  alter column credits type numeric(20, 6),
  alter column bonus_credits type numeric(20, 6),
  alter column base_credits type numeric(20, 6);

alter table public.credit_orders
  alter column credits type numeric(20, 6);
