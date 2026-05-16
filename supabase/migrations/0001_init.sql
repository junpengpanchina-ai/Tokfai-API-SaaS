-- =============================================================================
-- Tokfai initial schema
--
-- Owner: this file is the source of truth for the database shape that
-- the Vercel frontend reads (via anon key + RLS) and that DMIT writes
-- (via service_role).
--
-- Apply with `supabase db push` (linked project) or paste into the Supabase
-- SQL editor.
-- =============================================================================

-- Required extensions ---------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =============================================================================
-- profiles  — one row per auth.users.id, holds balance + Stripe customer id
-- =============================================================================

create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text,
  credits_balance          numeric(12, 6) not null default 0,
  total_credits_purchased  numeric(12, 6) not null default 0,
  total_credits_used       numeric(12, 6) not null default 0,
  stripe_customer_id       text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- =============================================================================
-- api_keys  — sk-tokfai_<48 hex chars>, only hash is stored
-- =============================================================================
--
-- Key format produced by DMIT:
--   sk-tokfai_{24 random bytes encoded as 48 lowercase hex chars}
--
-- DMIT lookup path on every /v1/chat/completions request:
--   1. validate incoming token format -> sk-tokfai_<48 lowercase hex chars>
--   2. hash full token with HMAC-SHA256(TOKEN_PEPPER, token)
--   3. SELECT ... FROM api_keys WHERE hash = $1 AND revoked_at IS NULL
--
-- The `prefix` column is the public-display form (secret.slice(0, 18) + '...')
-- shown in the dashboard; it does NOT include the full secret.

create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  key_id        text not null unique,
  prefix        text not null,
  hash          text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists api_keys_user_id_created_at_idx
  on public.api_keys (user_id, created_at desc);

create unique index if not exists api_keys_active_key_id_idx
  on public.api_keys (key_id)
  where revoked_at is null;

-- =============================================================================
-- usage_logs  — one row per API call, written by DMIT only
-- =============================================================================

create table if not exists public.usage_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  api_key_id        uuid references public.api_keys (id) on delete set null,
  created_at        timestamptz not null default now(),

  model             text,
  status            text not null,           -- 'succeeded' | 'failed' | 'rate_limited' | ...
  prompt_tokens     int,
  completion_tokens int,
  total_tokens      int,
  credits_charged   numeric(12, 6),

  request_id        text unique,             -- shown to user / in logs (req_...)
  upstream_id       text,                    -- GRSAI / OpenAI / etc. provider id
  error_code        text,
  error_message     text,
  latency_ms        int
);

create index if not exists usage_logs_user_id_created_at_idx
  on public.usage_logs (user_id, created_at desc);

create index if not exists usage_logs_user_id_status_idx
  on public.usage_logs (user_id, status);

-- =============================================================================
-- credit_ledger  — append-only ledger, written by DMIT only
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'credit_ledger_type'
  ) then
    create type public.credit_ledger_type as enum (
      'purchase',   -- Stripe top-up
      'grant',      -- system grant / promo
      'refund',     -- Stripe refund
      'debit',      -- per-request usage debit
      'adjustment'  -- manual correction
    );
  end if;
end$$;

create table if not exists public.credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),

  type           public.credit_ledger_type not null,
  amount         numeric(12, 6) not null,         -- positive = credit added, negative = debit
  balance_after  numeric(12, 6) not null,

  reason         text,
  reference_id   text
);

create index if not exists credit_ledger_user_id_created_at_idx
  on public.credit_ledger (user_id, created_at desc);

-- Stripe webhook idempotency: every (type='purchase', reference_id)
-- maps to exactly one ledger row.
create unique index if not exists credit_ledger_purchase_ref_idx
  on public.credit_ledger (reference_id)
  where type = 'purchase' and reference_id is not null;

-- =============================================================================
-- RLS — frontend (anon key + user session) reads only its own rows.
--      All writes go through service_role from DMIT (bypasses RLS).
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.api_keys      enable row level security;
alter table public.usage_logs    enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "profiles_select_own"      on public.profiles;
drop policy if exists "api_keys_select_own"      on public.api_keys;
drop policy if exists "usage_logs_select_own"    on public.usage_logs;
drop policy if exists "credit_ledger_select_own" on public.credit_ledger;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "api_keys_select_own"
  on public.api_keys for select
  using (auth.uid() = user_id);

create policy "usage_logs_select_own"
  on public.usage_logs for select
  using (auth.uid() = user_id);

create policy "credit_ledger_select_own"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

-- IMPORTANT: no INSERT / UPDATE / DELETE policies anywhere. Writes are
-- service_role-only (DMIT). If you ever find yourself adding one of those
-- policies, stop — that write probably belongs in DMIT instead.

-- =============================================================================
-- Auto-create a profile row when a Supabase auth user is created
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RPC: debit_credits  — atomic per-request debit, called by DMIT after a
-- successful /v1/chat/completions response.
--
-- Raises P0001 'insufficient_credits' when balance < amount so the caller
-- can refund the upstream response if needed.
-- =============================================================================

create or replace function public.debit_credits(
  p_user_id       uuid,
  p_amount        numeric,
  p_reason        text,
  p_reference_id  text
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

  insert into public.credit_ledger (user_id, type, amount, balance_after, reason, reference_id)
  values (p_user_id, 'debit', -p_amount, v_new_balance, p_reason, p_reference_id);

  return v_new_balance;
end;
$$;

revoke all on function public.debit_credits(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.debit_credits(uuid, numeric, text, text) to service_role;

-- =============================================================================
-- RPC: credit_purchase  — idempotent top-up, called by DMIT from Stripe webhook
-- =============================================================================

create or replace function public.credit_purchase(
  p_user_id       uuid,
  p_amount        numeric,
  p_reference_id  text,
  p_reason        text default 'Stripe Checkout'
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance         numeric;
  v_new_balance     numeric;
  v_existing_count  int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_reference_id is null or length(p_reference_id) = 0 then
    raise exception 'missing_reference_id' using errcode = '22023';
  end if;

  -- Idempotency: if this Stripe session has already been ledgered, return
  -- the current balance without writing anything.
  select count(*) into v_existing_count from public.credit_ledger
    where type = 'purchase' and reference_id = p_reference_id;
  if v_existing_count > 0 then
    select credits_balance into v_new_balance from public.profiles where id = p_user_id;
    return v_new_balance;
  end if;

  select credits_balance into v_balance from public.profiles
    where id = p_user_id for update;
  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_new_balance := v_balance + p_amount;

  update public.profiles set
    credits_balance          = v_new_balance,
    total_credits_purchased  = total_credits_purchased + p_amount,
    updated_at               = now()
  where id = p_user_id;

  insert into public.credit_ledger (user_id, type, amount, balance_after, reason, reference_id)
  values (p_user_id, 'purchase', p_amount, v_new_balance, p_reason, p_reference_id);

  return v_new_balance;
end;
$$;

revoke all on function public.credit_purchase(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.credit_purchase(uuid, numeric, text, text) to service_role;

-- =============================================================================
-- Convenience grants
-- =============================================================================

-- service_role bypasses RLS but still needs the table grants in some setups.
grant select, insert, update, delete on public.profiles      to service_role;
grant select, insert, update, delete on public.api_keys      to service_role;
grant select, insert, update, delete on public.usage_logs    to service_role;
grant select, insert, update, delete on public.credit_ledger to service_role;

-- anon / authenticated can SELECT only what RLS permits.
grant select on public.profiles      to anon, authenticated;
grant select on public.api_keys      to anon, authenticated;
grant select on public.usage_logs    to anon, authenticated;
grant select on public.credit_ledger to anon, authenticated;
