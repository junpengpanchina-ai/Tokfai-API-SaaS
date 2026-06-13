-- P763 — Batch queue hardening: attempt_count, cancelled item statuses

alter table public.chat_batch_items
  add column if not exists attempt_count int not null default 0;

alter table public.chat_batch_items
  drop constraint if exists chat_batch_items_status_check;

alter table public.chat_batch_items
  add constraint chat_batch_items_status_check check (
    status in (
      'pending',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'cancel_requested'
    )
  );

comment on column public.chat_batch_items.attempt_count is
  'Number of upstream completion attempts (includes retries).';
