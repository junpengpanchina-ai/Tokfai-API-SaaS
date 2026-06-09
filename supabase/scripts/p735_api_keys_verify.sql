-- p735_api_keys_verify.sql
-- Verify user-side API Key feature without touching billing / checkout / ledger core tables.

-- 1) api_keys table shape
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'api_keys'
order by ordinal_position;

-- 2) recent api keys
select
  id,
  user_id,
  name,
  prefix as key_prefix,
  case when revoked_at is null then 'active' else 'revoked' end as status,
  created_at,
  last_used_at,
  revoked_at
from public.api_keys
order by created_at desc
limit 20;

-- 3) active / revoked count
select
  case when revoked_at is null then 'active' else 'revoked' end as status,
  count(*) as count
from public.api_keys
group by 1
order by 1;

-- 4) billing core tables only count, do not mutate
select count(*) as credit_orders_count from public.credit_orders;
select count(*) as credit_ledger_count from public.credit_ledger;
