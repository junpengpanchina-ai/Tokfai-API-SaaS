-- =============================================================================
-- Tokfai P7.10 — models catalog + per-model pricing
--
-- Adds public.models and public.model_pricing for Admin-managed catalog and
-- billing rules. Legacy columns (billing_mode, input_per_1k, billable, …) are
-- kept when present so existing rows can be backfilled into the P7.10 shape.
--
-- Access model:
--   - RLS enabled; authenticated users may SELECT visible catalog rows only
--   - upstream_cost_note is never exposed via RLS policies (DMIT admin only)
--   - Writes remain service_role-only (DMIT backend)
-- =============================================================================

-- =============================================================================
-- models — catalog metadata (one row per model id)
-- =============================================================================

create table if not exists public.models (
  id            text primary key,
  display_name  text,
  provider      text,
  model_type    text check (model_type in ('chat', 'image', 'video', 'other')),
  enabled       boolean not null default false,
  visible       boolean not null default false,
  sort_order    int not null default 1000,
  owned_by      text not null default 'tokfai',
  created       bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists models_visible_enabled_sort_idx
  on public.models (sort_order asc, id asc)
  where enabled = true and visible = true;

-- =============================================================================
-- model_pricing — per-model retail billing rules
-- =============================================================================

create table if not exists public.model_pricing (
  id                               uuid primary key default gen_random_uuid(),
  model_id                         text not null unique references public.models (id) on delete cascade,
  billing_type                     text not null default 'chat'
                                     check (billing_type in ('chat', 'image')),
  input_credits_per_million_tokens numeric(16, 6) not null default 0,
  output_credits_per_million_tokens numeric(16, 6) not null default 0,
  image_credits_per_generation     numeric(16, 6) not null default 0,
  upstream_cost_note               text,
  markup_ratio                     numeric(8, 4) not null default 1,
  enabled                          boolean not null default false,
  visible                          boolean not null default false,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),

  -- Legacy columns (pre-P7.10) — kept for backfill; DMIT prefers P7.10 fields
  billing_mode     text check (billing_mode in ('token', 'per_image')),
  input_per_1k     numeric(12, 6),
  output_per_1k    numeric(12, 6),
  billable         boolean,
  markup_multiplier numeric(8, 4)
);

create index if not exists model_pricing_enabled_visible_idx
  on public.model_pricing (model_id)
  where enabled = true and visible = true;

-- Backfill P7.10 columns from legacy columns when migrating existing rows
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
  'Per-model retail billing rules. upstream_cost_note is admin-only (not in RLS SELECT).';

comment on column public.model_pricing.upstream_cost_note is
  'Internal upstream cost note for admins. Never exposed to dashboard users.';

-- =============================================================================
-- RLS — read-only catalog for signed-in users; no writes from frontend
-- =============================================================================

alter table public.models       enable row level security;
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
