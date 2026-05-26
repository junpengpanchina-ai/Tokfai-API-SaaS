-- =============================================================================
-- Tokfai Admin V1 — P1 credits manual adjustment
--
-- Adds public.admin_adjust_credits RPC:
--   - Atomic profiles + credit_ledger + admin_audit_logs
--   - Idempotent via admin_audit_logs (actor_user_id, idempotency_key)
--   - service_role only (DMIT)
--
-- Out of scope (unchanged):
--   debit_credits, credit_purchase, complete_credit_order, Stripe webhook
-- =============================================================================

create or replace function public.admin_adjust_credits(
  p_actor_user_id    uuid,
  p_actor_email      text,
  p_target_user_id   uuid,
  p_amount           numeric,
  p_direction        text,
  p_reason           text,
  p_idempotency_key  text,
  p_ip_address       text default null,
  p_user_agent       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing         public.admin_audit_logs%rowtype;
  v_balance          numeric;
  v_signed_amount    numeric;
  v_new_balance      numeric;
  v_reference_id     text;
  v_ledger_id        uuid;
  v_audit_id         uuid;
  v_request_payload  jsonb;
  v_result           jsonb;
  v_now              timestamptz := now();
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );

  select *
    into v_existing
    from public.admin_audit_logs
   where actor_user_id = p_actor_user_id
     and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.result_payload is not null then
      return v_existing.result_payload || jsonb_build_object('idempotent_replay', true);
    end if;
    raise exception 'idempotency_conflict' using errcode = '23505';
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_direction is distinct from 'add' and p_direction is distinct from 'deduct' then
    return jsonb_build_object('ok', false, 'error', 'invalid_direction');
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_reason');
  end if;

  if length(p_reason) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
  end if;

  if length(p_idempotency_key) > 128 then
    return jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key');
  end if;

  v_signed_amount := case when p_direction = 'add' then p_amount else -p_amount end;

  v_request_payload := jsonb_build_object(
    'user_id', p_target_user_id,
    'amount', p_amount,
    'direction', p_direction,
    'reason', p_reason
  );

  select credits_balance
    into v_balance
    from public.profiles
   where id = p_target_user_id
   for update;

  if v_balance is null then
    v_result := jsonb_build_object(
      'ok', false,
      'error', 'target_user_not_found'
    );

    insert into public.admin_audit_logs (
      actor_user_id,
      actor_email,
      action,
      resource_type,
      resource_id,
      idempotency_key,
      request_payload,
      status,
      result_payload,
      ip_address,
      user_agent,
      completed_at
    ) values (
      p_actor_user_id,
      lower(trim(p_actor_email)),
      'credits.adjust',
      'profile',
      p_target_user_id::text,
      p_idempotency_key,
      v_request_payload,
      'failed',
      v_result,
      p_ip_address,
      p_user_agent,
      v_now
    );

    return v_result;
  end if;

  if p_direction = 'deduct' and v_balance < p_amount then
    v_result := jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'current_credits', v_balance,
      'requested_amount', p_amount
    );

    insert into public.admin_audit_logs (
      actor_user_id,
      actor_email,
      action,
      resource_type,
      resource_id,
      idempotency_key,
      request_payload,
      status,
      result_payload,
      ip_address,
      user_agent,
      completed_at
    ) values (
      p_actor_user_id,
      lower(trim(p_actor_email)),
      'credits.adjust',
      'profile',
      p_target_user_id::text,
      p_idempotency_key,
      v_request_payload,
      'failed',
      v_result,
      p_ip_address,
      p_user_agent,
      v_now
    );

    return v_result;
  end if;

  v_new_balance := v_balance + v_signed_amount;
  v_reference_id := 'admin_adjustment:' || gen_random_uuid()::text;

  update public.profiles
     set credits_balance = v_new_balance,
         updated_at = v_now
   where id = p_target_user_id;

  insert into public.credit_ledger (
    user_id,
    type,
    amount,
    balance_after,
    reason,
    reference_id
  ) values (
    p_target_user_id,
    'adjustment',
    v_signed_amount,
    v_new_balance,
    p_reason,
    v_reference_id
  )
  returning id into v_ledger_id;

  v_result := jsonb_build_object(
    'ok', true,
    'user_id', p_target_user_id,
    'previous_credits', v_balance,
    'delta', v_signed_amount,
    'credits', v_new_balance,
    'balance_after', v_new_balance,
    'reason', p_reason,
    'reference_id', v_reference_id,
    'credit_ledger_id', v_ledger_id,
    'idempotent_replay', false
  );

  insert into public.admin_audit_logs (
    actor_user_id,
    actor_email,
    action,
    resource_type,
    resource_id,
    idempotency_key,
    request_payload,
    status,
    result_payload,
    credit_ledger_id,
    ip_address,
    user_agent,
    completed_at
  ) values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'credits.adjust',
    'profile',
    p_target_user_id::text,
    p_idempotency_key,
    v_request_payload,
    'succeeded',
    v_result,
    v_ledger_id,
    p_ip_address,
    p_user_agent,
    v_now
  )
  returning id into v_audit_id;

  return v_result || jsonb_build_object('admin_audit_log_id', v_audit_id);
end;
$$;

comment on function public.admin_adjust_credits(
  uuid, text, uuid, numeric, text, text, text, text, text
) is
  'Atomic admin credit adjustment. Idempotent per (actor_user_id, idempotency_key). DMIT service_role only.';

revoke all on function public.admin_adjust_credits(
  uuid, text, uuid, numeric, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.admin_adjust_credits(
  uuid, text, uuid, numeric, text, text, text, text, text
) to service_role;
