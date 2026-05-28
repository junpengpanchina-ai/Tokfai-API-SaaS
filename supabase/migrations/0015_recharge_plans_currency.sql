-- P6 hotfix: recharge_plans.currency + credit_orders billing column compatibility.
-- Ensures checkout can write orders whether the deployment followed migration 0004
-- (plan_id / amount_cny) or the earlier runtime schema (package_code / amount_cents).

alter table public.recharge_plans
  add column if not exists currency text not null default 'cny'
    check (currency = lower(currency));

comment on column public.recharge_plans.currency is
  'Stripe Checkout currency (ISO lowercase), e.g. cny.';

update public.recharge_plans
set currency = 'cny'
where currency is null;

alter table public.credit_orders
  add column if not exists package_code text;

alter table public.credit_orders
  add column if not exists amount_cents integer;

alter table public.credit_orders
  add column if not exists email text;

alter table public.credit_orders
  add column if not exists plan_id text;

alter table public.credit_orders
  add column if not exists amount_cny integer;
