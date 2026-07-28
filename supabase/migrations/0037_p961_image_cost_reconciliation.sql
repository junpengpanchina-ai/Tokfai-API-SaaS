-- P961 — Image upstream cost reconciliation / orphan cost guard.
-- Persist provider task ids early; track reconcile + orphan-cost audit flags.
-- Does not alter Chat billing RPCs or P954 isolation.

alter table public.image_generation_tasks
  add column if not exists provider_task_id text,
  add column if not exists upstream_request_id text,
  add column if not exists upstream_submitted_at timestamptz,
  add column if not exists provider_status text,
  add column if not exists reconcile_status text,
  add column if not exists reconcile_result text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists orphan_cost_flags jsonb not null default '{}'::jsonb;

-- Backfill provider_task_id from legacy upstream_id when present.
update public.image_generation_tasks
set provider_task_id = upstream_id
where provider_task_id is null
  and upstream_id is not null
  and length(trim(upstream_id)) > 0;

create index if not exists image_generation_tasks_reconcile_pending_idx
  on public.image_generation_tasks (reconcile_status, updated_at)
  where reconcile_status in ('pending', 'in_progress')
    and (
      provider_task_id is not null
      or upstream_id is not null
    );

comment on column public.image_generation_tasks.provider_task_id is
  'P961 provider async task id — persist on upstream submit; never expose publicly.';

comment on column public.image_generation_tasks.upstream_request_id is
  'P961 upstream request correlation id (may equal provider_task_id).';

comment on column public.image_generation_tasks.reconcile_status is
  'P961: pending | in_progress | reconciled | orphan_alarm | skipped';

comment on column public.image_generation_tasks.reconcile_result is
  'P961 last reconcile outcome e.g. later_completed | provider_failed | hard_timeout | still_pending';

comment on column public.image_generation_tasks.orphan_cost_flags is
  'P961 orphan_cost_audit alarm flags (provider_success_unpaid, charged_missing_url, stale_timeout_pending).';
