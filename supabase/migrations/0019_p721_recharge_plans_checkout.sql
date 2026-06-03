-- P7.21: align recharge plan prices (¥29.9 / ¥99.9 / ¥299) and enable all tiers for checkout.

update public.recharge_plans
set
  amount_cents = 2990,
  enabled = true,
  updated_at = now()
where id = 'starter';

update public.recharge_plans
set
  amount_cents = 9990,
  credits = 50000,
  enabled = true,
  updated_at = now()
where id = 'pro';

update public.recharge_plans
set
  amount_cents = 29900,
  credits = 200000,
  enabled = true,
  updated_at = now()
where id = 'business';
