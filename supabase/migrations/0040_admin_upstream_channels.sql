-- =============================================================================
-- P1077R2 — Durable admin upstream channels (Chat/Image/STT reusable)
--
-- Generic channel persistence for Tokfai admin "渠道".
-- STT does NOT get a dedicated secret table — secrets live as encrypted_api_key
-- on this shared channel row (AES-GCM via TOKFAI_KEY_ENCRYPTION_SECRET).
--
-- Writes: DMIT service_role only.
-- Reads: never exposed to anon/authenticated (no consumer access).
-- =============================================================================

create table if not exists public.admin_upstream_channels (
  id                 text primary key,
  name               text not null check (char_length(trim(name)) > 0),
  capability         text not null
                     check (capability in ('audio_transcription', 'chat_image')),
  provider           text not null check (char_length(trim(provider)) > 0),
  base_url           text not null check (char_length(trim(base_url)) > 0),
  default_model      text,
  -- AES-GCM ciphertext only (v1:iv:tag:cipher). Never store plaintext upstream keys.
  encrypted_api_key  text,
  api_key_last4      text,
  enabled            boolean not null default true,
  status             text not null default 'active'
                     check (status in ('active', 'disabled')),
  priority           integer not null default 10
                     check (priority >= 0 and priority <= 10000),
  weight             integer not null default 100
                     check (weight >= 0 and weight <= 10000),
  timeout_ms         integer check (timeout_ms is null or timeout_ms >= 1000),
  last_error         text,
  modalities         text[] not null default '{}'::text[],
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.admin_upstream_channels is
  'Admin upstream routing channels (STT/chat/image). Secrets encrypted at rest; service_role only.';

comment on column public.admin_upstream_channels.encrypted_api_key is
  'AES-256-GCM ciphertext from TOKFAI_KEY_ENCRYPTION_SECRET. Never plaintext.';

create index if not exists admin_upstream_channels_capability_enabled_priority_idx
  on public.admin_upstream_channels (capability, enabled, priority asc, created_at asc);

create index if not exists admin_upstream_channels_updated_at_idx
  on public.admin_upstream_channels (updated_at desc);

alter table public.admin_upstream_channels enable row level security;

-- No consumer/anon policies — empty RLS deny for non-service roles.
revoke all on table public.admin_upstream_channels from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_upstream_channels to service_role;
