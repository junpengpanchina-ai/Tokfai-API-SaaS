-- =============================================================================
-- Tokfai Admin V1 — P0 security base
--
-- Adds admin identity registry and admin operation audit log tables.
--
-- Scope (this migration only):
--   - public.admin_users
--   - public.admin_audit_logs
--   - indexes, RLS, table grants
--
-- Out of scope (unchanged by this file):
--   - profiles (no admin columns added)
--   - credit_ledger / usage_logs / billing RPCs
--   - Stripe webhook / complete_credit_order
--   - apps/dmit-api / apps/web application code
--
-- Access model:
--   - RLS enabled with NO anon/authenticated policies
--   - REVOKE ALL from PUBLIC, anon, authenticated
--   - GRANT ALL to service_role only (DMIT backend)
--
-- Apply with `supabase db push` (linked project) or paste into Supabase SQL Editor.
-- =============================================================================

-- =============================================================================
-- admin_users — registered Tokfai admin identities (separate from profiles)
-- =============================================================================

create table if not exists public.admin_users (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  email        text not null,
  status       text not null default 'active'
                 check (status in ('active', 'suspended')),
  granted_by   uuid references auth.users (id) on delete set null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint admin_users_revoked_after_granted_chk
    check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.admin_users is
  'Tokfai admin identity registry. DMIT service_role only; not exposed to frontend.';

comment on column public.admin_users.user_id is
  'Supabase auth.users.id for the admin account.';

comment on column public.admin_users.email is
  'Normalized admin email (lowercase recommended). Denormalized for audit queries.';

comment on column public.admin_users.status is
  'active = may perform admin actions; suspended = blocked pending review.';

comment on column public.admin_users.granted_by is
  'auth.users.id of the admin who granted this row; null for bootstrap seeds.';

comment on column public.admin_users.revoked_at is
  'When set, this admin registration is revoked and must not authorize writes.';

create index if not exists admin_users_status_active_idx
  on public.admin_users (status)
  where revoked_at is null;

create unique index if not exists admin_users_email_active_idx
  on public.admin_users (lower(email))
  where revoked_at is null and status = 'active';

create index if not exists admin_users_granted_at_idx
  on public.admin_users (granted_at desc);

-- =============================================================================
-- admin_audit_logs — append-oriented audit trail for admin write operations
-- =============================================================================

create table if not exists public.admin_audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_user_id     uuid not null references auth.users (id) on delete restrict,
  actor_email       text not null,
  action            text not null,
  resource_type     text not null,
  resource_id       text not null,
  idempotency_key   text not null,
  request_payload   jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'succeeded', 'failed')),
  result_payload    jsonb,
  credit_ledger_id  uuid references public.credit_ledger (id) on delete set null,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,

  constraint admin_audit_logs_completed_after_created_chk
    check (completed_at is null or completed_at >= created_at)
);

comment on table public.admin_audit_logs is
  'Audit trail for Tokfai admin write operations. DMIT service_role only.';

comment on column public.admin_audit_logs.action is
  'Operation identifier, e.g. credits.adjust, models.patch, admin_users.grant.';

comment on column public.admin_audit_logs.resource_type is
  'Target resource class, e.g. profile, model, model_pricing, admin_user.';

comment on column public.admin_audit_logs.resource_id is
  'Target resource identifier (uuid or model id as text).';

comment on column public.admin_audit_logs.idempotency_key is
  'Client-supplied idempotency key; unique per actor to prevent duplicate submits.';

comment on column public.admin_audit_logs.request_payload is
  'Sanitized request snapshot. Must not contain secrets or raw tokens.';

comment on column public.admin_audit_logs.result_payload is
  'Sanitized success/failure details written when the operation completes.';

comment on column public.admin_audit_logs.credit_ledger_id is
  'Optional link to credit_ledger row when the admin action moved credits.';

create unique index if not exists admin_audit_logs_idempotency_idx
  on public.admin_audit_logs (actor_user_id, idempotency_key);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_actor_created_at_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);

create index if not exists admin_audit_logs_resource_idx
  on public.admin_audit_logs (resource_type, resource_id, created_at desc);

create index if not exists admin_audit_logs_status_pending_idx
  on public.admin_audit_logs (status, created_at desc)
  where status = 'pending';

create index if not exists admin_audit_logs_credit_ledger_id_idx
  on public.admin_audit_logs (credit_ledger_id)
  where credit_ledger_id is not null;

-- =============================================================================
-- RLS — no frontend access; service_role bypasses RLS for DMIT writes/reads
-- =============================================================================

alter table public.admin_users      enable row level security;
alter table public.admin_audit_logs enable row level security;

-- Intentionally NO SELECT / INSERT / UPDATE / DELETE policies for
-- anon or authenticated. If a policy is added here in the future, stop and
-- reconsider — admin tables should remain DMIT-only.

-- =============================================================================
-- Table grants — service_role only
-- =============================================================================

revoke all on table public.admin_users      from public, anon, authenticated;
revoke all on table public.admin_audit_logs from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_users      to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;

-- =============================================================================
-- Bootstrap seed (manual — run in Supabase SQL Editor after migration)
-- =============================================================================
--
-- Prerequisite: junpengpanchina@gmail.com must already exist in auth.users
-- (sign up or invite the account before running this block).
--
-- insert into public.admin_users (
--   user_id,
--   email,
--   status,
--   notes
-- )
-- select
--   u.id,
--   lower(u.email),
--   'active',
--   'bootstrap admin — migration 0012_admin_security_base'
-- from auth.users as u
-- where lower(u.email) = 'junpengpanchina@gmail.com'
-- on conflict (user_id) do update
-- set
--   email = excluded.email,
--   status = 'active',
--   revoked_at = null,
--   notes = excluded.notes,
--   updated_at = now();
--
-- Verify:
-- select id, user_id, email, status, granted_at, revoked_at, notes
-- from public.admin_users
-- where lower(email) = 'junpengpanchina@gmail.com';
