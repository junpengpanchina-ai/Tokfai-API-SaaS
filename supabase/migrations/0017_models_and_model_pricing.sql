-- =============================================================================
-- Tokfai P7.10 — models catalog + per-model pricing
--
-- Production-safe / idempotent:
--   1. create table if not exists (minimal skeleton for pre-existing tables)
--   2. alter table add column if not exists (ALL columns, before indexes/policies)
--   3. indexes, backfill, RLS, grants
--
-- Does NOT touch: credit_ledger, profiles, usage_logs, recharge_plans, credit_orders
--
-- Access model:
--   - RLS enabled; authenticated users may SELECT visible catalog rows only
--   - upstream_cost_note is never exposed via dashboard API (DMIT filters SELECT)
--   - Writes remain service_role-only (DMIT backend)
-- =============================================================================

-- =============================================================================
-- Step 1 — public.models: skeleton + column upgrades (must run first)
-- =============================================================================

create table if not exists public.models (
  id text primary key
);

alter table public.models add column if not exists display_name text;
alter table public.models add column if not exists provider text;
alter table public.models add column if not exists model_type text;
alter table public.models add column if not exists enabled boolean not null default false;
alter table public.models add column if not exists visible boolean not null default false;
alter table public.models add column if not exists sort_order int not null default 1000;
alter table public.models add column if not exists owned_by text not null default 'tokfai';
alter table public.models add column if not exists created bigint;
alter table public.models add column if not exists created_at timestamptz not null default now();
alter table public.models add column if not exists updated_at timestamptz not null default now();

-- Optional check constraint (skip if already present)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'models_model_type_check'
      and conrelid = 'public.models'::regclass
  ) then
    alter table public.models
      add constraint models_model_type_check
      check (model_type is null or model_type in ('chat', 'image', 'video', 'other'));
  end if;
end$$;

create index if not exists models_visible_enabled_sort_idx
  on public.models (sort_order asc, id asc)
  where enabled = true and visible = true;

-- =============================================================================
-- Step 2 — public.model_pricing: skeleton + column upgrades
-- =============================================================================

create table if not exists public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  model_id text not null unique
);

alter table public.model_pricing add column if not exists id uuid default gen_random_uuid();
alter table public.model_pricing add column if not exists model_id text;
alter table public.model_pricing add column if not exists billing_type text not null default 'chat';
alter table public.model_pricing add column if not exists input_credits_per_million_tokens numeric(16, 6) not null default 0;
alter table public.model_pricing add column if not exists output_credits_per_million_tokens numeric(16, 6) not null default 0;
alter table public.model_pricing add column if not exists image_credits_per_generation numeric(16, 6) not null default 0;
alter table public.model_pricing add column if not exists upstream_cost_note text;
alter table public.model_pricing add column if not exists markup_ratio numeric(8, 4) not null default 1;
alter table public.model_pricing add column if not exists enabled boolean not null default false;
alter table public.model_pricing add column if not exists visible boolean not null default false;
alter table public.model_pricing add column if not exists created_at timestamptz not null default now();
alter table public.model_pricing add column if not exists updated_at timestamptz not null default now();

-- Legacy columns (pre-P7.10) — kept for backfill
alter table public.model_pricing add column if not exists billing_mode text;
alter table public.model_pricing add column if not exists input_per_1k numeric(12, 6);
alter table public.model_pricing add column if not exists output_per_1k numeric(12, 6);
alter table public.model_pricing add column if not exists billable boolean;
alter table public.model_pricing add column if not exists markup_multiplier numeric(8, 4);

-- FK to models (add only when missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'model_pricing_model_id_fkey'
      and conrelid = 'public.model_pricing'::regclass
  ) then
    alter table public.model_pricing
      add constraint model_pricing_model_id_fkey
      foreign key (model_id) references public.models (id) on delete cascade;
  end if;
end$$;

-- Unique on model_id (add only when missing)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'model_pricing_model_id_key'
      and conrelid = 'public.model_pricing'::regclass
  ) then
    alter table public.model_pricing
      add constraint model_pricing_model_id_key unique (model_id);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'model_pricing_billing_type_check'
      and conrelid = 'public.model_pricing'::regclass
  ) then
    alter table public.model_pricing
      add constraint model_pricing_billing_type_check
      check (billing_type in ('chat', 'image'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'model_pricing_billing_mode_check'
      and conrelid = 'public.model_pricing'::regclass
  ) then
    alter table public.model_pricing
      add constraint model_pricing_billing_mode_check
      check (billing_mode is null or billing_mode in ('token', 'per_image'));
  end if;
end$$;

create index if not exists model_pricing_enabled_visible_idx
  on public.model_pricing (model_id)
  where enabled = true and visible = true;

-- =============================================================================
-- Step 3 — Backfill P7.10 columns from legacy columns
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'model_pricing'
      and column_name = 'billing_mode'
  ) then
    update public.model_pricing
    set
      billing_type = case
        when billing_mode = 'per_image' then 'image'
        else coalesce(billing_type, 'chat')
      end,
      input_credits_per_million_tokens = case
        when coalesce(input_credits_per_million_tokens, 0) = 0
          and input_per_1k is not null
          then input_per_1k * 1000
        else input_credits_per_million_tokens
      end,
      output_credits_per_million_tokens = case
        when coalesce(output_credits_per_million_tokens, 0) = 0
          and output_per_1k is not null
          then output_per_1k * 1000
        else output_credits_per_million_tokens
      end,
      image_credits_per_generation = case
        when coalesce(image_credits_per_generation, 0) = 0
          and billing_mode = 'per_image'
          and input_per_1k is not null
          then input_per_1k * coalesce(nullif(markup_multiplier, 0), 1)
        else image_credits_per_generation
      end,
      markup_ratio = coalesce(
        nullif(markup_ratio, 0),
        nullif(markup_multiplier, 0),
        1
      ),
      enabled = coalesce(enabled, billable, false),
      visible = coalesce(visible, billable, false)
    where billing_mode is not null
       or input_per_1k is not null
       or billable is not null;
  end if;
end$$;

comment on table public.models is
  'Tokfai model catalog. DMIT writes; authenticated users read visible rows via RLS.';

comment on table public.model_pricing is
  'Per-model retail billing rules. upstream_cost_note is admin-only (not in dashboard API).';

comment on column public.model_pricing.upstream_cost_note is
  'Internal upstream cost note for admins. Never exposed to dashboard users.';

-- =============================================================================
-- Step 4 — RLS + grants (after enabled/visible columns exist)
-- =============================================================================

alter table public.models        enable row level security;
alter table public.model_pricing enable row level security;

drop policy if exists "models_select_visible" on public.models;
create policy "models_select_visible"
  on public.models for select
  using (enabled = true and visible = true);

drop policy if exists "model_pricing_select_visible" on public.model_pricing;
create policy "model_pricing_select_visible"
  on public.model_pricing for select
  using (
    enabled = true
    and visible = true
    and exists (
      select 1
      from public.models as m
      where m.id = model_pricing.model_id
        and m.enabled = true
        and m.visible = true
    )
  );

-- No INSERT / UPDATE / DELETE policies for anon or authenticated.

revoke all on table public.models        from public, anon, authenticated;
revoke all on table public.model_pricing from public, anon, authenticated;

grant select on table public.models        to authenticated;
grant select on table public.model_pricing to authenticated;

grant select, insert, update, delete on table public.models        to service_role;
grant select, insert, update, delete on table public.model_pricing to service_role;
