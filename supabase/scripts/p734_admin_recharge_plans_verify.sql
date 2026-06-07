-- P7.34 verify: stripe_product_id column + active catalog filters
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'recharge_plans'
  and column_name in ('stripe_product_id', 'stripe_price_id', 'archived_at')
order by column_name;

-- Plans visible to pricing/checkout list (enabled + visible + not archived)
select id, name, enabled, visible, archived_at, stripe_price_id, stripe_product_id
from public.recharge_plans
where enabled = true
  and visible = true
  and archived_at is null
order by sort_order, id;
