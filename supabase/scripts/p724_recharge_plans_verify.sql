-- P7.24 read-only acceptance (run after applying 0021_p724_recharge_plan_bonus_credits.sql)

select
  id,
  amount_cents,
  base_credits,
  bonus_credits,
  credits,
  (base_credits + bonus_credits) = credits as credits_total_ok,
  badge,
  description,
  enabled
from public.recharge_plans
order by sort_order, id;

-- Expect: starter 2990 / 10000+0=10000; pro 9990 / 50000+10000=60000; business 29900 / 200000+60000=260000

select count(*) as broken_plans
from public.recharge_plans
where credits <> base_credits + bonus_credits;

-- Expect: 0
