-- =============================================================================
-- Recharge plans: ¥1 = 10,000 compute credits (算力积分).
-- Data-only update — no schema / Stripe webhook / RPC changes.
-- Checkout falls back to Stripe price_data.unit_amount when stripe_price_id is null.
-- =============================================================================

-- Soft-archive legacy tiers (keep history; hide from catalog).
update public.recharge_plans
set
  enabled = false,
  visible = false,
  archived_at = coalesce(archived_at, now()),
  updated_at = now()
where id in ('starter', 'pro', 'business')
  and archived_at is null;

insert into public.recharge_plans (
  id,
  name,
  amount_cents,
  currency,
  base_credits,
  bonus_credits,
  credits,
  enabled,
  visible,
  sort_order,
  badge,
  description,
  stripe_price_id,
  stripe_product_id,
  archived_at
)
values
  (
    'credit_10',
    '¥10',
    1000,
    'cny',
    100000,
    0,
    100000,
    true,
    true,
    100,
    null,
    '¥10 → 100,000 算力积分',
    null,
    null,
    null
  ),
  (
    'credit_20',
    '¥20',
    2000,
    'cny',
    200000,
    20000,
    220000,
    true,
    true,
    200,
    'Popular',
    '¥20 → 220,000 算力积分（送 10%）',
    null,
    null,
    null
  ),
  (
    'credit_49',
    '¥49',
    4900,
    'cny',
    490000,
    73500,
    563500,
    true,
    true,
    300,
    null,
    '¥49 → 563,500 算力积分（送 15%）',
    null,
    null,
    null
  ),
  (
    'credit_99',
    '¥99',
    9900,
    'cny',
    990000,
    198000,
    1188000,
    true,
    true,
    400,
    null,
    '¥99 → 1,188,000 算力积分（送 20%）',
    null,
    null,
    null
  ),
  (
    'credit_499',
    '¥499',
    49900,
    'cny',
    4990000,
    998000,
    5988000,
    true,
    true,
    500,
    null,
    '¥499 → 5,988,000 算力积分（送 20%）',
    null,
    null,
    null
  ),
  (
    'credit_999',
    '¥999',
    99900,
    'cny',
    9990000,
    1998000,
    11988000,
    true,
    true,
    600,
    null,
    '¥999 → 11,988,000 算力积分（送 20%）',
    null,
    null,
    null
  )
on conflict (id) do update set
  name = excluded.name,
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  base_credits = excluded.base_credits,
  bonus_credits = excluded.bonus_credits,
  credits = excluded.credits,
  enabled = excluded.enabled,
  visible = excluded.visible,
  sort_order = excluded.sort_order,
  badge = excluded.badge,
  description = excluded.description,
  stripe_price_id = null,
  archived_at = null,
  updated_at = now();
