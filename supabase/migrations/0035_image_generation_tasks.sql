-- Image generation async tasks with customer-visible progress.
-- DMIT writes/reads via service_role; ownership enforced in API (user_id + auth tenant).

create table if not exists public.image_generation_tasks (
  id                 uuid primary key default gen_random_uuid(),
  request_id         text not null,
  user_id            uuid not null references auth.users (id) on delete cascade,
  api_key_id         uuid references public.api_keys (id) on delete set null,
  tenant_id          uuid references public.tenants (id) on delete set null,
  model              text not null,
  status             text not null default 'queued',
  progress           int not null default 0,
  message_en         text,
  message_zh         text,
  error_code         text,
  error_message      text,
  result_data        jsonb,
  usage              jsonb,
  credits_charged    numeric(20, 6) not null default 0,
  billing_status     text not null default 'pending',
  idempotency_key    text,
  endpoint           text not null default '/v1/images/generations',
  input_snapshot     jsonb not null default '{}'::jsonb,
  upstream_id        text,
  mode               text,
  prompt_mode        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  completed_at       timestamptz,

  constraint image_generation_tasks_request_id_unique unique (request_id),
  constraint image_generation_tasks_status_check check (
    status in (
      'queued',
      'validating',
      'billing_check',
      'requesting_model',
      'generating',
      'saving_result',
      'completed',
      'failed',
      'retryable_timeout'
    )
  ),
  constraint image_generation_tasks_progress_check check (
    progress >= 0 and progress <= 100
  ),
  constraint image_generation_tasks_billing_status_check check (
    billing_status in ('pending', 'charged', 'not_billable', 'failed', 'released')
  )
);

create index if not exists image_generation_tasks_user_id_created_at_idx
  on public.image_generation_tasks (user_id, created_at desc);

create index if not exists image_generation_tasks_tenant_user_idx
  on public.image_generation_tasks (tenant_id, user_id, created_at desc);

create index if not exists image_generation_tasks_status_idx
  on public.image_generation_tasks (status)
  where status in (
    'queued',
    'validating',
    'billing_check',
    'requesting_model',
    'generating',
    'saving_result'
  );

create unique index if not exists image_generation_tasks_idempotency_uidx
  on public.image_generation_tasks (api_key_id, idempotency_key, endpoint)
  where api_key_id is not null
    and idempotency_key is not null
    and length(idempotency_key) > 0;

alter table public.image_generation_tasks enable row level security;

comment on table public.image_generation_tasks is
  'Async image generation jobs with progress. DMIT service_role only; API enforces owner + tenant.';

comment on column public.image_generation_tasks.result_data is
  'Public result payload e.g. [{"url":"..."}]. Never store upstream provider hosts as metadata.';

comment on column public.image_generation_tasks.upstream_id is
  'Internal upstream task id — never return in public API responses.';

comment on column public.image_generation_tasks.error_message is
  'Safe customer-facing error text only — never upstream raw errors.';
