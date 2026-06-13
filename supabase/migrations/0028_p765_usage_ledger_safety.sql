-- P765 — Usage ledger safety: billing_status, idempotency, debit linkage

alter table public.usage_logs
  add column if not exists idempotency_key text,
  add column if not exists endpoint text,
  add column if not exists debit_ledger_id uuid references public.credit_ledger (id),
  add column if not exists billing_status text not null default 'not_billable',
  add column if not exists billing_error text,
  add column if not exists response_snapshot jsonb;

alter table public.usage_logs
  drop constraint if exists usage_logs_billing_status_check;

alter table public.usage_logs
  add constraint usage_logs_billing_status_check check (
    billing_status in (
      'not_billable',
      'pending',
      'charged',
      'failed',
      'reversed'
    )
  );

create unique index if not exists usage_logs_idempotency_charged_idx
  on public.usage_logs (api_key_id, idempotency_key, endpoint)
  where api_key_id is not null
    and idempotency_key is not null
    and endpoint is not null
    and billing_status = 'charged';

create unique index if not exists credit_ledger_debit_ref_idx
  on public.credit_ledger (reference_id)
  where type = 'debit'
    and reference_id is not null;

comment on column public.usage_logs.idempotency_key is
  'Client Idempotency-Key scoped per api_key_id + endpoint.';

comment on column public.usage_logs.debit_ledger_id is
  'credit_ledger.id for the debit row tied to this usage log (when charged).';

comment on column public.usage_logs.billing_status is
  'Ledger lifecycle: not_billable, pending, charged, failed, reversed.';

comment on column public.usage_logs.response_snapshot is
  'Cached API response for idempotent replays (chat/batch success only).';

-- Lookup prior successful debit for idempotent replay.
create or replace function public.lookup_usage_idempotency(
  p_api_key_id uuid,
  p_idempotency_key text,
  p_endpoint text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.usage_logs%rowtype;
begin
  if p_api_key_id is null
     or p_idempotency_key is null
     or length(trim(p_idempotency_key)) = 0
     or p_endpoint is null
     or length(trim(p_endpoint)) = 0 then
    return null;
  end if;

  select *
    into v_row
    from public.usage_logs
   where api_key_id = p_api_key_id
     and idempotency_key = p_idempotency_key
     and endpoint = p_endpoint
     and billing_status = 'charged'
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'request_id', v_row.request_id,
    'credits_charged', v_row.credits_charged,
    'debit_ledger_id', v_row.debit_ledger_id,
    'response_snapshot', v_row.response_snapshot
  );
end;
$$;

revoke all on function public.lookup_usage_idempotency(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.lookup_usage_idempotency(uuid, text, text)
  to service_role;

create or replace function public.record_usage_and_debit(
  p_user_id             uuid,
  p_api_key_id          uuid,
  p_model               text,
  p_prompt_tokens       int,
  p_completion_tokens   int,
  p_total_tokens        int,
  p_credits_charged     numeric,
  p_request_id          text,
  p_upstream_id         text,
  p_latency_ms          int,
  p_billable            boolean default true,
  p_finish_reason       text default null,
  p_upstream_status     int default null,
  p_upstream_error_code text default null,
  p_safety_reason       text default null,
  p_idempotency_key     text default null,
  p_endpoint            text default null,
  p_response_snapshot   jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance       numeric;
  v_new_balance   numeric;
  v_ledger_id     uuid;
  v_existing      jsonb;
  v_billing_status text := 'charged';
begin
  if p_credits_charged is null or p_credits_charged < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  v_existing := public.lookup_usage_idempotency(
    p_api_key_id,
    p_idempotency_key,
    p_endpoint
  );

  if v_existing is not null then
    select credits_balance
      into v_balance
      from public.profiles
     where id = p_user_id;

    return v_existing || jsonb_build_object(
      'balance_after', coalesce(v_balance, 0),
      'idempotent_replay', true
    );
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if v_balance < p_credits_charged then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_new_balance := v_balance - p_credits_charged;

  if p_credits_charged > 0 then
    update public.profiles set
      credits_balance     = v_new_balance,
      total_credits_used  = total_credits_used + p_credits_charged,
      updated_at          = now()
    where id = p_user_id;

    insert into public.credit_ledger (
      user_id,
      type,
      amount,
      balance_after,
      reason,
      reference_id
    )
    values (
      p_user_id,
      'debit',
      -p_credits_charged,
      v_new_balance,
      'Chat completion usage',
      p_request_id
    )
    returning id into v_ledger_id;
  else
    v_billing_status := 'not_billable';
  end if;

  insert into public.usage_logs (
    user_id,
    api_key_id,
    model,
    status,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    credits_charged,
    request_id,
    upstream_id,
    error_code,
    error_message,
    latency_ms,
    billable,
    finish_reason,
    upstream_status,
    upstream_error_code,
    safety_reason,
    idempotency_key,
    endpoint,
    debit_ledger_id,
    billing_status,
    response_snapshot
  )
  values (
    p_user_id,
    p_api_key_id,
    p_model,
    'succeeded',
    p_prompt_tokens,
    p_completion_tokens,
    p_total_tokens,
    p_credits_charged,
    p_request_id,
    p_upstream_id,
    null,
    null,
    p_latency_ms,
    coalesce(p_billable, true),
    p_finish_reason,
    p_upstream_status,
    p_upstream_error_code,
    p_safety_reason,
    nullif(trim(p_idempotency_key), ''),
    nullif(trim(p_endpoint), ''),
    v_ledger_id,
    v_billing_status,
    p_response_snapshot
  );

  return jsonb_build_object(
    'balance_after', v_new_balance,
    'debit_ledger_id', v_ledger_id,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int
) from public, anon, authenticated;

revoke all on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int,
  boolean, text, int, text, text
) from public, anon, authenticated;

revoke all on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int,
  boolean, text, int, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.record_usage_and_debit(
  uuid, uuid, text, int, int, int, numeric, text, text, int,
  boolean, text, int, text, text, text, text, jsonb
) to service_role;

-- Ops CLI adjustments (service_role only). Writes credit_ledger adjustment rows.
create or replace function public.ops_ledger_adjustment(
  p_user_id               uuid,
  p_kind                  text,
  p_amount                numeric,
  p_note                  text,
  p_reference_request_id  text default null,
  p_idempotency_key       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance       numeric;
  v_new_balance   numeric;
  v_signed_amount numeric;
  v_reference_id  text;
  v_ledger_id     uuid;
  v_existing_id   uuid;
begin
  if p_kind is distinct from 'grant' and p_kind is distinct from 'reverse' then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_note');
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
  end if;

  v_reference_id := 'ops_' || p_kind || ':' || trim(p_idempotency_key);

  select id
    into v_existing_id
    from public.credit_ledger
   where type = 'adjustment'
     and reference_id = v_reference_id
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'credit_ledger_id', v_existing_id,
      'reference_id', v_reference_id
    );
  end if;

  v_signed_amount := case when p_kind = 'grant' then p_amount else -p_amount end;

  select credits_balance
    into v_balance
    from public.profiles
   where id = p_user_id
   for update;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  v_new_balance := v_balance + v_signed_amount;

  if v_new_balance < 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits');
  end if;

  update public.profiles
     set credits_balance = v_new_balance,
         total_credits_purchased = case
           when p_kind = 'grant' then total_credits_purchased + p_amount
           else total_credits_purchased
         end,
         updated_at = now()
   where id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    type,
    amount,
    balance_after,
    reason,
    reference_id
  )
  values (
    p_user_id,
    'adjustment',
    v_signed_amount,
    v_new_balance,
    left(
      coalesce(p_note, '') ||
        case
          when p_reference_request_id is not null
            then ' [request_id=' || p_reference_request_id || ']'
          else ''
        end,
      500
    ),
    v_reference_id
  )
  returning id into v_ledger_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'credit_ledger_id', v_ledger_id,
    'reference_id', v_reference_id,
    'balance_after', v_new_balance
  );
end;
$$;

revoke all on function public.ops_ledger_adjustment(
  uuid, text, numeric, text, text, text
) from public, anon, authenticated;

grant execute on function public.ops_ledger_adjustment(
  uuid, text, numeric, text, text, text
) to service_role;
