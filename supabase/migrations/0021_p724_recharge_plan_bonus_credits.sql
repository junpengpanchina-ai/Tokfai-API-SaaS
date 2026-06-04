-- P7.24: recharge_plans base/bonus split; credits = base_credits + bonus_credits (checkout/webhook total).

alter table public.recharge_plans
  add column if not exists base_credits numeric(12, 6),
  add column if not exists description text;

comment on column public.recharge_plans.base_credits is
  'Purchased credits before bonus. Final top-up amount is credits (= base_credits + bonus_credits).';

comment on column public.recharge_plans.description is
  'Optional marketing copy for pricing / dashboard cards.';

update public.recharge_plans
set
  base_credits = credits,
  bonus_credits = coalesce(bonus_credits, 0)
where base_credits is null;

alter table public.recharge_plans
  alter column base_credits set not null;

alter table public.recharge_plans
  drop constraint if exists recharge_plans_credits_total_check;

alter table public.recharge_plans
  add constraint recharge_plans_credits_total_check
  check (credits = base_credits + bonus_credits);

update public.recharge_plans
set
  amount_cents = 2990,
  base_credits = 10000,
  bonus_credits = 0,
  credits = 10000,
  badge = null,
  description = 'For testing and personal use',
  enabled = true,
  updated_at = now()
where id = 'starter';

update public.recharge_plans
set
  amount_cents = 9990,
  base_credits = 50000,
  bonus_credits = 10000,
  credits = 60000,
  badge = 'Popular',
  description = 'For builders and small apps',
  enabled = true,
  updated_at = now()
where id = 'pro';

update public.recharge_plans
set
  amount_cents = 29900,
  base_credits = 200000,
  bonus_credits = 60000,
  credits = 260000,
  badge = null,
  description = 'For teams and higher usage',
  enabled = true,
  updated_at = now()
where id = 'business';
