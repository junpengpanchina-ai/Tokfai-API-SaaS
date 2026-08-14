-- =============================================================================
-- P1095 — Durable Responses previous_response_id tool-state store
--
-- Optional. When missing, DMIT falls back to in-memory Map (P1093 behavior).
-- Payload is AES-256-GCM ciphertext only (RESPONSES_STATE_ENCRYPTION_KEY).
-- Never store Authorization / API keys / round2 tool outputs in plaintext.
--
-- Writes: DMIT service_role only.
-- Reads: never exposed to anon/authenticated.
-- =============================================================================

create table if not exists public.responses_tool_states (
  response_id       text primary key,
  user_id           text,
  provider_id       text,
  model             text,
  route             text not null default '/v1/responses',
  -- AES-256-GCM envelope: v1:iv:tag:ciphertext (RESPONSES_STATE_ENCRYPTION_KEY)
  state_ciphertext  text not null,
  key_version       text not null default 'v1',
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

comment on table public.responses_tool_states is
  'P1095 encrypted Responses round1 tool-call state for previous_response_id resume. service_role only.';

comment on column public.responses_tool_states.state_ciphertext is
  'AES-256-GCM ciphertext of rebuild blob (originalInput, toolCalls, tools). Never plaintext prompts.';

create index if not exists responses_tool_states_expires_at_idx
  on public.responses_tool_states (expires_at);

create index if not exists responses_tool_states_created_at_idx
  on public.responses_tool_states (created_at desc);

alter table public.responses_tool_states enable row level security;

revoke all on table public.responses_tool_states from public, anon, authenticated;
grant select, insert, update, delete on table public.responses_tool_states to service_role;
