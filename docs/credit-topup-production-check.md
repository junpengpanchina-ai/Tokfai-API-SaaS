# Stripe Credit Top-up Production Checks

This runbook is for production inspection of the Stripe Checkout credit top-up
path. Run these queries in Supabase SQL Editor with a privileged role.

## Judgement Criteria

- `credit_orders.status = 'pending'` is not an anomaly by itself. It means the
  user started Checkout but has not completed payment yet.
- A top-up is considered fully credited only when all three are true:
  - `credit_orders.status = 'paid'`
  - `credit_ledger.reference_id = 'stripe_checkout:' || credit_orders.stripe_checkout_session_id`
    exists with `type = 'topup'`
  - `profiles` reflects the credit increase. In practice, the latest ledger
    `balance_after` should match `profiles.credits_balance`, and
    `profiles.total_credits_purchased` should include paid top-up ledger sums.
- Recent ledger views must come from `credit_ledger` only. Unpaid orders are not
  ledger entries and must not be counted as balance.

## 1. `credit_orders` Overview

Use this to inspect recent Checkout orders and their payment status.

```sql
select
  id,
  user_id,
  status,
  credits,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  created_at,
  paid_at,
  updated_at
from public.credit_orders
order by created_at desc
limit 100;
```

Status distribution for a quick health check:

```sql
select
  status,
  count(*) as order_count,
  min(created_at) as oldest_created_at,
  max(created_at) as newest_created_at
from public.credit_orders
group by status
order by status;
```

## 2. `credit_ledger` Top-up Entries

Use this to inspect the append-only credit movements created by the Stripe
webhook. These are the only rows that should drive Recent ledger.

```sql
select
  id,
  user_id,
  type,
  amount,
  balance_after,
  reason,
  reference_id,
  created_at
from public.credit_ledger
where type = 'topup'
  and reference_id like 'stripe_checkout:%'
order by created_at desc
limit 100;
```

Verify ledger rows match their paid order amount:

```sql
select
  o.id as order_id,
  o.user_id,
  o.status,
  o.credits as order_credits,
  l.id as ledger_id,
  l.amount as ledger_amount,
  l.balance_after,
  l.reference_id
from public.credit_orders o
join public.credit_ledger l
  on l.reference_id = 'stripe_checkout:' || o.stripe_checkout_session_id
where o.status = 'paid'
  and l.type = 'topup'
  and l.amount <> o.credits
order by o.created_at desc;
```

Expected result: zero rows.

## 3. `profiles` Balance Consistency

The current profile balance should match the latest ledger balance for each
user. If this query returns rows, inspect the user before changing anything.

```sql
with latest_ledger as (
  select distinct on (user_id)
    user_id,
    id as ledger_id,
    balance_after,
    created_at
  from public.credit_ledger
  order by user_id, created_at desc, id desc
)
select
  p.id as user_id,
  p.credits_balance,
  p.total_credits_purchased,
  p.total_credits_used,
  l.ledger_id,
  l.balance_after as latest_ledger_balance_after,
  l.created_at as latest_ledger_created_at
from public.profiles p
join latest_ledger l on l.user_id = p.id
where p.credits_balance is distinct from l.balance_after
order by l.created_at desc;
```

Check whether `profiles.total_credits_purchased` includes all Stripe top-up
ledger amounts. This intentionally ignores current `credits_balance`, because
later API usage can reduce the balance after a successful top-up.

```sql
with stripe_topups as (
  select
    user_id,
    sum(amount) as paid_topup_credits
  from public.credit_ledger
  where type = 'topup'
    and reference_id like 'stripe_checkout:%'
  group by user_id
)
select
  p.id as user_id,
  p.total_credits_purchased,
  s.paid_topup_credits
from public.profiles p
join stripe_topups s on s.user_id = p.id
where coalesce(p.total_credits_purchased, 0) < s.paid_topup_credits
order by s.paid_topup_credits desc;
```

Expected result: zero rows.

## 4. Duplicate Credit Entries

Idempotency is keyed by `credit_ledger.reference_id =
'stripe_checkout:' || session.id`. Duplicate rows here indicate duplicated
crediting risk.

```sql
select
  reference_id,
  count(*) as ledger_count,
  sum(amount) as total_amount,
  array_agg(id order by created_at) as ledger_ids,
  min(created_at) as first_created_at,
  max(created_at) as last_created_at
from public.credit_ledger
where type = 'topup'
  and reference_id like 'stripe_checkout:%'
group by reference_id
having count(*) > 1
order by last_created_at desc;
```

Expected result: zero rows.

## 5. Paid Orders Without Ledger

These orders are marked paid but have no matching top-up ledger entry, so they
are not complete top-ups.

```sql
select
  o.id as order_id,
  o.user_id,
  o.status,
  o.credits,
  o.stripe_checkout_session_id,
  o.stripe_payment_intent_id,
  o.created_at,
  o.paid_at,
  o.updated_at
from public.credit_orders o
left join public.credit_ledger l
  on l.reference_id = 'stripe_checkout:' || o.stripe_checkout_session_id
 and l.type = 'topup'
where o.status = 'paid'
  and o.stripe_checkout_session_id is not null
  and l.id is null
order by o.paid_at desc nulls last, o.created_at desc;
```

Expected result: zero rows.

## 6. Ledger Exists But Order Still Pending

These rows indicate the webhook credited the ledger but did not finish repairing
the order status. The webhook should update the order to `paid` on duplicate
delivery as well.

```sql
select
  o.id as order_id,
  o.user_id,
  o.status,
  o.credits,
  o.stripe_checkout_session_id,
  l.id as ledger_id,
  l.amount,
  l.balance_after,
  l.created_at as ledger_created_at,
  o.created_at as order_created_at,
  o.updated_at as order_updated_at
from public.credit_orders o
join public.credit_ledger l
  on l.reference_id = 'stripe_checkout:' || o.stripe_checkout_session_id
where o.status = 'pending'
  and l.type = 'topup'
order by l.created_at desc;
```

Expected result: zero rows.

## 7. Pending Unpaid Orders

Pending orders are expected when a user opens Checkout and does not finish
payment. This query is for monitoring only; it is not an anomaly report unless
the volume or age is unexpected.

```sql
select
  id,
  user_id,
  status,
  credits,
  stripe_checkout_session_id,
  created_at,
  updated_at,
  now() - created_at as age
from public.credit_orders
where status = 'pending'
order by created_at desc
limit 100;
```

Older pending orders:

```sql
select
  id,
  user_id,
  credits,
  stripe_checkout_session_id,
  created_at,
  updated_at,
  now() - created_at as age
from public.credit_orders
where status = 'pending'
  and created_at < now() - interval '24 hours'
order by created_at asc;
```

Expected result: rows can exist. Treat them as abandoned or unfinished Checkout
sessions unless Stripe shows a successful payment for the same session.
