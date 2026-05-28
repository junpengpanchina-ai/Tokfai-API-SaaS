-- =============================================================================
-- Tokfai P6 — recharge_plans catalog
--
-- Adds public.recharge_plans for Starter / Pro / Business top-up tiers.
-- DMIT reads plans for GET /v1/billing/plans and POST /v1/billing/checkout.
-- Admin PATCH updates go through DMIT with admin_audit_logs.
--
-- Out of scope (unchanged):
--   - complete_credit_order RPC / Stripe webhook
--   - credit_ledger / profiles / usage_logs write paths
--
-- Access model:
--   - RLS enabled with NO anon/authenticated policies
--   - service_role only (DMIT backend)
-- =============================================================================

create table if not exists public.recharge_plans (
  id                text primary key,
  name              text not null,
  amount_cents      integer not null check (amount_cents > 0),
  credits           numeric(12, 6) not null check (credits > 0),
  bonus_credits     numeric(12, 6) not null default 0 check (bonus_credits >= 0),
  stripe_price_id   text,
  enabled           boolean not null default false,
  visible           boolean not null default true,
  sort_order        integer not null default 1000,
  badge             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.recharge_plans is
  'Recharge package catalog for Stripe Checkout. DMIT service_role only.';

comment on column public.recharge_plans.amount_cents is
  'Display/charge amount in CNY minor units (fen), e.g. 2900 = ¥29.00.';

comment on column public.recharge_plans.stripe_price_id is
  'Optional Stripe Price id (price_...). When set, Checkout uses this price instead of ad-hoc price_data.';

create index if not exists recharge_plans_visible_sort_idx
  on public.recharge_plans (visible, sort_order, id)
  where visible = true;

alter table public.recharge_plans enable row level security;

revoke all on public.recharge_plans from public, anon, authenticated;
grant select, insert, update, delete on public.recharge_plans to service_role;

insert into public.recharge_plans (
  id,
  name,
  amount_cents,
  credits,
  bonus_credits,
  stripe_price_id,
  enabled,
  visible,
  sort_order,
  badge
)
values
  (
    'starter',
    'Starter',
    2900,
    10000,
    0,
    null,
    true,
    true,
    100,
    null
  ),
  (
    'pro',
    'Pro',
    9900,
    50000,
    0,
    null,
    false,
    true,
    200,
    null
  ),
  (
    'business',
    'Business',
    29900,
    200000,
    0,
    null,
    false,
    true,
    300,
    null
  )
on conflict (id) do nothing;
