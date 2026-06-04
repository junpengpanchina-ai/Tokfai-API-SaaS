-- P7.25 read-only acceptance: admin recharge_plans catalog

select
  id,
  name,
  amount_cents,
  base_credits,
  bonus_credits,
  credits,
  credits = base_credits + bonus_credits as credits_total_ok,
  badge,
  description,
  enabled,
  visible,
  updated_at
from public.recharge_plans
where id in ('starter', 'pro', 'business')
order by sort_order, id;

-- Expect exactly 3 rows; credits_total_ok = true for all.
