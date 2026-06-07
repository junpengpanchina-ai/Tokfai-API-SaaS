-- P7.33 acceptance: recharge_plans archive column + active catalog

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'recharge_plans'
  and column_name = 'archived_at';

select
  id,
  name,
  archived_at,
  enabled,
  visible,
  sort_order
from public.recharge_plans
where archived_at is null
order by sort_order, id;

-- Expect archived_at column present; active rows include starter/pro/business.
