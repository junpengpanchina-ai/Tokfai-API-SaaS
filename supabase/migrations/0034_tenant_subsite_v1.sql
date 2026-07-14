-- Tenant / 分站 V1: multi-host tenants with domain binding, model/pricing
-- overrides, and nullable tenant_id attribution on keys / usage / ledger / orders.
-- Compatible with existing rows (tenant_id NULL = Tokfai 主站).
-- Does NOT change Stripe Checkout flow signatures.

-- =============================================================================
-- Core tenant tables
-- =============================================================================

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  logo_url text,
  primary_domain text,
  default_locale text not null default 'zh-CN',
  base_price_multiplier numeric(12, 6) not null default 1
    check (base_price_multiplier > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenants_slug_uidx
  on public.tenants (lower(slug));

create index if not exists tenants_status_idx
  on public.tenants (status);

comment on table public.tenants is
  'Reseller / 分站. NULL tenant_id on child rows means Tokfai main site.';

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  domain text not null,
  domain_type text not null
    check (domain_type in ('tokfai_subdomain', 'custom_domain')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disabled')),
  ssl_status text not null default 'pending'
    check (ssl_status in ('pending', 'active', 'failed')),
  dns_status text not null default 'pending'
    check (dns_status in ('pending', 'active', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_domains_domain_uidx
  on public.tenant_domains (lower(domain));

create index if not exists tenant_domains_tenant_idx
  on public.tenant_domains (tenant_id);

create index if not exists tenant_domains_active_lookup_idx
  on public.tenant_domains (lower(domain))
  where status = 'active';

comment on table public.tenant_domains is
  'Host bindings for tenants. V1: manual DNS/SSL; no Cloudflare auto-provision.';

create table if not exists public.tenant_model_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  model_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, model_id)
);

create index if not exists tenant_model_settings_tenant_idx
  on public.tenant_model_settings (tenant_id);

comment on table public.tenant_model_settings is
  'Per-tenant model enable overrides. Missing row inherits main catalog.';

create table if not exists public.tenant_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  model_id text not null,
  price_multiplier numeric(12, 6) not null
    check (price_multiplier > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, model_id)
);

create index if not exists tenant_pricing_rules_tenant_idx
  on public.tenant_pricing_rules (tenant_id);

comment on table public.tenant_pricing_rules is
  'Per-model retail multiplier override. Else tenants.base_price_multiplier.';

create table if not exists public.tenant_admins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists tenant_admins_tenant_idx
  on public.tenant_admins (tenant_id);

comment on table public.tenant_admins is
  'Subsite admin contacts. Global admin_users still own platform ops in V1.';

-- Service role only (admin + DMIT). No anon/authenticated policies.
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_model_settings enable row level security;
alter table public.tenant_pricing_rules enable row level security;
alter table public.tenant_admins enable row level security;

revoke all on table public.tenants from public, anon, authenticated;
revoke all on table public.tenant_domains from public, anon, authenticated;
revoke all on table public.tenant_model_settings from public, anon, authenticated;
revoke all on table public.tenant_pricing_rules from public, anon, authenticated;
revoke all on table public.tenant_admins from public, anon, authenticated;

grant select, insert, update, delete on table public.tenants to service_role;
grant select, insert, update, delete on table public.tenant_domains to service_role;
grant select, insert, update, delete on table public.tenant_model_settings to service_role;
grant select, insert, update, delete on table public.tenant_pricing_rules to service_role;
grant select, insert, update, delete on table public.tenant_admins to service_role;

-- =============================================================================
-- Attribution columns (nullable = main site / legacy rows)
-- =============================================================================

alter table public.api_keys
  add column if not exists tenant_id uuid references public.tenants (id);

alter table public.usage_logs
  add column if not exists tenant_id uuid references public.tenants (id);

alter table public.credit_ledger
  add column if not exists tenant_id uuid references public.tenants (id);

alter table public.credit_orders
  add column if not exists tenant_id uuid references public.tenants (id);

create index if not exists api_keys_tenant_id_idx
  on public.api_keys (tenant_id)
  where tenant_id is not null;

create index if not exists usage_logs_tenant_id_idx
  on public.usage_logs (tenant_id, created_at desc)
  where tenant_id is not null;

create index if not exists credit_ledger_tenant_id_idx
  on public.credit_ledger (tenant_id, created_at desc)
  where tenant_id is not null;

create index if not exists credit_orders_tenant_id_idx
  on public.credit_orders (tenant_id, created_at desc)
  where tenant_id is not null;

comment on column public.api_keys.tenant_id is
  'Tenant where the key was created. NULL = Tokfai main site.';
comment on column public.usage_logs.tenant_id is
  'Tenant attribution for usage. NULL = main site / legacy.';
comment on column public.credit_ledger.tenant_id is
  'Tenant attribution for ledger rows. NULL = main site / legacy.';
comment on column public.credit_orders.tenant_id is
  'Tenant where checkout was started. NULL = main site / legacy.';

-- =============================================================================
-- debit_credits: optional tenant_id (drop 4-arg; 5th arg defaults so old
-- rpc payloads without p_tenant_id still work)
-- =============================================================================

drop function if exists public.debit_credits(uuid, numeric, text, text);
drop function if exists public.debit_credits(uuid, numeric, text, text, uuid);

create function public.debit_credits(
  p_user_id       uuid,
  p_amount        numeric,
  p_reason        text,
  p_reference_id  text,
  p_tenant_id     uuid default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance     numeric;
  v_new_balance numeric;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_new_balance := v_balance - p_amount;

  update public.profiles set
    credits_balance     = v_new_balance,
    total_credits_used  = total_credits_used + p_amount,
    updated_at          = now()
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id, type, amount, balance_after, reason, reference_id, tenant_id
  )
  values (
    p_user_id, 'debit', -p_amount, v_new_balance, p_reason, p_reference_id, p_tenant_id
  );

  return v_new_balance;
end;
$$;

revoke all on function public.debit_credits(uuid, numeric, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.debit_credits(uuid, numeric, text, text, uuid)
  to service_role;

-- =============================================================================
-- record_usage_and_debit: optional p_tenant_id (append; drop+recreate)
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_usage_and_debit'
  loop
    execute format(
      'drop function if exists public.record_usage_and_debit(%s)',
      r.args
    );
  end loop;
end $$;

create function public.record_usage_and_debit(
  p_user_id             uuid,
  p_api_key_id          uuid,
  p_model               text,
  p_prompt_tokens       int,
  p_completion_tokens   int,
  p_total_tokens        int,
  p_credits_charged     numeric,
  p_request_id          text,
  p_upstream_id         text,
  p_latency_ms          int,
  p_billable            boolean default true,
  p_finish_reason       text default null,
  p_upstream_status     int default null,
  p_upstream_error_code text default null,
  p_safety_reason       text default null,
  p_idempotency_key     text default null,
  p_endpoint            text default null,
  p_response_snapshot   jsonb default null,
  p_tenant_id           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance       numeric;
  v_new_balance   numeric;
  v_ledger_id     uuid;
  v_existing      jsonb;
  v_billing_status text := 'charged';
  v_tenant_id     uuid := p_tenant_id;
begin
  if p_credits_charged is null or p_credits_charged < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Prefer explicit tenant; else inherit from api_keys when present.
  if v_tenant_id is null and p_api_key_id is not null then
    select tenant_id into v_tenant_id
    from public.api_keys
    where id = p_api_key_id;
  end if;

  v_existing := public.lookup_usage_idempotency(
    p_api_key_id,
    p_idempotency_key,
    p_endpoint
  );

  if v_existing is not null then
    select credits_balance
      into v_balance
      from public.profiles
     where id = p_user_id;

    return v_existing || jsonb_build_object(
      'balance_after', coalesce(v_balance, 0),
      'idempotent_replay', true
    );
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if v_balance < p_credits_charged then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_new_balance := v_balance - p_credits_charged;

  if p_credits_charged > 0 then
    update public.profiles set
      credits_balance     = v_new_balance,
      total_credits_used  = total_credits_used + p_credits_charged,
      updated_at          = now()
    where id = p_user_id;

    insert into public.credit_ledger (
      user_id,
      type,
      amount,
      balance_after,
      reason,
      reference_id,
      tenant_id
    )
    values (
      p_user_id,
      'debit',
      -p_credits_charged,
      v_new_balance,
      'Chat completion usage',
      p_request_id,
      v_tenant_id
    )
    returning id into v_ledger_id;
  else
    v_billing_status := 'not_billable';
  end if;

  insert into public.usage_logs (
    user_id,
    api_key_id,
    model,
    status,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    credits_charged,
    request_id,
    upstream_id,
    error_code,
    error_message,
    latency_ms,
    billable,
    finish_reason,
    upstream_status,
    upstream_error_code,
    safety_reason,
    idempotency_key,
    endpoint,
    debit_ledger_id,
    billing_status,
    response_snapshot,
    tenant_id
  )
  values (
    p_user_id,
    p_api_key_id,
    p_model,
    'succeeded',
    p_prompt_tokens,
    p_completion_tokens,
    p_total_tokens,
    p_credits_charged,
    p_request_id,
    p_upstream_id,
    null,
    null,
    p_latency_ms,
    coalesce(p_billable, true),
    p_finish_reason,
    p_upstream_status,
    p_upstream_error_code,
    p_safety_reason,
    nullif(trim(p_idempotency_key), ''),
    nullif(trim(p_endpoint), ''),
    v_ledger_id,
    v_billing_status,
    p_response_snapshot,
    v_tenant_id
  );

  return jsonb_build_object(
    'balance_after', v_new_balance,
    'debit_ledger_id', v_ledger_id,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int,
  boolean, text, int, text, text, text, text, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int,
  boolean, text, int, text, text, text, text, jsonb, uuid
) to service_role;

-- =============================================================================
-- complete_credit_order: copy tenant_id from order onto ledger topup
-- (Stripe webhook args unchanged)
-- =============================================================================

create or replace function public.complete_credit_order(
  p_order_id                    uuid,
  p_user_id                     uuid,
  p_stripe_checkout_session_id  text,
  p_stripe_payment_intent_id    text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.credit_orders%rowtype;
  v_balance      numeric;
  v_new_balance  numeric;
  v_reference_id text;
begin
  if p_order_id is null then
    raise exception 'missing_order_id' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'missing_user_id' using errcode = '22023';
  end if;
  if p_stripe_checkout_session_id is null or length(p_stripe_checkout_session_id) = 0 then
    raise exception 'missing_stripe_checkout_session_id' using errcode = '22023';
  end if;

  v_reference_id := 'stripe_checkout:' || p_stripe_checkout_session_id;

  select * into v_order
  from public.credit_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'credit_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.user_id <> p_user_id then
    raise exception 'credit_order_user_mismatch' using errcode = '22023';
  end if;
  if v_order.stripe_checkout_session_id is not null
     and v_order.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    raise exception 'credit_order_session_mismatch' using errcode = '22023';
  end if;

  if v_order.status = 'paid' then
    update public.credit_orders set
      stripe_checkout_session_id  = p_stripe_checkout_session_id,
      stripe_payment_intent_id    = coalesce(stripe_payment_intent_id, p_stripe_payment_intent_id),
      paid_at                     = coalesce(paid_at, now()),
      updated_at                  = now()
    where id = v_order.id;

    select credits_balance into v_new_balance
    from public.profiles
    where id = p_user_id;

    return v_new_balance;
  end if;

  if exists (
    select 1
    from public.credit_ledger
    where type = 'topup'
      and reference_id in (v_reference_id, p_stripe_checkout_session_id)
  ) then
    update public.credit_orders set
      status                      = 'paid',
      stripe_checkout_session_id  = p_stripe_checkout_session_id,
      stripe_payment_intent_id    = coalesce(stripe_payment_intent_id, p_stripe_payment_intent_id),
      paid_at                     = coalesce(paid_at, now()),
      updated_at                  = now()
    where id = v_order.id;

    select credits_balance into v_new_balance
    from public.profiles
    where id = p_user_id;

    return v_new_balance;
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_new_balance := v_balance + v_order.credits;

  update public.profiles set
    credits_balance          = v_new_balance,
    total_credits_purchased  = coalesce(total_credits_purchased, 0) + v_order.credits,
    updated_at               = now()
  where id = p_user_id;

  begin
    insert into public.credit_ledger (
      user_id,
      type,
      amount,
      balance_after,
      reason,
      reference_id,
      tenant_id
    )
    values (
      p_user_id,
      'topup',
      v_order.credits,
      v_new_balance,
      'stripe_checkout_completed',
      v_reference_id,
      v_order.tenant_id
    );
  exception
    when unique_violation then
      select credits_balance into v_new_balance
      from public.profiles
      where id = p_user_id;
  end;

  update public.credit_orders set
    status                      = 'paid',
    stripe_checkout_session_id  = p_stripe_checkout_session_id,
    stripe_payment_intent_id    = p_stripe_payment_intent_id,
    paid_at                     = coalesce(paid_at, now()),
    updated_at                  = now()
  where id = v_order.id;

  return v_new_balance;
end;
$$;

revoke all on function public.complete_credit_order(
  uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.complete_credit_order(
  uuid, uuid, text, text
) to service_role;
