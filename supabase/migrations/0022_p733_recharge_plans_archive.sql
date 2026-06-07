-- =============================================================================
-- Tokfai P7.33 — recharge_plans archive support
--
-- Adds soft-archive via archived_at. Admin list hides archived by default.
-- Billing / checkout read paths exclude archived plans (DMIT filter only).
-- Does NOT change complete_credit_order, Stripe webhook, or credit_ledger.
-- =============================================================================

alter table public.recharge_plans
  add column if not exists archived_at timestamptz;

comment on column public.recharge_plans.archived_at is
  'When set, plan is archived (hidden from admin default list and billing catalog).';

create index if not exists recharge_plans_active_sort_idx
  on public.recharge_plans (sort_order, id)
  where archived_at is null;
