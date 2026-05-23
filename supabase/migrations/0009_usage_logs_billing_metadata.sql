-- usage_logs billing / upstream metadata for chat completions

alter table public.usage_logs
  add column if not exists billable boolean not null default false,
  add column if not exists finish_reason text,
  add column if not exists upstream_status int,
  add column if not exists upstream_error_code text,
  add column if not exists safety_reason text;

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
  p_safety_reason       text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance     numeric;
  v_new_balance numeric;
begin
  if p_credits_charged is null or p_credits_charged < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
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
    );
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
    safety_reason
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
    p_safety_reason
  );

  return v_new_balance;
end;
$$;

revoke all on function public.record_usage_and_debit(
  uuid,
  uuid,
  text,
  int,
  int,
  int,
  numeric,
  text,
  text,
  int
) from public, anon, authenticated;

revoke all on function public.record_usage_and_debit(
  uuid,
  uuid,
  text,
  int,
  int,
  int,
  numeric,
  text,
  text,
  int,
  boolean,
  text,
  int,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_usage_and_debit(
  uuid,
  uuid,
  text,
  int,
  int,
  int,
  numeric,
  text,
  text,
  int,
  boolean,
  text,
  int,
  text,
  text
) to service_role;
