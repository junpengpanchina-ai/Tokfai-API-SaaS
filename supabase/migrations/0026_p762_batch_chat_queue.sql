-- P762 — Batch chat queue MVP (DMIT writes via service_role; no frontend policies)

create table if not exists public.chat_batches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  api_key_id       uuid references public.api_keys (id) on delete set null,
  model            text not null,
  requested_model  text not null,
  status           text not null default 'pending',
  total_items      int not null,
  succeeded_items  int not null default 0,
  failed_items     int not null default 0,
  credits_charged  numeric(12, 6) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,

  constraint chat_batches_status_check check (
    status in (
      'pending',
      'running',
      'completed',
      'failed',
      'partial_failed',
      'cancelled'
    )
  ),
  constraint chat_batches_total_items_positive check (total_items > 0)
);

create index if not exists chat_batches_user_id_created_at_idx
  on public.chat_batches (user_id, created_at desc);

create index if not exists chat_batches_status_idx
  on public.chat_batches (status)
  where status in ('pending', 'running');

create table if not exists public.chat_batch_items (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.chat_batches (id) on delete cascade,
  index            int not null,
  status           text not null default 'pending',
  input            jsonb not null,
  output           jsonb,
  error_code       text,
  error_message    text,
  request_id       text,
  credits_charged  numeric(12, 6) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,

  constraint chat_batch_items_status_check check (
    status in ('pending', 'running', 'succeeded', 'failed')
  ),
  constraint chat_batch_items_batch_index_unique unique (batch_id, index)
);

create index if not exists chat_batch_items_batch_id_index_idx
  on public.chat_batch_items (batch_id, index);

create index if not exists chat_batch_items_batch_id_status_idx
  on public.chat_batch_items (batch_id, status);

alter table public.chat_batches      enable row level security;
alter table public.chat_batch_items  enable row level security;

comment on table public.chat_batches is
  'Batch chat jobs. DMIT writes and reads via service_role; owner checks in API.';

comment on table public.chat_batch_items is
  'Per-item rows for chat_batches. One upstream completion attempt per row.';
