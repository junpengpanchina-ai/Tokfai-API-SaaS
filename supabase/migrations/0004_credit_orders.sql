-- Stripe one-time credit top-up orders.
-- DMIT creates pending rows before Checkout and completes them from the
-- Stripe-signed webhook only.

alter type public.credit_ledger_type add value if not exists 'topup';

create table if not exists public.credit_orders (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  plan_id                     text not null check (plan_id in ('starter', 'pro', 'business')),
  status                      text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'failed')),
  currency                    text not null default 'cny' check (currency = lower(currency)),
  amount_cny                  integer not null check (amount_cny > 0),
  credits                     numeric(12, 6) not null check (credits > 0),
  stripe_customer_id          text,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);

create index if not exists credit_orders_user_id_created_at_idx
  on public.credit_orders (user_id, created_at desc);

create index if not exists credit_orders_stripe_checkout_session_id_idx
  on public.credit_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists credit_ledger_topup_ref_idx
  on public.credit_ledger (reference_id)
  where type::text = 'topup' and reference_id is not null;

alter table public.credit_orders enable row level security;

drop policy if exists "credit_orders_select_own" on public.credit_orders;

create policy "credit_orders_select_own"
  on public.credit_orders for select
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.credit_orders to service_role;
grant select on public.credit_orders to anon, authenticated;
